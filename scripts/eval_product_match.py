#!/usr/bin/env python3
"""제품 매칭 정확도 측정 — 영문명 적재가 실제로 얼마나 이득인지 센다.

    python scripts/eval_product_match.py [--sample 300] [--seed 42]

왜 자체 평가셋을 만드나
----------------------
CLOVA 벤치마크의 36장 라벨 세트는 저장소에 없다(scripts/ocr_benchmark/images/가
비어 있고 labels.csv도 없다 — 로컬 전용이었다). 그래서 적재된 영문명에 OCR이
실제로 내는 왜곡을 주입해 평가셋을 합성한다. 사람이 찍은 사진이 아니므로
"OCR 전체 성공률"이 아니라 **"텍스트가 잡혔을 때 올바른 제품을 찾는가"**만
측정한다 — 그게 이 작업이 바꾼 부분이다.

비교 대상
  (A) 영문명 직접 대조          product_names_en.name_en
  (B) 한글 발음 전사 후 대조     지금까지 쓰던 방식
                                 scripts/CLOVA_OCR/extract_product_name.py
"""
from __future__ import annotations

import argparse
import random
import re
import sys
from pathlib import Path

import psycopg2

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "backend"))
sys.path.insert(0, str(REPO / "scripts" / "CLOVA_OCR"))

from app.config import settings  # noqa: E402
from extract_product_name import transliterate  # noqa: E402

# 임계값은 API와 같아야 비교가 의미 있다 (app/api/products.py: MATCH_THRESHOLD)
THRESHOLD = 0.15

# OCR이 실제로 내는 혼동. CLOVA 결과를 보면 숫자·대문자에서 가장 잦다.
CONFUSIONS = {"0": "O", "O": "0", "1": "l", "l": "1", "I": "1", "5": "S", "S": "5"}

# 포장에는 없는데 DB 이름에는 붙어 있는 꼬리 — 용량·세트·색상 표기
TAIL = re.compile(r"\s*(\(.*?\)|\d+(\.\d+)?\s*(ml|g|매|ea)\b.*)$", re.IGNORECASE)


def corrupt(name: str, rng: random.Random) -> str:
    """영문명에 OCR 왜곡을 주입한다."""
    s = TAIL.sub("", name).strip()  # 용량·괄호 꼬리 제거
    out = []
    for ch in s:
        if ch in CONFUSIONS and rng.random() < 0.35:
            out.append(CONFUSIONS[ch])
        elif ch.isalpha() and rng.random() < 0.15:
            out.append(ch.swapcase())
        else:
            out.append(ch)
    s = "".join(out)
    if rng.random() < 0.3:  # 공백 깨짐
        i = rng.randrange(1, max(2, len(s)))
        s = s[:i] + " " + s[i:]
    return s


def topn(cur, sql: str, q: str, n: int) -> list[int]:
    cur.execute(sql, {"q": q, "th": THRESHOLD, "lim": n})
    return [r[0] for r in cur.fetchall()]


SQL_EN = """
select e.product_id
from product_names_en e
where similarity(lower(e.name_en), lower(%(q)s)) >= %(th)s
order by similarity(lower(e.name_en), lower(%(q)s)) desc, e.product_id
limit %(lim)s
"""

SQL_KO = """
select p.id
from products p
where similarity(lower(coalesce(p.display_name, p.name)), lower(%(q)s)) >= %(th)s
order by similarity(lower(coalesce(p.display_name, p.name)), lower(%(q)s)) desc, p.id
limit %(lim)s
"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=int, default=300)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()
    rng = random.Random(args.seed)

    with psycopg2.connect(settings.DATABASE_DSN) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT product_id, name_en FROM product_names_en ORDER BY product_id, name_en"
        )
        rows = cur.fetchall()
        if not rows:
            sys.exit("product_names_en이 비어 있습니다 — seed_product_names_en.py를 먼저 돌리세요.")

        sample = rng.sample(rows, min(args.sample, len(rows)))
        print(f"표본 {len(sample):,}건 (전체 {len(rows):,}건, seed={args.seed})\n")

        stats = {"en1": 0, "en3": 0, "ko1": 0, "ko3": 0, "en0": 0, "ko0": 0}
        for pid, name_en in sample:
            q = corrupt(name_en, rng)

            en = topn(cur, SQL_EN, q, 3)
            if not en:
                stats["en0"] += 1
            if en[:1] == [pid]:
                stats["en1"] += 1
            if pid in en:
                stats["en3"] += 1

            # 전사 방식: 영문 단어마다 한글 발음으로 옮겨 한글명과 대조
            ko_q = " ".join(transliterate(w) for w in q.split())
            ko = topn(cur, SQL_KO, ko_q, 3)
            if not ko:
                stats["ko0"] += 1
            if ko[:1] == [pid]:
                stats["ko1"] += 1
            if pid in ko:
                stats["ko3"] += 1

        n = len(sample)
        def pct(k: str) -> str:
            return f"{stats[k] / n * 100:5.1f}%  ({stats[k]:,}/{n:,})"

        print(f"{'':28} {'top-1':>18} {'top-3':>18} {'0건':>18}")
        print(f"{'(A) 영문명 직접 대조':26} {pct('en1'):>18} {pct('en3'):>18} {pct('en0'):>18}")
        print(f"{'(B) 한글 발음 전사 후 대조':24} {pct('ko1'):>18} {pct('ko3'):>18} {pct('ko0'):>18}")
        print()
        print("top-1 = 1위가 정답 / top-3 = 상위 3개 안에 정답 / 0건 = 임계값을 넘은 후보 없음")
        print("표본이 영문명에서 합성됐으므로 (A)에 유리한 측정이다 — (B)의 숫자는")
        print("'영문 포장을 한글명으로 찾을 때'의 하한으로 읽어야 한다.")


if __name__ == "__main__":
    main()
