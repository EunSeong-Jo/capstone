#!/usr/bin/env python3
"""C. 피부타입 진단 구조 평가 (PROTOCOL.md C절) — 정확도는 주장하지 않는다.

    DATABASE_DSN=<로컬 DSN> python3 scripts/eval/diagnosis.py structure   # 4,096 응답 조합 전수
    DATABASE_DSN=<로컬 DSN> python3 scripts/eval/diagnosis.py personas    # 사람이 쓴 페르소나 30개 통과율
    DATABASE_DSN=<로컬 DSN> python3 scripts/eval/diagnosis.py template    # 페르소나 작성용 템플릿·문항 출력

문항 6개 × 선택지 4개 = 4,096가지라 무작위 표본이 아니라 **전수**로 돌린다.
"""
from __future__ import annotations

import argparse
import csv
import itertools
import math
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import common  # noqa: E402
from common import EVAL_DIR  # noqa: E402
import stats  # noqa: E402

from app.services.diagnosis import AXES, PROFILES, is_borderline, rank_types, score_answers  # noqa: E402

PERSONAS = EVAL_DIR / "diagnosis_personas.csv"


def load_quiz(cur):
    cur.execute(
        """select q.code, q.axis, q.body, o.order_no, o.label, o.weights
             from quiz_questions q join quiz_options o on o.question_id = q.id order by q.order_no, o.order_no"""
    )
    weights, qs = {}, {}
    for code, axis, body, no, label, w in cur.fetchall():
        weights[(code, no)] = w
        qs.setdefault(code, {"axis": axis, "body": body, "options": {}})["options"][no] = (label, w)
    return weights, qs


def classify(answers, weights):
    ranks = rank_types(score_answers(answers, weights))
    return ranks[0]["skin_type"], is_borderline(ranks), ranks


def cmd_structure(_a) -> None:
    conn = common.connect()
    cur = conn.cursor()
    weights, qs = load_quiz(cur)
    codes = list(qs)
    opts = [sorted(qs[c]["options"]) for c in codes]
    combos = list(itertools.product(*opts))
    top1, border, second_gap = Counter(), 0, []
    result = {}
    for combo in combos:
        ans = dict(zip(codes, combo))
        t, b, ranks = classify(ans, weights)
        result[combo] = t
        top1[t] += 1
        border += b
    n = len(combos)
    # 문항 민감도: 다른 응답은 그대로 두고 이 문항만 바꿨을 때 1순위가 바뀌는 비율
    sens = {}
    for qi, c in enumerate(codes):
        changed = tot = 0
        for combo in combos:
            for o in opts[qi]:
                if o == combo[qi]:
                    continue
                other = combo[:qi] + (o,) + combo[qi + 1:]
                tot += 1
                changed += result[other] != result[combo]
        sens[c] = {"axis": qs[c]["axis"], "p_change": changed / tot}
    # 어떤 축을 건드리는가
    touched = {c: sorted({a for o in qs[c]["options"].values() for a in (o[1] or {})}) for c in codes}
    p = [top1[t] / n for t in PROFILES]
    entropy = -sum(x * math.log2(x) for x in p if x > 0)
    out = {
        "protocol": "PROTOCOL.md C 구조",
        "n_combinations": n,
        "reachable_types": sum(1 for t in PROFILES if top1[t] > 0),
        "top1_counts": {t: top1[t] for t in PROFILES},
        "top1_share": {t: top1[t] / n for t in PROFILES},
        "entropy_bits": entropy, "max_entropy_bits": math.log2(len(PROFILES)),
        "borderline_rate": border / n,
        "question_sensitivity": sens,
        "axes_touched_by_question": touched,
        "axes_never_touched": sorted(set(AXES) - {a for v in touched.values() for a in v}),
        "note": "균등 응답 가정의 구조 지표다. 실제 사용자 응답 분포·임상 정확도를 뜻하지 않는다.",
        "env": common.env_info(cur, []),
    }
    pth = common.dump_json("diagnosis_structure.json", out)
    print(f"응답 조합 {n:,}가지 전수 · 도달 가능 타입 {out['reachable_types']}/8 · 경계 비율 {border / n:.1%}")
    print(f"엔트로피 {entropy:.2f} / {out['max_entropy_bits']:.2f} bit")
    for t in PROFILES:
        print(f"  {t:<11} {top1[t]:>5} ({top1[t] / n:.1%})")
    print("문항 민감도(이 문항만 바꿨을 때 1순위 변경 비율):", {c: f"{v['p_change']:.0%}" for c, v in sens.items()})
    print("건드리지 않는 축:", out["axes_never_touched"] or "없음")
    print(f"→ {pth}")


