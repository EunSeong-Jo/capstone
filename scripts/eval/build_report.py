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
        s.append(f'<p class="sub">test 시드 {t["hybrid"]["n_seeds"]}개 · 사람 판정 {sim["test_judged"]}쌍 · 막대=nDCG@5(판정 완전), 수염=95% 구간</p>')
        for m in ("hybrid", "served", "tfidf", "rating", "random"):
            if m in t:
                v = t[m]["ndcg5"]
                s.append(bar(names[m], v["mean"], v["lo"], v["hi"]))
        pr = sim["test_paired_ndcg10"]
        s.append("<h3>쌍체 비교 (nDCG@10 차이, 95% 구간)</h3><table>" + "".join(
            f"<tr><td>{e(k)}</td><td>{v['diff']:+.3f} [{v['lo']:+.3f}, {v['hi']:+.3f}]</td><td>n={v['n']}</td></tr>" for k, v in pr.items()) + "</table>")
        ok = all(pr[f"hybrid_vs_{b}"]["lo"] > 0 for b in ("random", "rating"))
        rows.append(verdict_row("A hybrid vs 무작위·평점순", "쌍체 95% 구간이 0 초과", " / ".join(f"{b} {pr['hybrid_vs_' + b]['diff']:+.2f}" for b in ("random", "rating")), "통과" if ok else "미달"))
        rows.append(verdict_row("A hybrid vs tfidf", "차이를 있는 그대로 보고(합격 조건 아님)", f"{pr['hybrid_vs_tfidf']['diff']:+.3f} [{pr['hybrid_vs_tfidf']['lo']:+.3f}, {pr['hybrid_vs_tfidf']['hi']:+.3f}]", "참고"))
        if sim.get("dev") and "hybrid" in sim["dev"]:
            dv = sim["dev"]["hybrid"]["ndcg10"]["mean"]
            tv = t["hybrid"]["ndcg10"]["mean"]
            s.append(f'<p class="sub">낙관 편향 점검 — hybrid nDCG@10: dev(튜닝에 쓴 80 시드) {dv:.3f} → test {tv:.3f} (차 {dv - tv:+.3f})</p>')
    else:
        pending = f' (판정 {sim["test_judged"]}/{sim["test_rows"]})' if sim else ""
        s.append(f'<p class="pend">test 사람 판정 대기{e(pending)} — <code>data/eval/similarity_test_pool.csv</code> 의 grade 열</p>')
        rows.append(verdict_row("A hybrid vs 무작위·평점순", "쌍체 95% 구간이 0 초과", "사람 판정 필요", "대기"))
    if sim and sim.get("dev"):
        s.append("<details><summary>dev(기존 80 시드, AI 판정 · 튜닝 자료) 수치</summary><table><tr><th>방식</th><th>nDCG@10</th><th>P@5</th><th>비고</th></tr>" + "".join(
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
        s.append("<h3>타입별 판정 분포</h3>")
        for t, c in sfi["verdict_distribution"].items():
            n = sum(c.values())
            s.append(f'<div class="row"><span class="lab">{t}</span><span class="stack">' + "".join(
                f'<b class="{k}" style="width:{c.get(k, 0) / n * 100:.1f}%" title="{k} {c.get(k, 0)}"></b>' for k in ("good", "ok", "caution", "unknown")) + "</span></div>")
        s.append('<p class="sub legend"><i class="good"></i>적합 <i class="ok"></i>보통 <i class="caution"></i>주의 <i class="unknown"></i>판정 불가</p>')
    if sff and sff.get("output"):
        o = sff["output"]
        dg = o["danger_caution_to_good"]
        s.append(bar("사람 판정과 일치", o["accuracy"]["p"], o["accuracy"]["lo"], o["accuracy"]["hi"]))
        s.append(bar("기준선: 항상 '보통'", o["baseline_always_ok"]["p"], o["baseline_always_ok"]["lo"], o["baseline_always_ok"]["hi"]))
        s.append(f'<p class="sub">가중 kappa {o["weighted_kappa_quadratic"]:.2f} · 위험 방향 오류 {dg["k"]}/{o["n"]} (상한 {fmt(dg["rate_over_all"]["hi"], 1)})</p>')
        rows.append(verdict_row("B 위험 방향 오류율 상한", "≤ 10%", fmt(dg["rate_over_all"]["hi"], 1), "통과" if dg["rate_over_all"]["hi"] <= 0.10 else "미달"))
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
            s.append(bar("dev top-5", dv["top5"]["p"], dv["top5"]["lo"], dv["top5"]["hi"]))
        t = ocr.get("test")
        if t and t.get("top5"):
            s.append(bar("test top-1", t["top1"]["p"], t["top1"]["lo"], t["top1"]["hi"], f"양성 {t['n_pos']}장"))
            s.append(bar("test top-5", t["top5"]["p"], t["top5"]["lo"], t["top5"]["hi"]))
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
<p class="sub">평가일 {date} · 코드 {commit} · alembic {alembic} · 로컬 스냅샷(AWS 운영 DB와 평가 대상 테이블 동일) {counts}</p>
<div class="summary"><div><b style="color:var(--ok)">{n_ok}</b>통과</div><div><b style="color:var(--bad)">{n_bad}</b>미달</div><div><b style="color:var(--wait)">{n_wait}</b>사람 판정 대기</div></div>
<div class="box"><b>어떻게 평가했나</b><ul>
<li>지표와 합격선은 결과를 보기 전에 <code>data/eval/PROTOCOL.md</code>에 적고 커밋했다.</li>
<li>튜닝에 쓴 자료(dev)와 한 번만 본 자료(test)를 나눴고, 정답은 평가 대상 로직과 독립인 <b>사람 판정</b>이다.</li>
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
<li>docs/similarity.md 의 nDCG@10 0.799(dev)는 옵션 분해 이후 DB에서 재현되지 않았다(같은 스크립트·판정으로 0.711). 원인은 새 옵션 행 75칸(상위 5개의 19%)에 판정이 없어 0점으로 세어진 것이다. 미판정 163쌍에 판정을 보강하자 0.765가 되었다(보강 판정은 Claude, 사람 검수 없음). 이 dev 수치는 test 지표가 아니다.</li>
</ul></div>
<h2>이 평가가 보여주지 않는 것</h2>
<div class="box"><ul>
<li>판정자가 1명이라 판정자 간 일치도가 없다(자기 일관성·사람-AI 일치만 가능).</li>
<li>진단의 임상 정확도, 실제 사용자 만족도, 운영 환경의 응답 시간.</li>
<li>챗봇은 Claude(Haiku)로만 평가했고, 응답은 호출마다 달라진다(20문항 3회 반복으로 변동성만 확인).</li>
<li>OCR은 앞면 사진만, 제품 선택 방식에 따라 편향이 있을 수 있다(데이터시트 참고).</li>
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
