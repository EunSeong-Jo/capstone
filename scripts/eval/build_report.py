#!/usr/bin/env python3
"""평가 리포트 생성 — data/eval/results/<날짜>/*.json → docs/evaluation/index.html (정적 한 장).

    python3 scripts/eval/build_report.py [--date 2026-11-01]

계산은 하지 않는다. 결과 JSON 을 읽어 합격선(PROTOCOL.md)과 대조해 보여 줄 뿐이다.
파일이 없거나 사람 판정이 덜 끝난 항목은 '대기'로 표시한다(통과로 쓰지 않는다).
"""
from __future__ import annotations

import argparse
import html
import json
from datetime import date
from pathlib import Path

from stats import wilson

REPO = Path(__file__).resolve().parents[2]
RES = REPO / "data" / "eval" / "results"
OUT = REPO / "docs" / "evaluation" / "index.html"
e = html.escape


def load(d: Path, name: str):
    p = d / name
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


def fmt(p, d=0):
    return "—" if p is None or p != p else f"{p * 100:.{d}f}%"


def bar(label, p, lo=None, hi=None, note=""):
    """0~1 비율 막대 + 95% 구간 수염."""
    if p is None or p != p:
        return f'<div class="row"><span class="lab">{e(label)}</span><span class="na">—</span></div>'
    w = max(0, min(100, p * 100))
    whisk = ""
    if lo is not None and hi is not None:
        whisk = f'<i class="w" style="left:{max(0, lo * 100):.1f}%;width:{max(0.5, (hi - lo) * 100):.1f}%"></i>'
    ci = f" [{fmt(lo)}–{fmt(hi)}]" if lo is not None else ""
    return (f'<div class="row"><span class="lab">{e(label)}</span><span class="track"><b style="width:{w:.1f}%"></b>{whisk}</span>'
            f'<span class="val">{fmt(p)}{ci}</span><span class="nt">{e(note)}</span></div>')


def badge(state):
    cls = {"통과": "ok", "미달": "bad", "대기": "wait", "참고": "info"}[state]
    return f'<span class="bd {cls}">{state}</span>'


def verdict_row(name, crit, value, state):
    return f"<tr><td>{e(name)}</td><td>{e(crit)}</td><td>{e(value)}</td><td>{badge(state)}</td></tr>"


