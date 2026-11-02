#!/usr/bin/env python3
"""B. 제품 궁합(skin_fit) 평가 (PROTOCOL.md B절).

    DATABASE_DSN=<로컬 DSN> python3 scripts/eval/skin_fit.py invariants   # 자동: 전수 불변식·서비스 경로 일치
    DATABASE_DSN=<로컬 DSN> python3 scripts/eval/skin_fit.py pool         # 사람 판정용 120건(제품 40 × 타입 3)
    DATABASE_DSN=<로컬 DSN> python3 scripts/eval/skin_fit.py score        # 사람 판정 vs 모델, 라벨 검수 정밀도

정답은 모델과 독립이어야 한다. 사람은 **전성분 표기만 보고** 해당 피부타입에 적합/보통/주의를 판정한다(모델 판정은 숨김).
입력 라벨(ingredient_functions)의 정확도는 review_sample.csv 의 verdict 열을 사람이 채워 따로 잰다.
"""
from __future__ import annotations

import argparse
import csv
import random
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import common  # noqa: E402
from common import EVAL_DIR, REPO, SEED  # noqa: E402
import stats  # noqa: E402

from app.services.diagnosis import PROFILES  # noqa: E402
from app.services.skin_fit import AVOID, HARD_EXCLUDE_ALCOHOL, HARD_EXCLUDE_FRAGRANCE, PREFER, evaluate, hard_excluded, product_facts  # noqa: E402
from app.services.skin_type import SKIN_TYPE_LABELS  # noqa: E402
from compute_skin_fit import load_labels  # noqa: E402

TEST_POOL = EVAL_DIR / "skin_fit_test_pool.csv"
REVIEW = REPO / "data" / "seed" / "ingredient_functions" / "review_sample.csv"
JUDGE_TYPES = ["samak", "yuriguseul", "hwasan"]     # 건조 · 민감 · 트러블/홍조 — 기피 규칙이 가장 크게 갈리는 세 타입
VERDICT_KO = {"good": "적합", "ok": "보통", "caution": "주의"}
KO_VERDICT = {v: k for k, v in VERDICT_KO.items()}
AXIS_KO = {"moisture": "수분", "oil": "유분", "sensitivity": "민감도", "pigmentation": "색소", "trouble": "트러블"}


def load_docs(cur):
    """사전 계산 배치(compute_skin_fit)·카드 API 와 같은 입력 — 라벨 있는 성분만, 실제 position 과 함께."""
    cur.execute(
        """SELECT pi.product_id, array_agg(pi.ingredient_id ORDER BY pi.position),
                  array_agg(pi.position ORDER BY pi.position)
             FROM product_ingredients pi JOIN ingredient_functions f ON f.ingredient_id = pi.ingredient_id
            GROUP BY pi.product_id"""
    )
    docs, poss = {}, {}
    for pid, ings, ps in cur.fetchall():
        docs[pid], poss[pid] = list(ings), list(ps)
    return docs, poss


def _kappa_ci(t, p, reps: int = 5000):
    """가중 kappa 의 부트스트랩 95% 구간(제품×타입 쌍 단위 재표집, PROTOCOL 5,000회·seed 고정)."""
    rng = random.Random(SEED)
    n = len(t)
    vals = []
    for _ in range(reps):
        idx = [rng.randrange(n) for _ in range(n)]
        try:
            vals.append(stats.cohen_kappa([t[i] for i in idx], [p[i] for i in idx], "quadratic"))
        except Exception:
            continue
    vals.sort()
    return [vals[int(0.025 * len(vals))], vals[int(0.975 * len(vals)) - 1]] if vals else None