def cmd_template(_a) -> None:
    conn = common.connect()
    cur = conn.cursor()
    weights, qs = load_quiz(cur)
    print("# 문항 (선택지 번호 = order_no)")
    for c, q in qs.items():
        print(f"\n{c}. {q['body']}")
        for no, (label, _w) in sorted(q["options"].items()):
            print(f"   {no}) {label}")
    print("\n# 페르소나 파일: " + str(PERSONAS))
    print("# 열: persona_text, expected_type, q1..q6")
    print("# expected_type 은 아래 8개 코드 중 하나:", ", ".join(PROFILES))
    print("# 채점 로직(가중치·프로필)을 보기 전에 쓰고, 그 페르소나라면 고를 선택지를 q1..q6 에 적는다.")
    if not PERSONAS.exists():
        with PERSONAS.open("w", newline="", encoding="utf-8-sig") as fh:
            csv.writer(fh).writerow(["persona_text", "expected_type"] + list(qs))
        print(f"\n빈 템플릿을 만들었습니다 → {PERSONAS}")


def cmd_personas(_a) -> None:
    conn = common.connect()
    cur = conn.cursor()
    weights, qs = load_quiz(cur)
    codes = list(qs)
    rows = list(csv.DictReader(PERSONAS.open(encoding="utf-8-sig"))) if PERSONAS.exists() else []
    rows = [r for r in rows if r.get("expected_type", "").strip() in PROFILES and all(r.get(c, "").strip() for c in codes)]
    out = {"protocol": "PROTOCOL.md C 페르소나", "n": len(rows)}
    if rows:
        hit1 = hit3 = 0
        confusion = Counter()
        for r in rows:
            ans = {c: int(r[c]) for c in codes}
            t, _b, ranks = classify(ans, weights)
            exp = r["expected_type"].strip()
            hit1 += t == exp
            hit3 += exp in [x["skin_type"] for x in ranks]
            confusion[(exp, t)] += 1
        out.update({
            "top1": dict(zip(("p", "lo", "hi"), stats.wilson(hit1, len(rows)))),
            "top3": dict(zip(("p", "lo", "hi"), stats.wilson(hit3, len(rows)))),
            "chance_top1": 1 / len(PROFILES), "chance_top3": 3 / len(PROFILES),
            "confusion": {f"{a}->{b}": v for (a, b), v in confusion.items() if a != b},
        })
        print(f"페르소나 {len(rows)}개 · 1순위 일치 {out['top1']['p']:.0%} [{out['top1']['lo']:.0%},{out['top1']['hi']:.0%}] "
              f"· 3순위 안 {out['top3']['p']:.0%} (우연 {out['chance_top1']:.1%}/{out['chance_top3']:.1%})")
    else:
        print("페르소나 파일이 비어 있거나 형식이 맞지 않습니다.")
    out["env"] = common.env_info(cur, [PERSONAS])
    print("→", common.dump_json("diagnosis_personas.json", out))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("cmd", choices=["structure", "personas", "template"])
    a = ap.parse_args()
    {"structure": cmd_structure, "personas": cmd_personas, "template": cmd_template}[a.cmd](a)