def build(date_str: str) -> str:
    d = RES / date_str
    sim, sfi, sff = load(d, "similarity.json"), load(d, "skin_fit_invariants.json"), load(d, "skin_fit.json")
    dgs, dgp, bud = load(d, "diagnosis_structure.json"), load(d, "diagnosis_personas.json"), load(d, "budget.json")
    ocr, chat, chh = load(d, "ocr.json"), load(d, "chat.json"), load(d, "chat_human.json")
    rows = []          # 합격선 판정 표
    sections = []

    # ── A 유사도
    s = ['<h2 id="a">A. 성분 유사도·대체품</h2>']
    if sim and sim.get("test"):
        t = sim["test"]
        names = {"hybrid": "hybrid(현재 기본값)", "served": "서비스 제공값", "tfidf": "tfidf", "rating": "평점순", "random": "무작위"}
        s.append(f'<p class="sub">test 시드 {t["hybrid"]["n_seeds"]}개 · <b>Claude 판정</b> {sim["test_judged"]}쌍(사람 정답 아님, 방식 정보는 보지 않고 판정) · 막대=nDCG@5(판정 완전), 수염=95% 구간</p>')
        for m in ("hybrid", "served", "tfidf", "rating", "random"):
            if m in t:
                v = t[m]["ndcg5"]
                s.append(bar(names[m], v["mean"], v["lo"], v["hi"]))
        s.append('<p class="sub"><b>코드 제거 재판정(blind 점검)</b> — 판정 풀에는 hybrid가 쓰는 성분 기능 코드([S]·[BH] 등)가 보였다. 등급별 15쌍씩 45쌍을 뽑아 코드를 지우고 새 AI 판정자(Opus, 저장소 접근 없음)에게 다시 판정시켰다: '
                 '일치 34/45 = 76% [61%, 86%], 가중 kappa(제곱) 0.78. 불일치 11쌍은 모두 처음 판정이 0(대체 불가)인데 재판정이 1(부분 대체)인 경우이고, 등급 1·2는 30쌍이 전부 일치했다. '
                 '즉 처음 판정이 코드를 본 영향으로 더 엄격했을 수 있으며, 대체 가능(2) 판정은 코드 유무와 무관했다. 표본이 작고 등급별 층화라 일반 일치도가 아니다. 원본 판정은 고치지 않았다.</p>')
        pr = sim["test_paired_ndcg10"]
        s.append("<h3>쌍체 비교 (nDCG@10 차이, 95% 구간)</h3><table>" + "".join(
            f"<tr><td>{e(k)}</td><td>{v['diff']:+.3f} [{v['lo']:+.3f}, {v['hi']:+.3f}]</td><td>n={v['n']}</td></tr>" for k, v in pr.items()) + "</table>")
        ok = all(pr[f"hybrid_vs_{b}"]["lo"] > 0 for b in ("random", "rating"))
        rows.append(verdict_row("A hybrid vs 무작위·평점순", "쌍체 95% 구간이 0 초과", " / ".join(f"{b} {pr['hybrid_vs_' + b]['diff']:+.2f}" for b in ("random", "rating")), "통과" if ok else "미달"))
        rows.append(verdict_row("A hybrid vs tfidf", "차이를 있는 그대로 보고(합격 조건 아님)", f"{pr['hybrid_vs_tfidf']['diff']:+.3f} [{pr['hybrid_vs_tfidf']['lo']:+.3f}, {pr['hybrid_vs_tfidf']['hi']:+.3f}]", "참고"))
        if sim.get("dev") and "hybrid" in sim["dev"]:
            dh, th = sim["dev"]["hybrid"], t["hybrid"]
            s.append('<p class="sub">낙관 편향 점검 — hybrid, dev(튜닝에 쓴 %d 시드) → test(%d 시드). '
                     'nDCG@10 %.3f → %.3f, <b>nDCG@5 %.3f → %.3f</b>. '
                     'nDCG@10 이 내려간 것은 판정 커버리지(상위 10개 중 판정이 있는 비율)가 dev %.2f 에서 test %.2f 로 낮아 미판정 후보가 0점으로 세어진 영향이 커서, '
                     '낙관 편향의 증거로 쓰지 않는다. 판정이 완전한 nDCG@5 는 오히려 test 가 높으므로 이 표본에서 튜닝에 의한 과대평가는 관찰되지 않았다(표본 40 시드의 한계는 그대로).</p>'
                     % (dh["n_seeds"], th["n_seeds"], dh["ndcg10"]["mean"], th["ndcg10"]["mean"], dh["ndcg5"]["mean"], th["ndcg5"]["mean"], dh["cov10"]["mean"], th["cov10"]["mean"]))
    else:
        pending = f' (판정 {sim["test_judged"]}/{sim["test_rows"]})' if sim else ""
        s.append(f'<p class="pend">test 사람 판정 대기{e(pending)} — <code>data/eval/similarity_test_pool.csv</code> 의 grade 열</p>')
        rows.append(verdict_row("A hybrid vs 무작위·평점순", "쌍체 95% 구간이 0 초과", "사람 판정 필요", "대기"))
    if sim and sim.get("dev"):
        s.append("<details><summary>dev(기존 시드, AI 판정 · 튜닝 자료 · 판정 있는 시드만 79개) 수치</summary><table><tr><th>방식</th><th>nDCG@10</th><th>P@5</th><th>비고</th></tr>" + "".join(
            f"<tr><td>{m}</td><td>{v['ndcg10']['mean']:.3f} [{v['ndcg10']['lo']:.3f},{v['ndcg10']['hi']:.3f}]</td><td>{v['p5']['mean']:.3f}</td><td>{'풀에 없는 후보는 0 처리 — 무효' if m in ('rating', 'random') else ('보정이 같은 판정을 써 순환 — 인용 금지' if m == 'served' else '')}</td></tr>"
            for m, v in sim["dev"].items()) + "</table></details>")
    sections.append("\n".join(s))

    # ── B 궁합
    s = ['<h2 id="b">B. 제품 궁합</h2>']
    if sfi:
        v = sfi["violations"]
        exg = v.get("excluded_but_good", 0)
        s.append(f'<p class="sub">제품×타입 {sfi["checked_pairs"]:,}쌍 전수 점검 · 서비스 배치 테이블과 재계산 일치 · 단조성 {sfi["monotonic_pairs_checked"]:,}쌍</p>')
        s.append("<table><tr><th>불변식</th><th>위반</th></tr>" + "".join(
            f"<tr><td>{e(k)}</td><td>{n:,}</td></tr>" for k, n in v.items()) + ("" if v else "<tr><td colspan=2>위반 없음</td></tr>") + "</table>")
        rows.append(verdict_row("B 하드 제외 제품이 '적합'", "0건", f"{exg:,}건", "통과" if exg == 0 else "미달"))
        causes = sfi.get("excluded_but_good_causes")
        if exg and causes:
            s.append(f'<p class="sub"><b>하드 제외인데 \'적합\' {exg}건의 구성</b> — ' + " · ".join(f"{k} {n}건" for k, n in causes.items())
                     + f' (모두 점수 {sfi.get("excluded_but_good_score_min")} 이상). 서비스의 <code>excluded</code>는 "이 타입 목록에서 빼는 제품" 표시이고 verdict는 점수로만 정해져, '
                     + '필터가 빼는 제품이라도 상세에서 직접 열면 \'적합\'으로 나올 수 있다. 서비스 설계가 의도한 동작인지 코드로 확인되지 않았으며(사용자에게 해로운 방향이라 점검 필요), 이 평가는 고치지 않고 있는 그대로 보고한다.</p>')
        s.append("<h3>타입별 판정 분포</h3>")
        for t, c in sfi["verdict_distribution"].items():
            n = sum(c.values())
            s.append(f'<div class="row"><span class="lab">{t}</span><span class="stack">' + "".join(
                f'<b class="{k}" style="width:{c.get(k, 0) / n * 100:.1f}%" title="{k} {c.get(k, 0)}"></b>' for k in ("good", "ok", "caution", "unknown")) + "</span></div>")
        s.append('<p class="sub legend"><i class="good"></i>적합 <i class="ok"></i>보통 <i class="caution"></i>주의 <i class="unknown"></i>판정 불가</p>')
    if sff and sff.get("label_review", {}).get("judged"):
        lr = sff["label_review"]
        br = lr.get("by_reason", {})
        def _agree(k):
            c = br.get(k, {}); n = sum(c.values()); ok = c.get("맞음", 0)
            return ok, n
        lines = []
        for k in ("무작위", "확신도 1", "오염 판정"):
            ok, n = _agree(k)
            if n:
                p_, lo_, hi_ = wilson(ok, n)
                lines.append(f"<tr><td>{e(k)}</td><td>{ok}/{n}</td><td>{p_:.0%} [{lo_:.0%}, {hi_:.0%}]</td></tr>")
        s.append("<h3>성분 기능 라벨 — AI 모델 간 일치도 (Opus가 이름만 보고 독립 판정)</h3>"
                 "<table><tr><th>표본</th><th>기능 코드 일치</th><th>일치율 [95%]</th></tr>" + "".join(lines) + "</table>"
                 '<p class="sub"><b>정확도가 아니라 일치도다.</b> 사람 검수가 아니며(Claude 계열 두 모델), 둘 다 틀렸을 수 있다. 전체 추정은 무작위 표본의 값을 쓴다 — 확신도 1 표본은 일부러 어려운 행을 뽑았다. 불일치는 대부분 식물추출물의 기능 배정(예: 항산화 vs 진정)이라 이런 성분의 라벨은 불안정하다. 불일치 목록: <code>review_sample.csv</code>의 verdict=불일치.</p>')
    if sff and sff.get("output"):
        o = sff["output"]
        dg = o["danger_caution_to_good"]
        s.append(bar("AI(Claude) 판정과 일치", o["accuracy"]["p"], o["accuracy"]["lo"], o["accuracy"]["hi"]))
        s.append(bar("기준선: 항상 '보통'", o["baseline_always_ok"]["p"], o["baseline_always_ok"]["lo"], o["baseline_always_ok"]["hi"]))
        s.append('<p class="sub"><b>정답은 사람이 아니라 Claude가 판정했다</b>(판정자의 성분 지식 부족, 앱 결과는 보지 않음). 입력 성분 라벨도 AI가 만들었으므로 독립 검증이 아니다 — DATASHEET B절.</p>')
        s.append(f'<p class="sub">가중 kappa {o["weighted_kappa_quadratic"]:.2f}{(" [" + format(o["weighted_kappa_ci95"][0], ".2f") + ", " + format(o["weighted_kappa_ci95"][1], ".2f") + "]") if o.get("weighted_kappa_ci95") else ""} · 위험 방향 오류 {dg["k"]}/{dg.get("of_human_caution", o["n"])}(사람 &quot;주의&quot; 기준, 정의대로) (상한 {fmt(dg.get("rate_over_caution", dg["rate_over_all"])["hi"], 1)})</p>')
        rows.append(verdict_row("B 위험 방향 오류율 상한", "≤ 10%", fmt(dg.get("rate_over_caution", dg["rate_over_all"])["hi"], 1), "통과" if dg.get("rate_over_caution", dg["rate_over_all"])["hi"] <= 0.10 else "미달"))
        rows.append(verdict_row("B 가중 kappa", "≥ 0.40", f"{o['weighted_kappa_quadratic']:.2f}", "통과" if o["weighted_kappa_quadratic"] >= 0.40 else "미달"))
        rows.append(verdict_row("B 기준선(항상 '보통') 초과", "정확도가 더 높음", f'{fmt(o["accuracy"]["p"])} vs {fmt(o["baseline_always_ok"]["p"])}', "통과" if o["accuracy"]["p"] > o["baseline_always_ok"]["p"] else "미달"))
    else:
        s.append('<p class="pend">사람 판정 대기 — <code>data/eval/skin_fit_test_pool.csv</code> (120건)</p>')
        for n in ("위험 방향 오류율 상한 ≤ 10%", "가중 kappa ≥ 0.40", "기준선 초과"):
            rows.append(verdict_row("B " + n.split(" ")[0] + " " + n.split(" ", 1)[1].split(" ")[0], n, "사람 판정 필요", "대기"))
    sections.append("\n".join(s))

    # ── C 진단
    s = ['<h2 id="c">C. 피부타입 진단 <small>(정확도를 주장하지 않음)</small></h2>']
    if dgs:
        s.append(f'<p class="sub">응답 {dgs["n_combinations"]:,}가지 전수 · 도달 가능 타입 {dgs["reachable_types"]}/8 · 경계 비율 {fmt(dgs["borderline_rate"], 1)} · 엔트로피 {dgs["entropy_bits"]:.2f}/{dgs["max_entropy_bits"]:.2f} bit</p>')
        s.append("<h3>균등 응답일 때 1순위 타입 분포</h3>")
        for t, p in dgs["top1_share"].items():
            s.append(bar(t, p))
        s.append('<p class="sub">균등 응답 가정의 구조 지표다. 특정 타입으로 쏠리는 정도를 보여 줄 뿐 실제 사용자 분포가 아니다. 12.5%가 완전 균등.</p>')
        rows.append(verdict_row("C 8타입 모두 도달", "8/8", f"{dgs['reachable_types']}/8", "통과" if dgs["reachable_types"] == 8 else "미달"))
    if dgp and dgp.get("top1"):
        t1 = dgp["top1"]
        s.append(bar("페르소나 1순위 일치", t1["p"], t1["lo"], t1["hi"], f"우연 {fmt(dgp['chance_top1'], 1)}"))
        rows.append(verdict_row("C 페르소나 통과율", "≥ 70%", fmt(t1["p"]), "통과" if t1["p"] >= 0.70 else "미달"))
    else:
        s.append('<p class="pend">페르소나 30개 대기 — <code>data/eval/diagnosis_personas.csv</code></p>')
        rows.append(verdict_row("C 페르소나 통과율", "≥ 70%", "페르소나 작성 필요", "대기"))
    sections.append("\n".join(s))

    # ── D 추천·예산
    s = ['<h2 id="d">D. 추천·예산 구매 가이드</h2>']
    if bud:
        v = bud["violations"]
        s.append(f'<p class="sub">요청 {bud["requests"]:,}건(성공 {bud["ok"]:,}) · 빈 결과 {bud["empty_result"]} · 부분 루틴 {bud["partial_routine"]} · 지연 p50 {bud["latency_ms"]["p50"]:.0f}ms / p95 {bud["latency_ms"]["p95"]:.0f}ms</p>')
        s.append("<table><tr><th>불변식</th><th>위반</th></tr>" + ("".join(f"<tr><td>{e(k)}</td><td>{n}</td></tr>" for k, n in v.items()) or "<tr><td colspan=2>위반 없음 (예산 초과·합계·순서·중복·제외 제품·무향/무알코올·타입 제외)</td></tr>") + "</table>")
        rows.append(verdict_row("D 불변식 위반", "0건", f"{sum(v.values())}건", "통과" if not v else "미달"))
        q = bud.get("quality_vs_random")
        if q:
            p = q["paired"]
            s.append(f'<p class="sub">평균 궁합 점수 — 가이드 {q["guide_mean"]:.1f} vs 무작위 조합 {q["random_mean"]:.1f} (차이 {p["diff"]:+.1f} [{p["lo"]:+.1f}, {p["hi"]:+.1f}], n={q["n"]}). 서비스가 최적화하는 점수로 재므로 <b>독립 증거가 아니라 일관성 점검</b>이다.</p>')
            rows.append(verdict_row("D 가이드 vs 무작위 조합", "쌍체 95% 구간이 0 초과", f"{p['diff']:+.1f} [{p['lo']:+.1f},{p['hi']:+.1f}]", "통과" if p["lo"] > 0 else "미달"))
        m = bud["main_vs_popular"]
        s.append("<h3>홈 추천 8개 vs 인기순 8개 — '주의' 개수</h3><table><tr><th>타입</th><th>홈 추천</th><th>인기순</th><th>평균 궁합(홈/인기)</th></tr>" + "".join(
            f"<tr><td>{t}</td><td>{r['main_caution']}</td><td>{r['popular_caution']}</td><td>{r['main_mean_fit']:.0f} / {r['popular_mean_fit']:.0f}</td></tr>" for t, r in m.items()) + "</table>")
    sections.append("\n".join(s))

    # ── E OCR
    s = ['<h2 id="e">E. OCR 제품 매칭 <small>(앞면 사진만)</small></h2>']
    if ocr:
        dv = ocr["dev"]
        s.append(f'<p class="sub">앞면 {ocr["photos_front"]}장 · dev {ocr["dev_items"]}장(임계값 설정) · test 라벨 {ocr["test_items_labeled"]}장 / 미라벨 {ocr["test_items_unlabeled"]}장</p>')
        if dv.get("top1"):
            s.append(bar("dev top-1", dv["top1"]["p"], dv["top1"]["lo"], dv["top1"]["hi"], f"양성 {dv['n_pos']}장"))
            if dv.get("top3"):
                s.append(bar("dev top-3 (앱 화면)", dv["top3"]["p"], dv["top3"]["lo"], dv["top3"]["hi"]))
            s.append(bar("dev top-5", dv["top5"]["p"], dv["top5"]["lo"], dv["top5"]["hi"]))
        t = ocr.get("test")
        if t and t.get("top5"):
            s.append(bar("test top-1", t["top1"]["p"], t["top1"]["lo"], t["top1"]["hi"], f"양성 {t['n_pos']}장"))
            if t.get("top3"):
                s.append(bar("test top-3 (앱 화면)", t["top3"]["p"], t["top3"]["lo"], t["top3"]["hi"], "사후 추가 지표"))
            s.append(bar("test top-5", t["top5"]["p"], t["top5"]["lo"], t["top5"]["hi"]))
            import csv as _csv
            _rows = list(_csv.DictReader(open(Path(__file__).resolve().parents[2] / "data" / "ocr_test" / "labels_test.csv", encoding="utf-8-sig", newline="")))
            src_list = sum(1 for r in _rows if r["in_catalog"] == "Y" and r["source"] == "list")
            src_manual_pos = sum(1 for r in _rows if r["in_catalog"] == "Y" and r["source"] == "manual")
            s.append(f'<p class="sub">앱 스캔 화면은 후보를 3개만 보여 주므로 사용자가 보는 적중률은 top-3 이다. 사전 등록 지표는 top-5 이고, top-3 은 결과를 본 뒤 서비스 화면에 맞춰 추가한 지표다. '
                     f'정답 {t["n_pos"]}건 중 라벨러가 앱 후보에서 고른 것이 {src_list}건, 후보에 없어 직접 검색해 넣은 것이 {src_manual_pos}건이다(음성 {t["n_neg"]}건은 별도). 음성은 목표 10건에 못 미쳐 거절 성능은 신뢰구간이 넓다.</p>')
            if "auroc" in t:
                s.append(f'<p class="sub">음성 거절 AUROC {t["auroc"]:.2f} [{t["auroc_lo"]:.2f}, {t["auroc_hi"]:.2f}] · 임계값 {t.get("threshold")} (dev 에서 고정)</p>')
            rows.append(verdict_row("E test top-5", "≥ 80%", fmt(t["top5"]["p"]), "통과" if t["top5"]["p"] >= 0.80 else "미달"))
            if "auroc_lo" in t:
                auto = t["auroc_lo"] >= 0.90
                rows.append(verdict_row("E 자동 거절 주장", "AUROC 하한 ≥ 0.90 일 때만", f"하한 {t['auroc_lo']:.2f}", "통과" if auto else "미달"))
        else:
            s.append(f'<p class="pend">test 라벨 대기 — {e(ocr.get("test_pending", ""))}</p>')
            rows.append(verdict_row("E test top-5", "≥ 80%", "test 라벨 필요", "대기"))
            rows.append(verdict_row("E 자동 거절 주장", "AUROC 하한 ≥ 0.90", "test 라벨 필요", "대기"))
    sections.append("\n".join(s))

    # ── F 챗봇
    s = ['<h2 id="f">F. 챗봇·AI 기억 <small>(Claude · 규칙 자동 판정 + 사람 채점)</small></h2>']
    if chat:
        s.append(f'<p class="sub">녹화 {chat["n_recorded"]}/{chat["n_cases"]}질문 · 지연 p50 {chat["latency_ms"]["p50"] / 1000:.1f}s / p95 {chat["latency_ms"]["p95"] / 1000:.1f}s</p>')
        for key, lab, crit, ok_fn in (
            ("tool_selection_accuracy", "도구 선택 정확도", "≥ 85%", lambda p: p >= 0.85),
            ("product_hallucination_rate", "제품 환각률(근거 없는 굵은 제품명)", "≤ 3%", lambda p: p <= 0.03),
            ("fallback_rate", "규칙 폴백(mode=fallback) 비율", "≤ 5%", lambda p: p <= 0.05),
        ):
            v = chat.get(key)
            if v:
                s.append(bar(lab, v["p"], v["lo"], v["hi"], f"{v['k']}/{v['n']}"))
                use = v["p"] if key != "product_hallucination_rate" else v["p"]
                rows.append(verdict_row("F " + lab, crit, f"{fmt(v['p'], 1)} [{fmt(v['lo'], 1)}–{fmt(v['hi'], 1)}]", "통과" if ok_fn(use) else "미달"))
        if chat.get("args_accuracy"):
            a = chat["args_accuracy"]
            s.append(bar("도구 인자 정확도", a["p"], a["lo"], a["hi"], f"{a['k']}/{a['n']}"))
        w = chat["write_tool_auto_executed"]
        rows.append(verdict_row("F 쓰기 도구 자동 실행", "0건", f"{w['cases_with_db_change']}/{w['n']}", "통과" if w["cases_with_db_change"] == 0 else "미달"))
        if chat.get("repeat_consistency"):
            r = chat["repeat_consistency"]
            s.append(bar("3회 반복 도구 선택 일관성", r["p"], r["lo"], r["hi"], f"{r['k']}/{r['n']}"))
        s.append("<h3>자동 판정 항목별 통과율</h3>")
        for k, v in chat["checks"].items():
            s.append(bar(k, v["p"], v["lo"], v["hi"], f"{v['k']}/{v['n']}"))
        if chat["failures"]:
            s.append("<details><summary>실패한 질문 " + str(len(chat["failures"])) + "건</summary><table><tr><th>id</th><th>실패 항목</th><th>호출한 도구</th></tr>" + "".join(
                f"<tr><td>{f['id']}</td><td>{e(', '.join(f['failed']))}{' · ' + e(str(f['unsupported_mentions'])) if f.get('unsupported_mentions') else ''}</td><td>{e(', '.join(f['tools']) or '—')}</td></tr>" for f in chat["failures"]) + "</table></details>")
        mem = chat.get("memory")
        if mem:
            s.append("<h3>AI 기억 (문장 40개)</h3>")
            for key, lab in (("recall_explicit", "'기억해줘' 저장 재현율"), ("precision", "저장 정밀도"), ("false_store_questions", "질문형 오저장"), ("false_store_general", "일반 대화 오저장"), ("delete_success", "삭제 성공률")):
                v = mem.get(key)
                if v:
                    s.append(bar(lab, v["p"], v["lo"], v["hi"], f"{v['k']}/{v['n']}"))
            sens = mem["sensitive_stored"]
            s.append(f'<p class="sub">민감정보·주입 문장 저장 {sens["count"]}/{sens["n"]}' + (f' — {e(str(sens["items"]))}' if sens["items"] else "") + "</p>")
            if mem.get("precision"):
                rows.append(verdict_row("F 기억 저장 정밀도", "≥ 90%", fmt(mem["precision"]["p"]), "통과" if mem["precision"]["p"] >= 0.9 else "미달"))
            rows.append(verdict_row("F 민감·주입 문장 저장", "0건", f"{sens['count']}건", "통과" if sens["count"] == 0 else "미달"))
    else:
        s.append('<p class="pend">챗봇 녹화 대기</p>')
    if chh and chh.get("judged"):
        s.append(f'<p class="sub">사람 채점 {chh["judged"]}건 — 정확성 평균 {chh["accuracy_mean"]["mean"]:.2f} [{chh["accuracy_mean"]["lo"]:.2f}, {chh["accuracy_mean"]["hi"]:.2f}] · 유용성 {chh["usefulness_mean"]["mean"]:.2f} · 정확성 4점 이상 {fmt(chh["accuracy_ge4"]["p"])}</p>')
    else:
        s.append('<p class="pend">사람 채점 24건 대기 — <code>data/eval/chat_human_pool.csv</code></p>')
    sections.append("\n".join(s))

    env = (sim or sfi or bud or {}).get("env", {})
    n_ok = sum('class="bd ok"' in r for r in rows)
    n_bad = sum('class="bd bad"' in r for r in rows)
    n_wait = sum('class="bd wait"' in r for r in rows)
    return TEMPLATE.format(
        date=date_str, n_ok=n_ok, n_bad=n_bad, n_wait=n_wait,
        rows="\n".join(rows), sections="\n".join(sections),
        commit=e(str(env.get("git_commit", "?"))), alembic=e(str(env.get("alembic", "?"))),
        counts=e(json.dumps(env.get("db_counts", {}), ensure_ascii=False)),
    )


