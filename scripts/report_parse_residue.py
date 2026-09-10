#!/usr/bin/env python3
"""파싱 잔해 보고서 — 제품 단위 제거 판단 근거 (Task 3)

    python scripts/report_parse_residue.py
    python scripts/report_parse_residue.py --threshold 2
    python scripts/report_parse_residue.py --samples 20

**읽기 전용이다. DB를 바꾸지 않는다.**

무엇을 세는가
-------------
'의심 성분'은 **협회 사전에 없고(code IS NULL) DF=1인 성분**이다. 둘 다여야
한다 — 사전에 없어도 여러 제품에 쓰이면 실재 성분일 가능성이 높고(표기가
표준과 다를 뿐), DF=1이어도 사전에 있으면 정상이다.

DF=1 성분은 어떤 쌍의 공통 성분도 될 수 없어 코사인의 분자에 기여하지 않고
분모만 키운다. 게다가 희귀해서 IDF가 최대로 붙는다. 기준 제품 자기 목록의
순위는 안 흔들리지만(|a|가 상수라 전체가 같은 비율로 눌린다), **벡터가 부푼
제품이 남의 추천 목록에서 부당하게 밀린다.**

DF는 단일제품(composition='single') 안에서만 센다. 유사도 계산 대상이 그
범위이고, 묶음 제품까지 넣으면 DF가 부풀어 의심 성분이 과소 집계된다.
"""
from __future__ import annotations

import argparse
import collections
import re
import statistics as st
import sys
from pathlib import Path

import psycopg2

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "backend"))

from app.config import settings  # noqa: E402

# 유사도 배치와 같은 하한. 성분 5개 미만은 애초에 계산에서 빠진다.
MIN_INGREDIENTS = 5

# 잔해 유형. 앞선 규칙이 이긴다 — 한 성분이 여러 유형에 걸리므로.
PATTERNS = [
    ("대괄호·꺾쇠 라벨", re.compile(r"[\[\]<>]")),
    ("안내문구", re.compile(r"제공된|참조|상세페이지|동일\s*제품|경우에\s*따라|※")),
    ("콜론 라벨", re.compile(r"[가-힣A-Za-z]\s*:\s*")),
    ("마침표 구분", re.compile(r"[가-힣]\.[가-힣]")),
    ("괄호 짝 안 맞음", None),  # 아래에서 특수 처리
    ("함량 표기 잔류", re.compile(r"\d+\s*(?:ppm|ppb|%)")),
    ("특수문자", re.compile(r"[\"'|@■*†‡]")),
    ("숫자·영문만", re.compile(r"^[\d.,%\s\-a-zA-Z/]+$")),
    ("긴 문자열(안 쪼개짐)", re.compile(r"^.{40,}$")),
]


def classify(name: str) -> str:
    for label, pat in PATTERNS:
        if pat is None:
            if name.count("(") != name.count(")"):
                return label
        elif pat.search(name):
            return label
    return "그 외"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--threshold", type=int, default=1,
                    help="제거 대상으로 볼 의심 성분 개수 하한 (기본 1)")
    ap.add_argument("--samples", type=int, default=10, help="표본 출력 개수")
    args = ap.parse_args()

    conn = psycopg2.connect(settings.DATABASE_DSN)
    cur = conn.cursor()
    cur.execute(
        """
        SELECT c.code, p.id, p.name, pi.ingredient_id, i.code, i.name_ko
          FROM product_ingredients pi
          JOIN products p ON p.id = pi.product_id AND p.composition = 'single'
          JOIN categories c ON c.id = p.category_id
          JOIN ingredients i ON i.id = pi.ingredient_id
        """
    )
    prods: dict[int, dict[int, str | None]] = collections.defaultdict(dict)
    cat: dict[int, str] = {}
    pname: dict[int, str] = {}
    iname: dict[int, str] = {}
    for code, pid, nm, iid, icode, ink in cur.fetchall():
        prods[pid][iid] = icode
        cat[pid], pname[pid], iname[iid] = code, nm, ink
    conn.close()

    df = collections.Counter()
    for v in prods.values():
        for i in v:
            df[i] += 1
    code_of: dict[int, str | None] = {}
    for v in prods.values():
        code_of.update(v)
    suspect = {i for i, n in df.items() if n == 1 and code_of.get(i) is None}

    # 유사도 계산 대상만 본다.
    target = {p: v for p, v in prods.items() if len(v) >= MIN_INGREDIENTS}
    rows = [
        (cat[p], p, len(v), [i for i in v if i in suspect])
        for p, v in target.items()
    ]

    print(f"단일제품 성분 {len(df):,}종 · 의심 성분 {len(suspect):,}종")
    print(f"유사도 계산 대상 제품 {len(target):,}건 (성분 {MIN_INGREDIENTS}개 이상)\n")

    print("의심 성분 유형")
    kinds = collections.Counter(classify(iname[i]) for i in suspect)
    for k, n in kinds.most_common():
        ex = next((iname[i] for i in suspect if classify(iname[i]) == k), "")
        print(f"  {k:<18}{n:>5}종   {ex[:44]}")

    print("\n제품 단위 분포 (누적)")
    print(f"  {'기준':<22}{'제품':>7}{'비율':>8}")
    tot = len(rows)
    for label, f in [
        ("의심 성분 1개 이상", lambda r: len(r[3]) >= 1),
        ("2개 이상", lambda r: len(r[3]) >= 2),
        ("3개 이상", lambda r: len(r[3]) >= 3),
        ("5개 이상", lambda r: len(r[3]) >= 5),
        ("벡터의 10% 이상", lambda r: len(r[3]) / r[2] >= 0.10),
        ("벡터의 20% 이상", lambda r: len(r[3]) / r[2] >= 0.20),
        ("벡터의 30% 이상", lambda r: len(r[3]) / r[2] >= 0.30),
    ]:
        n = sum(1 for r in rows if f(r))
        print(f"  {label:<22}{n:>7,}{n / tot * 100:>7.1f}%")

    print(f"\n카테고리별 — 의심 성분 {args.threshold}개 이상")
    print(f"  {'카테고리':<8}{'대상':>6}{'해당':>6}{'비율':>8}{'남음':>7}")
    for c in ["스킨케어", "마스크팩", "클렌징", "선케어"]:
        v = [r for r in rows if r[0] == c]
        hit = [r for r in v if len(r[3]) >= args.threshold]
        if not v:
            continue
        print(f"  {c:<8}{len(v):>6,}{len(hit):>6,}{len(hit) / len(v) * 100:>7.1f}%"
              f"{len(v) - len(hit):>7,}")

    worst = sorted(rows, key=lambda r: -len(r[3]) / r[2])[: args.samples]
    print(f"\n의심 비중 상위 {args.samples}건")
    for c, pid, n, bad in worst:
        if not bad:
            break
        print(f"  {len(bad) / n * 100:>5.1f}%  {len(bad):>3}/{n:<3} [{c}] {pname[pid][:38]}")
        print(f"          {' · '.join(iname[i][:24] for i in bad[:3])}")

    print("\n제거는 이 숫자를 보고 별도로 판단한다. 이 스크립트는 DB를 바꾸지 않는다.")


if __name__ == "__main__":
    main()