def cmd_invariants(_a) -> None:
    conn = common.connect()
    cur = conn.cursor()
    labels = load_labels(cur)
    docs, poss = load_docs(cur)
    cur.execute("select id from products order by id")
    pids = [p for (p,) in cur.fetchall()]
    cur.execute("select product_id, skin_type, score, verdict, excluded from product_skin_fit")
    served = {(p, t): (s, v, bool(e)) for p, t, s, v, e in cur.fetchall()}

    viol = Counter()
    good_causes: Counter = Counter()      # 하드 제외인데 '적합'으로 나온 쌍의 (타입, 제외 사유) 분포
    good_scores: list = []
    examples: dict[str, list] = {}
    dist = {t: Counter() for t in PREFER}
    checked = 0
    rng = random.Random(SEED)
    mono_pairs = 0

    def note(key, item):
        viol[key] += 1
        examples.setdefault(key, [])
        if len(examples[key]) < 5:
            examples[key].append(item)

    for pid in pids:
        doc = docs.get(pid, [])
        for t in PREFER:
            fit = evaluate(doc, labels, {}, t, None, poss.get(pid))
            checked += 1
            dist[t][fit.verdict] += 1
            # (1) 형식: 점수 범위·verdict 어휘·unknown 일 때만 점수 없음
            if fit.verdict not in ("good", "ok", "caution", "unknown"):
                note("bad_verdict", (pid, t, fit.verdict))
            if (fit.score is None) != (fit.verdict == "unknown"):
                note("score_none_mismatch", (pid, t, fit.score, fit.verdict))
            if fit.score is not None and not (0 <= fit.score <= 100):
                note("score_out_of_range", (pid, t, fit.score))
            # (2) 하드 제외 일관성: excluded 플래그는 제품 사실과 타입 규칙에서 결정된다
            frag, alc = product_facts(doc, labels)
            if fit.excluded != hard_excluded(t, frag, alc):
                note("excluded_flag_inconsistent", (pid, t))
            # (3) 하드 제외 제품이 '적합'으로 나오면 안 된다 — 사용자에게 가장 해로운 방향의 오류
            if fit.excluded and fit.verdict == "good":
                note("excluded_but_good", (pid, t, fit.score))
                _fr, _al = product_facts(doc, labels)
                _cause = "+".join(x for x, on in (("향료", _fr and t in HARD_EXCLUDE_FRAGRANCE), ("알코올", _al and t in HARD_EXCLUDE_ALCOHOL)) if on)
                good_causes[(t, _cause)] += 1
                good_scores.append(fit.score)
            # (4) 서비스 경로 일치: 배치 테이블(product_skin_fit)이 지금 코드의 재계산과 같은가
            s = served.get((pid, t))
            if s is None:
                note("missing_in_served_table", (pid, t))
            elif (s[0], s[1], s[2]) != (fit.score, fit.verdict, fit.excluded):
                note("served_table_differs", (pid, t, s, (fit.score, fit.verdict, fit.excluded)))
            # (5) 결정성
            if rng.random() < 0.02 and evaluate(doc, labels, {}, t, None, poss.get(pid)).score != fit.score:
                note("nondeterministic", (pid, t))
            # (6) 단조성(표본): 기피 플래그가 붙은 성분을 하나 빼면 점수가 내려가지 않는다
            if fit.score is not None and t in AVOID and rng.random() < 0.15:
                flagged = [i for i, ing in enumerate(doc)
                           if (lb := labels.get(ing)) and any(f in lb[2] for f in "FLI") and lb[3] >= 3]
                if flagged:
                    k = rng.choice(flagged)
                    d2 = doc[:k] + doc[k + 1:]
                    p2 = (poss.get(pid) or [])[:k] + (poss.get(pid) or [])[k + 1:] if poss.get(pid) else None
                    f2 = evaluate(d2, labels, {}, t, None, p2)
                    if f2.score is not None:
                        mono_pairs += 1
                        if f2.score < fit.score - 1:   # 위치 가중 변화로 1점 이내 흔들림은 허용
                            lab = labels[doc[k]]
                            # 기피 플래그와 함께 이 타입의 선호 기능도 가진 성분(예: 티트리오일 P+F)은 빼면 이점도 사라지므로
                            # 점수가 내려갈 수 있다 — 위반이 아니라 정보로 따로 센다(최초 실행에서 36건 모두 이 경우였다).
                            dual = any(f in PREFER[t] for f in lab[0])
                            note("info_dual_role_removal_lowers_score" if dual else "removing_pure_flagged_lowers_score",
                                 (pid, t, fit.score, f2.score))

    out = {
        "protocol": "PROTOCOL.md B 불변식",
        "checked_pairs": checked, "monotonic_pairs_checked": mono_pairs,
        "violations": dict(viol), "examples": examples,
        "excluded_but_good_causes": {f"{t}/{c}": n for (t, c), n in sorted(good_causes.items())},
        "excluded_but_good_score_min": min(good_scores) if good_scores else None,
        "verdict_distribution": {t: dict(c) for t, c in dist.items()},
        "env": common.env_info(cur, []),
    }
    p = common.dump_json("skin_fit_invariants.json", out)
    print(f"제품×타입 {checked:,}쌍 점검 · 단조성 쌍 {mono_pairs:,}")
    print("위반:", dict(viol) or "없음")
    for k, ex in examples.items():
        print(" ", k, ex[:3])
    print("\n판정 분포 (타입별)")
    for t, c in dist.items():
        n = sum(c.values())
        print(f"  {t:<11} " + "  ".join(f"{k} {c[k]:>5} ({c[k] / n:.0%})" for k in ("good", "ok", "caution", "unknown")))
    print(f"\n→ {p}")


