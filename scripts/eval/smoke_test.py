#!/usr/bin/env python3
"""연기 테스트 — 사람 판정이 채워진 뒤에 타는 채점 코드가 끝까지 도는지, 방향이 맞는지 가짜 판정으로 확인한다.

    DATABASE_DSN=<로컬 DSN> python3 scripts/eval/smoke_test.py

진짜 판정 파일과 결과 폴더는 **건드리지 않는다**: 판정 파일은 임시 폴더로 복사해 가짜로 채우고, 모듈이 읽는 경로와
결과 출력 폴더(`common.results_dir`)를 임시 폴더로 돌린다. 끝나면 진짜 결과 폴더가 그대로인지 확인한다.
통계 자체의 정확성은 test_stats.py 가 따로 검증한다. 여기서는 (1) 에러 없이 끝나는가 (2) 극단 입력에서 멈추지 않는가
(3) 결과의 방향이 상식과 맞는가(완벽한 판정이면 일치도 1, 무작위 판정이면 기준선 수준)만 본다.
"""
from __future__ import annotations

import asyncio
import csv
import json
import random
import shutil
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).parent))
import common  # noqa: E402
from common import EVAL_DIR  # noqa: E402

RESULTS_REAL = EVAL_DIR / "results"
TMP = Path(tempfile.mkdtemp(prefix="eval-smoke-"))
OUT = TMP / "results"
OUT.mkdir()
common.results_dir = lambda: OUT          # 모든 dump_json 이 임시 폴더로 간다
rng = random.Random(7)
LOOP = asyncio.new_event_loop()      # 비동기 DB 엔진이 하나의 이벤트 루프에 묶이므로 OCR 테스트 전체가 같은 루프를 쓴다
passed, failed = [], []


def snapshot():
    return sorted(str(p.relative_to(RESULTS_REAL)) + str(p.stat().st_mtime_ns) for p in RESULTS_REAL.rglob("*") if p.is_file())


def check(name, cond, detail=""):
    (passed if cond else failed).append(name)
    print(("  ok   " if cond else "  FAIL ") + name + (f"  ({detail})" if detail and not cond else ""))


def read_rows(path, enc="utf-8-sig"):
    with open(path, encoding=enc) as fh:
        rows = list(csv.DictReader(fh))
    return rows, list(rows[0].keys())


def write_rows(path, rows, fields):
    with open(path, "w", newline="", encoding="utf-8-sig") as fh:
        w = csv.DictWriter(fh, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)


def load_json(name):
    return json.loads((OUT / name).read_text(encoding="utf-8"))


# ───────────────────────── A. 유사도 ─────────────────────────