TEMPLATE = """<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>swappy AI 평가 리포트</title>
<style>
:root{{--bg:#fafaf9;--fg:#1c1917;--mut:#78716c;--line:#e7e5e4;--card:#fff;--acc:#0d9488;--ok:#15803d;--bad:#b91c1c;--wait:#a16207;--info:#475569;--good:#16a34a;--okc:#a3a3a3;--caution:#dc2626;--unknown:#d6d3d1}}
@media(prefers-color-scheme:dark){{:root:not([data-theme=light]){{--bg:#0c0a09;--fg:#f5f5f4;--mut:#a8a29e;--line:#292524;--card:#1c1917;--acc:#2dd4bf;--ok:#4ade80;--bad:#f87171;--wait:#facc15;--info:#94a3b8;--good:#4ade80;--okc:#78716c;--caution:#f87171;--unknown:#44403c}}}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 system-ui,-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif}}
main{{max-width:880px;margin:0 auto;padding:24px 16px 80px}}h1{{font-size:26px;margin:0 0 4px}}h2{{font-size:20px;margin:40px 0 8px;padding-top:16px;border-top:1px solid var(--line)}}h2 small{{font-size:13px;color:var(--mut);font-weight:400}}h3{{font-size:15px;margin:20px 0 6px}}
.sub{{color:var(--mut);font-size:13px;margin:4px 0 10px}}.pend{{background:var(--card);border:1px dashed var(--wait);padding:10px 12px;border-radius:8px;color:var(--wait)}}
table{{border-collapse:collapse;width:100%;font-size:14px;background:var(--card);border:1px solid var(--line);border-radius:8px;overflow:hidden}}th,td{{text-align:left;padding:7px 10px;border-bottom:1px solid var(--line);vertical-align:top}}th{{color:var(--mut);font-weight:500;font-size:12px}}
.bd{{display:inline-block;padding:1px 9px;border-radius:99px;font-size:12px;font-weight:600;border:1px solid currentColor}}.bd.ok{{color:var(--ok)}}.bd.bad{{color:var(--bad)}}.bd.wait{{color:var(--wait)}}.bd.info{{color:var(--info)}}
.summary{{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0 20px}}.summary div{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 16px}}.summary b{{font-size:22px;display:block}}
.row{{display:grid;grid-template-columns:minmax(120px,210px) 1fr auto;gap:4px 10px;align-items:center;margin:5px 0}}.lab{{font-size:13px}}.track{{position:relative;height:12px;background:var(--line);border-radius:6px}}.track b{{position:absolute;left:0;top:0;bottom:0;background:var(--acc);border-radius:6px}}.track i.w{{position:absolute;top:-2px;bottom:-2px;border:2px solid var(--fg);border-top:0;border-bottom:0;opacity:.55}}.val{{font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap}}.nt{{grid-column:2/4;font-size:11px;color:var(--mut);margin-top:-3px}}.nt:empty{{display:none}}.na{{color:var(--mut)}}
.stack{{display:flex;height:14px;border-radius:7px;overflow:hidden;grid-column:2/4}}.stack b{{display:block;height:100%}}.good{{background:var(--good)}}.ok.stk,.stack .ok{{background:var(--okc)}}.caution{{background:var(--caution)}}.unknown{{background:var(--unknown)}}.legend i{{display:inline-block;width:10px;height:10px;border-radius:2px;margin:0 3px 0 10px}}
details{{margin:10px 0}}summary{{cursor:pointer;color:var(--mut);font-size:13px}}code{{background:var(--card);padding:1px 5px;border-radius:4px;font-size:12px}}
.box{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 16px;margin:16px 0;font-size:13.5px}}.box li{{margin:3px 0}}
@media(max-width:560px){{.row{{grid-template-columns:1fr}}.val,.nt{{grid-column:1}}.stack{{grid-column:1}}}}
</style></head><body><main>
<h1>swappy AI 기능 평가</h1>
<p class="sub">평가일 {date} · 코드 {commit} · alembic {alembic} · 로컬 스냅샷(AWS 운영 DB와 평가 대상 테이블 동일, 2026-11-01 확인) {counts}</p>
<div class="summary"><div><b style="color:var(--ok)">{n_ok}</b>통과</div><div><b style="color:var(--bad)">{n_bad}</b>미달</div><div><b style="color:var(--wait)">{n_wait}</b>사람 판정 대기</div></div>
<div class="box"><b>어떻게 평가했나</b><ul>
<li>지표와 합격선은 결과를 보기 전에 <code>data/eval/PROTOCOL.md</code>에 적고 커밋했다.</li>
<li>튜닝에 쓴 자료(dev)와 한 번만 본 자료(test)를 나눴고, 정답은 평가 대상 로직과 독립이어야 한다. 사람 판정이 원칙이었으나 <b>유사도 test·궁합·성분 라벨은 AI(Claude/Opus)가 판정했고 진단 페르소나도 AI가 작성</b>했다(PROTOCOL 변경 이력·데이터시트 참고). 챗봇 채점과 OCR 라벨은 사람이 했다.</li>
<li>모든 비율에는 95% 신뢰구간(수염)이 붙는다. 표본이 작은 항목은 구간이 넓다.</li>
<li>단순한 기준선(무작위·평점순·tfidf·항상 '보통')과 비교했고, 미달도 숨기지 않았다.</li>
</ul></div>
<h2>합격선 판정</h2>
<table><tr><th>항목</th><th>합격선(사전 등록)</th><th>결과</th><th></th></tr>
{rows}
</table>
{sections}
<h2>평가 과정에서 고친 것과 사후 발견</h2>
<div class="box"><ul>
<li><b>챗봇 평가를 3번 녹화했다.</b> 1차(<code>v0</code>)는 질문에 쓴 제품 이름을 자르다 만 하네스 결함과 소제목을 제품명으로 세는 판정 결함이 있어 도구 선택 47%·환각 46%가 나왔다. 2차(<code>v1</code>)는 평가 계정의 피부타입 필터가 질문에 쓴 제품을 검색에서 빼는 교란이 있었다(도구 선택 58%). 3차가 최종이며(도구 선택 80%), 기대(<code>chat_cases.py</code>)는 한 번도 바꾸지 않고 <b>측정 도구만</b> 고쳤다. 이전 녹화는 <code>data/eval/recordings/</code>에 남겼다.</li>
<li><b>사후 발견(사전 등록 아님)</b>: ① 2차 녹화에서 답변 앞부분에 영어 내부 추론이 섞인 사례가 79건 중 5건 있었으나 3차에서는 0건 — 간헐적이다. ② 존재하지 않는 제품을 요청하면 "찾지 못했다"고 답하면서도 관련 없는 검색 결과에 대한 담기 제안(actions) 4개를 함께 내보냈다(tr3).</li>
<li>가격 환각 판정은 "7,900원 저렴" 같은 파생 차이를 근거로 인정하도록 고쳤다(오탐).</li>
<li>피부 궁합: 최초 단조성 점검의 36건 위반은 모두 '해로운 플래그와 이로운 기능을 함께 가진 성분'(예: 티트리오일)을 뺀 경우라 위반이 아닌 정보로 분리했다.</li>
<li>균등 응답에서 진단 1순위가 화산 타입으로 쏠린다(38.6%, 옹달샘·인절미 1%). 정확도 문제인지는 이 평가로 알 수 없다.</li>
<li>docs/similarity.md 의 nDCG@10 0.799(dev)는 옵션 분해 이후 DB에서 재현되지 않았다(같은 스크립트·판정으로 0.711). 원인은 새 옵션 행 75칸(상위 5개의 19%)에 판정이 없어 0점으로 세어진 것이다. 미판정 163쌍에 판정을 보강하자 0.765가 되었다(보강 판정은 Claude, 사람 검수 없음). 위 dev 표의 0.757(시드 79개)과 0.765의 차이는 두 측정의 시드 집합·스크립트 시점이 달라서로 추정하나 확인하지 못했다. 이 dev 수치는 test 지표가 아니다.</li>
</ul></div>
<h2>이 평가가 보여주지 않는 것</h2>
<div class="box"><ul>
<li>판정자가 1명이라 판정자 간 일치도가 없다(자기 일관성·사람-AI 일치만 가능).</li>
<li>진단의 임상 정확도, 실제 사용자 만족도, 운영 환경의 응답 시간.</li>
<li>챗봇은 Claude(Haiku)로만 평가했고, 응답은 호출마다 달라진다(20문항 3회 반복으로 변동성만 확인).</li>
<li>OCR 사진은 팀원들이 가지고 있던 제품을 찍은 것이라 카탈로그 전체를 대표하지 않는다(무작위 추출 아님). 앞면 사진만 평가했고 촬영 조건 기록이 없다(데이터시트 참고).</li>
<li>OCR 정답 라벨은 라벨러가 앱 후보 3개를 본 뒤 정했다. 후보에서 고르기 쉬워 적중률이 실제보다 높게 나올 수 있다(앵커링). 정답은 "스캔이 돌려줄 수 있는 제품"(optgroup 제외, 기획·묶음 포함)으로 정의했고, 로컬 Postgres 스냅샷 기준이며 평가 대상 테이블은 운영 DB와 같음을 확인했다(데이터시트 공통절). 음성(카탈로그에 없는 제품)이 5건뿐이다.</li>
<li>진단 페르소나 30개는 사람이 아니라 로직과 격리된 AI(Claude Opus) 두 단계(작성, 문항 응답)로 만들었다. 실제 사용자 분포와 다를 수 있고 임상 정확도는 아니다.</li>
<li>OCR test의 한 제품(스킨푸드 캐롯 카로틴 카밍 워터 패드)이 dev 사진에도 있다(독립성 점검에서 발견). 제외해도 결론은 같다.</li>
<li>챗봇 "환각 0%"의 판정 범위는 좁다: 번호 이모지로 시작하는 줄의 굵은 글씨만 제품명으로 검사하고, 정규화한 이름 앞 8자만 DB와 맞으면 통과시키며, 평점 일치는 검사하지 않는다(PROTOCOL의 평점 항목은 미실시). 본문 중간의 제품명은 보지 않는다. 녹화에 모델 id는 "default"로만 남아 설정 기본값(claude-haiku-5-5)으로 추정한다.</li>
<li>예산 가이드 품질 비교(n=711)는 요청 1,000건 중 피부타입이 있고 빈 단계가 없으며 무작위 조합을 뽑을 수 있는 요청만 쓰였다. 비교 대상 안은 조합 목록의 가운데 안이다.</li>
<li>진단 페르소나 30개의 문항 응답은 고유한 벡터가 19종뿐이고 같은 벡터를 가진 페르소나가 있어(최대 3명), 실제 독립 표본은 30개보다 적다. 87% [70, 95]의 구간은 실제보다 좁을 수 있다.</li>
<li>사전 등록했지만 실시하지 못한 것: 자기 일관성 kappa(3일 뒤 10% 재판정), OCR 조건별(정상/어려움) 분해. 두 항목 모두 PROTOCOL 변경 이력에 미실시로 적었다.</li>
<li>예산 가이드·홈 추천의 품질 지표는 서비스가 최적화하는 점수로 재므로 독립 증거가 아니다.</li>
<li>얼굴 사진 AI 분석은 외부 모델이라 이번 평가에서 제외했다.</li>
</ul></div>
</main></body></html>
"""


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default=date.today().isoformat())
    a = ap.parse_args()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(build(a.date), encoding="utf-8")
    print("→", OUT)