def cmd_pool(_a) -> None:
    conn = common.connect()
    cur = conn.cursor()
    labels = load_labels(cur)
    docs, poss = load_docs(cur)
    cur.execute(
        """select p.id, p.name, c.code from products p join categories c on c.id = p.category_id
            where p.composition = 'single' order by p.id"""
    )
    cat_items: dict[str, list] = {}
    for pid, name, cat in cur.fetchall():
        d = docs.get(pid, [])
        # 모델이 판정을 내릴 수 있는 제품만(근거 성분 3종 이상) — 'unknown' 은 사람이 판정할 것이 없다
        if evaluate(d, labels, {}, "samak", None, poss.get(pid)).verdict != "unknown":
            cat_items.setdefault(cat, []).append((pid, name))
    rng = random.Random(SEED + 7)
    per = 40 // len(cat_items)
    picks = []
    for cat in sorted(cat_items):
        picks += [(cat, *x) for x in rng.sample(cat_items[cat], per)]
    rows = []
    for cat, pid, name in picks:
        cur.execute(
            """select i.name_ko from product_ingredients pi join ingredients i on i.id = pi.ingredient_id
                where pi.product_id = %s order by pi.position""", (pid,))
        ing = " > ".join(n for (n,) in cur.fetchall())
        for t in JUDGE_TYPES:
            prof = PROFILES[t]
            desc = ", ".join(f"{AXIS_KO[a]} {v}" for a, v in prof.items())
            rows.append({"product_id": pid, "category": cat, "product_name": name,
                         "skin_type": t, "skin_type_name": SKIN_TYPE_LABELS[t], "type_profile_0to10": desc,
                         "ingredients_in_order": ing, "grade_적합_보통_주의": ""})
    rng.shuffle(rows)
    with TEST_POOL.open("w", newline="", encoding="utf-8-sig") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    print(f"제품 {len(picks)}개 × 타입 {len(JUDGE_TYPES)}개 = {len(rows)}건 → {TEST_POOL}")
    print("마지막 열에 적합 / 보통 / 주의 중 하나를 적어 주세요. (모델 판정은 숨겨져 있습니다)")