def test_similarity():
    print("\n[A 유사도]")
    import similarity as m
    pool, fields = read_rows(EVAL_DIR / "similarity_test_pool.csv")
    methods, _ = read_rows(EVAL_DIR / "similarity_test_methods.csv")
    meth = {(r["seed_id"], r["cand_id"]): r["methods"] for r in methods}
    m.TEST_METHODS = TMP / "sim_methods.csv"
    shutil.copy(EVAL_DIR / "similarity_test_methods.csv", m.TEST_METHODS)

    def run(grade_of, label, frac=1.0):
        rows = [dict(r) for r in pool]
        for i, r in enumerate(rows):
            # frac<1 이면 결정적으로 비운다(15행마다 1행 = 6.7% 공란 → 93.3% 채움)
            r["grade"] = "" if (frac < 1.0 and i % 15 == 0) else str(grade_of(r))
        m.TEST_POOL = TMP / "sim_pool.csv"
        write_rows(m.TEST_POOL, rows, fields)
        try:
            m.cmd_score(SimpleNamespace())
            return load_json("similarity.json")
        except Exception as exc:  # noqa: BLE001
            check(f"A {label}: 예외 없이 끝남", False, repr(exc)[:200])
            return None

    # 방법을 아는 '신탁' 판정: hybrid 후보는 2, tfidf 만 낸 후보는 1, 그 밖(평점순·무작위)은 0
    def oracle(r):
        ms = meth[(r["seed_id"], r["cand_id"])]
        return 2 if "hybrid" in ms else (1 if "tfidf" in ms else 0)
    o = run(oracle, "신탁 판정")
    if o:
        t = o.get("test")
        check("A 신탁: test 지표가 나옴", bool(t))
        if t:
            check("A 신탁: hybrid > 무작위 (쌍체 95% 구간 하한 > 0)", o["test_paired_ndcg10"]["hybrid_vs_random"]["lo"] > 0)
            check("A 신탁: hybrid nDCG@5 ≈ 1", t["hybrid"]["ndcg5"]["mean"] > 0.95, str(t["hybrid"]["ndcg5"]["mean"]))
            check("A 신탁: 무작위 nDCG@5 < hybrid", t["random"]["ndcg5"]["mean"] < t["hybrid"]["ndcg5"]["mean"])
            check("A 신탁: 캘리브레이션 구간이 나옴", bool(o.get("calibration_served")))
            check("A 신탁: 모든 수치가 유한", all(v == v for d in t.values() for k in ("ndcg5", "ndcg10", "p5") for v in [d[k]["mean"]] if v is not None) )
    # 극단: 전부 0 (이상적 DCG 가 0 → nDCG 정의 불가) — 멈추지 않아야 한다
    z = run(lambda r: 0, "전부 0")
    check("A 전부 0: 끝까지 돌고 test 항목이 있음", bool(z) and "test" in z)
    # 극단: 전부 2
    run(lambda r: 2, "전부 2")
    check("A 전부 2: 예외 없음", "A 전부 2: 예외 없이 끝남" not in failed)
    # 판정이 94%만 채워짐 → 지표를 내면 안 된다
    p = run(oracle, "93% 채움", frac=0.93)
    check("A 93% 채움: test 지표를 내지 않음(95% 미만 가드)", bool(p) and "test" not in p)
    # 무작위 판정: 방식 간 차이가 없다고 나와야 한다(구간이 0 을 포함)
    rr = run(lambda r: rng.choice([0, 1, 2]), "무작위 판정")
    if rr and rr.get("test_paired_ndcg10"):
        d = rr["test_paired_ndcg10"]["hybrid_vs_random"]
        check("A 무작위 판정: hybrid vs 무작위 구간이 0 을 포함", d["lo"] <= 0 <= d["hi"], str(d))
    run(oracle, "마무리(정상 판정)")      # 리포트 단계가 정상 결과를 읽도록 마지막에 정상 시나리오를 둔다


# ───────────────────────── B. 궁합 ─────────────────────────

def test_skin_fit():
    print("\n[B 궁합]")
    import skin_fit as m
    from app.services.skin_fit import evaluate
    pool, fields = read_rows(EVAL_DIR / "skin_fit_test_pool.csv")
    conn = common.connect()
    cur = conn.cursor()
    labels = m.load_labels(cur)
    docs, poss = m.load_docs(cur)
    col = "grade_적합_보통_주의"
    ko = m.VERDICT_KO

    def model_verdict(r):
        v = evaluate(docs.get(int(r["product_id"]), []), labels, {}, r["skin_type"], None, poss.get(int(r["product_id"]))).verdict
        return ko.get(v, "보통")

    m.TEST_POOL = TMP / "sf_pool.csv"
    review_src = m.REVIEW
    m.REVIEW = TMP / "review.csv"
    rows, rf = read_rows(review_src)
    for i, r in enumerate(rows):
        r["verdict"] = "맞음" if i % 5 else "틀림"
    write_rows(m.REVIEW, rows, rf)

    def run(fn, label):
        rs = [dict(r) for r in pool]
        for r in rs:
            r[col] = fn(r)
        write_rows(m.TEST_POOL, rs, fields)
        try:
            m.cmd_score(SimpleNamespace())
            return load_json("skin_fit.json")
        except Exception as exc:  # noqa: BLE001
            check(f"B {label}: 예외 없이 끝남", False, repr(exc)[:200])
            return None

    o = run(model_verdict, "모델과 같은 판정")
    if o and o.get("output"):
        out = o["output"]
        check("B 완벽 일치: 정확도 1", out["accuracy"]["p"] == 1.0, str(out["accuracy"]))
        check("B 완벽 일치: 위험 방향 오류 0", out["danger_caution_to_good"]["k"] == 0)
        check("B 완벽 일치: 가중 kappa ≈ 1 (또는 단일 등급이라 정의 불가로 1 반환)", out["weighted_kappa_quadratic"] is None or out["weighted_kappa_quadratic"] > 0.99, str(out["weighted_kappa_quadratic"]))
        check("B 성분 라벨 검수가 집계됨", bool(o.get("label_review", {}).get("judged")))
        lr = o["label_review"]
        check("B 라벨 정밀도 ≈ 0.8 (가짜 검수 4/5 맞음)", abs(lr.get("precision", 0) - 0.8) < 0.02, str(lr.get("precision")))
    else:
        check("B 완벽 일치: output 이 나옴", False)
    # 위험 방향 만들기: 모델이 '적합'인 쌍은 사람이 '주의'라고 한 것으로
    d = run(lambda r: "주의" if model_verdict(r) == "적합" else model_verdict(r), "위험 방향 판정")
    if d and d.get("output"):
        k = d["output"]["danger_caution_to_good"]["k"]
        n_good = sum(1 for r in pool if model_verdict(r) == "적합")
        check("B 위험 방향: 사람 '주의' → 모델 '적합' 이 집계됨", k == n_good and k > 0, f"{k} vs {n_good}")
    # 전부 '보통' → 기준선(항상 보통) 정확도와 같아야 한다
    u = run(lambda r: "보통", "전부 보통")
    if u and u.get("output"):
        check("B 전부 보통: 기준선 정확도 = 1.0", u["output"]["baseline_always_ok"]["p"] == 1.0)
    # 일부만 채움 (80%) → 가드
    part = run(lambda r: "보통" if rng.random() < 0.8 else "", "80% 채움")
    check("B 80% 채움: output 을 내지 않음", bool(part) and "output" not in part)
    run(model_verdict, "마무리(정상 판정)")
    m.REVIEW = review_src


# ───────────────────────── C. 진단 페르소나 ─────────────────────────

def test_personas():
    print("\n[C 진단 페르소나]")
    import diagnosis as m
    conn = common.connect()
    weights, qs = m.load_quiz(conn.cursor())
    codes = list(qs)
    opts = [sorted(qs[c]["options"]) for c in codes]

    def make(n, n_wrong):
        rows = []
        for i in range(n):
            ans = {c: rng.choice(o) for c, o in zip(codes, opts)}
            t, _b, _r = m.classify(ans, weights)
            if i < n_wrong:
                t = rng.choice([x for x in m.PROFILES if x != t])
            rows.append({"persona_text": f"가짜 페르소나 {i}", "expected_type": t, **{c: str(ans[c]) for c in codes}})
        return rows

    m.PERSONAS = TMP / "personas.csv"
    fields = ["persona_text", "expected_type"] + codes
    for n, wrong, label in ((30, 0, "전부 일치"), (30, 30, "전부 불일치(1순위 기준)"), (30, 10, "일부 불일치"), (3, 0, "3개뿐")):
        write_rows(m.PERSONAS, make(n, wrong), fields)
        try:
            asyncio.run(asyncio.sleep(0)) if False else m.cmd_personas(SimpleNamespace())
            o = load_json("diagnosis_personas.json")
        except Exception as exc:  # noqa: BLE001
            check(f"C {label}: 예외 없이 끝남", False, repr(exc)[:200])
            continue
        if label == "전부 일치":
            check("C 전부 일치: top-1 = 100%", o["top1"]["p"] == 1.0)
        if label.startswith("전부 불일치"):
            check("C 전부 불일치: top-1 = 0% 이고 top-3 은 ≥ 0", o["top1"]["p"] == 0.0 and o["top3"]["p"] >= 0.0)
        if label == "일부 불일치":
            check("C 일부 불일치: top-1 ≈ 67%", abs(o["top1"]["p"] - 20 / 30) < 0.001, str(o["top1"]["p"]))
    write_rows(m.PERSONAS, make(30, 6), fields)
    m.cmd_personas(SimpleNamespace())            # 리포트용 정상 결과를 마지막에 둔다
    keep = load_json("diagnosis_personas.json")
    # 빈 파일(헤더만)
    write_rows(m.PERSONAS, [], fields) if False else m.PERSONAS.write_text(",".join(fields) + "\n", encoding="utf-8-sig")
    try:
        m.cmd_personas(SimpleNamespace())
        check("C 빈 페르소나 파일: 멈추지 않음", True)
    except Exception as exc:  # noqa: BLE001
        check("C 빈 페르소나 파일: 멈추지 않음", False, repr(exc)[:200])
    (OUT / "diagnosis_personas.json").write_text(json.dumps(keep, ensure_ascii=False), encoding="utf-8")