def cmd_score(_a) -> None:
    conn = common.connect()
    cur = conn.cursor()
    labels = load_labels(cur)
    docs, poss = load_docs(cur)
    out: dict = {"protocol": "PROTOCOL.md B"}

    # 1) 입력 라벨 정확도 — review_sample.csv 의 verdict (사람이 채움)
    if REVIEW.exists():
        rows = list(csv.DictReader(REVIEW.open(encoding="utf-8-sig")))
        done = [r for r in rows if r.get("verdict", "").strip()]
        out["label_review"] = {"rows": len(rows), "judged": len(done)}
        if done:
            ok = sum(1 for r in done if r["verdict"].strip() in ("맞음", "ok", "O", "o", "정확", "correct"))
            p, lo, hi = stats.wilson(ok, len(done))
            out["label_review"].update({"precision": p, "wilson_lo": lo, "wilson_hi": hi,
                                        "by_reason": {k: dict(Counter(r["verdict"].strip() for r in done if r["reason"] == k))
                                                      for k in sorted({r["reason"] for r in done})}})

    # 2) 출력 판정 일치
    if TEST_POOL.exists():
        rows = list(csv.DictReader(TEST_POOL.open(encoding="utf-8-sig")))
        col = "grade_적합_보통_주의"
        done = [r for r in rows if r[col].strip() in KO_VERDICT]
        out["output_judged"] = {"rows": len(rows), "judged": len(done)}
        if len(done) >= 0.95 * len(rows):
            truth, pred, ord_t, ord_p = [], [], [], []
            order = {"good": 2, "ok": 1, "caution": 0}
            danger = 0
            for r in done:
                pid, t = int(r["product_id"]), r["skin_type"]
                fit = evaluate(docs.get(pid, []), labels, {}, t, None, poss.get(pid))
                tv = KO_VERDICT[r[col].strip()]
                truth.append(tv); pred.append(fit.verdict)
                if fit.verdict in order:
                    ord_t.append(order[tv]); ord_p.append(order[fit.verdict])
                if tv == "caution" and fit.verdict == "good":
                    danger += 1
            n = len(done)
            acc = sum(1 for a, b in zip(truth, pred) if a == b)
            n_caution = sum(1 for a in truth if a == "caution")
            base_ok = sum(1 for a in truth if a == "ok")           # 기준선: 항상 '보통'
            rng = random.Random(SEED)
            base_rand = sum(1 for a in truth if a == rng.choice(["good", "ok", "caution"]))
            out["output"] = {
                "n": n,
                "accuracy": dict(zip(("p", "lo", "hi"), stats.wilson(acc, n))),
                "baseline_always_ok": dict(zip(("p", "lo", "hi"), stats.wilson(base_ok, n))),
                "baseline_random": dict(zip(("p", "lo", "hi"), stats.wilson(base_rand, n))),
                "weighted_kappa_quadratic": stats.cohen_kappa(ord_t, ord_p, "quadratic") if ord_t else None,
                "weighted_kappa_ci95": _kappa_ci(ord_t, ord_p) if ord_t else None,
                "danger_caution_to_good": {"k": danger, "of_human_caution": n_caution,
                                           "rate_over_all": dict(zip(("p", "lo", "hi"), stats.wilson(danger, n))),
                                           "rate_over_caution": dict(zip(("p", "lo", "hi"), stats.wilson(danger, max(1, n_caution))))},
                "confusion": stats.confusion(truth, pred, ["good", "ok", "caution", "unknown"]),
            }
    out["env"] = common.env_info(cur, [TEST_POOL, REVIEW])
    p = common.dump_json("skin_fit.json", out)
    print(out.get("label_review"), out.get("output_judged"))
    if "output" in out:
        o = out["output"]
        print(f"정확도 {o['accuracy']['p']:.2f} [{o['accuracy']['lo']:.2f},{o['accuracy']['hi']:.2f}] "
              f"| 가중 kappa {o['weighted_kappa_quadratic']:.2f} "
              f"| 위험 방향(사람 주의→모델 적합) {o['danger_caution_to_good']['k']}/{o['n']}, 상한 {o['danger_caution_to_good']['rate_over_all']['hi']:.2%}")
    print(f"→ {p}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("cmd", choices=["invariants", "pool", "score"])
    a = ap.parse_args()
    {"invariants": cmd_invariants, "pool": cmd_pool, "score": cmd_score}[a.cmd](a)