# ───────────────────────── E. OCR ─────────────────────────

def test_ocr():
    print("\n[E OCR]")
    import ocr as m
    cache = m.load_cache()
    labels_dev = m.load_labels()
    res = LOOP.run_until_complete(m.match_all(cache))
    test_items = [n for n, _ in m.fronts() if n not in m.DEV_ITEMS]
    m.LABELS_TEST = TMP / "labels_test.csv"
    # 가짜 라벨: 매칭 1위 결과를 정답으로 삼는 항목(양성)과 '없음'(음성)을 섞는다
    rows = []
    for k, n in enumerate(test_items):
        c = res.get(f"item{n}_f", {}).get("cands", [])
        if c and k % 3:
            rows.append({"item": f"item{n}", "in_catalog": "Y", "product_ids": "|".join(map(str, c[0]["ids"])), "label": "가짜"})
        else:
            rows.append({"item": f"item{n}", "in_catalog": "N", "product_ids": "", "label": "가짜"})
    write_rows(m.LABELS_TEST, rows, ["item", "in_catalog", "product_ids", "label"])
    try:
        LOOP.run_until_complete(m.cmd_score(SimpleNamespace()))
        o = load_json("ocr.json")
        check("E test 지표가 나옴", bool(o.get("test")))
        if o.get("test"):
            t = o["test"]
            check("E 정답=1위 로 만든 라벨이라 top-1 = 100%", t["top1"]["p"] == 1.0, str(t["top1"]))
            check("E AUROC 와 신뢰구간이 나옴", "auroc" in t and t["auroc_lo"] <= t["auroc"] <= t["auroc_hi"], str({k: t.get(k) for k in ("auroc", "auroc_lo", "auroc_hi")}))
            check("E 임계값이 dev 값 그대로 쓰임", t.get("threshold") == o["dev"].get("threshold"))
    except Exception as exc:  # noqa: BLE001
        check("E 예외 없이 끝남", False, repr(exc)[:200])
    keep_ocr = (OUT / "ocr.json").read_text(encoding="utf-8")
    # in_catalog 비어 있는 행은 '없음'으로 오해하지 않고 미라벨로 센다
    rows[0]["in_catalog"] = ""
    rows[0]["product_ids"] = ""
    write_rows(m.LABELS_TEST, rows, ["item", "in_catalog", "product_ids", "label"])
    LOOP.run_until_complete(m.cmd_score(SimpleNamespace()))
    o = load_json("ocr.json")
    check("E in_catalog 빈칸 = 미라벨(음성으로 세지 않음)", o["test_items_unlabeled"] == 1 and o.get("test") is None, str(o["test_items_unlabeled"]))
    (OUT / "ocr.json").write_text(keep_ocr, encoding="utf-8")        # 리포트용 정상 결과 복원


# ───────────────────────── F. 챗봇 사람 채점 ─────────────────────────

def test_human_chat():
    print("\n[F 챗봇 사람 채점]")
    import chat as m
    pool, fields = read_rows(EVAL_DIR / "chat_human_pool.csv")
    m.HUMAN_POOL = TMP / "human.csv"
    rows = [dict(r) for r in pool]
    for r in rows:
        r["정확성_1to5"], r["유용성_1to5"] = str(rng.randint(1, 5)), str(rng.randint(1, 5))
    write_rows(m.HUMAN_POOL, rows, fields)
    try:
        m.cmd_human_score(SimpleNamespace())
        o = load_json("chat_human.json")
        check("F 사람 채점 평균·구간이 나옴", o["judged"] == len(rows) and 1 <= o["accuracy_mean"]["mean"] <= 5)
    except Exception as exc:  # noqa: BLE001
        check("F 예외 없이 끝남", False, repr(exc)[:200])
    for r in rows:
        r["정확성_1to5"] = r["유용성_1to5"] = ""
    write_rows(m.HUMAN_POOL, rows, fields)
    try:
        m.cmd_human_score(SimpleNamespace())
        check("F 채점 0건: 멈추지 않음", True)
    except Exception as exc:  # noqa: BLE001
        check("F 채점 0건: 멈추지 않음", False, repr(exc)[:200])


# ───────────────────────── 리포트 ─────────────────────────

def test_report():
    print("\n[리포트]")
    import build_report as br
    # 위에서 만든 가짜 결과 + 실제로 있는 자동 결과(불변식·예산·구조·챗봇)를 임시 폴더에 합친다
    real = max((p for p in RESULTS_REAL.iterdir() if p.is_dir()), key=lambda p: p.name)
    for name in ("skin_fit_invariants.json", "budget.json", "diagnosis_structure.json", "chat.json"):
        if not (OUT / name).exists() and (real / name).exists():
            shutil.copy(real / name, OUT / name)
    br.RES = TMP / "res_root"
    (br.RES / "smoke").mkdir(parents=True)
    for f in OUT.iterdir():
        shutil.copy(f, br.RES / "smoke" / f.name)
    try:
        html = br.build("smoke")
        check("리포트: HTML 이 만들어짐", html.startswith("<!doctype html>") and len(html) > 5000)
        check("리포트: 합격선 판정 표에 '대기'가 거의 없음(가짜 판정으로 채웠으므로)", html.count('class="bd wait"') <= 2, f'대기 {html.count(chr(34).join(["class=", "bd wait"]))}개')
        check("리포트: 모든 섹션 제목이 있음", all(f'id="{k}"' in html for k in "abcdef"))
        (TMP / "report.html").write_text(html, encoding="utf-8")
    except Exception as exc:  # noqa: BLE001
        check("리포트: 예외 없이 끝남", False, repr(exc)[:200])


if __name__ == "__main__":
    before = snapshot()
    only = set(sys.argv[1:])
    try:
        for name, fn in (("a", test_similarity), ("b", test_skin_fit), ("c", test_personas), ("e", test_ocr), ("f", test_human_chat), ("r", test_report)):
            if not only or name in only:
                try:
                    fn()
                except Exception as exc:  # noqa: BLE001
                    import traceback
                    traceback.print_exc()
                    check(f"{name}: 테스트 자체가 예외로 중단", False, repr(exc)[:200])
    finally:
        intact = snapshot() == before
        check("진짜 결과 폴더(data/eval/results)가 그대로임", intact)
        print(f"\n통과 {len(passed)} · 실패 {len(failed)}   (임시 폴더: {TMP})")
        shutil.rmtree(TMP, ignore_errors=True)
    sys.exit(1 if failed else 0)
