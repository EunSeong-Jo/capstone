#!/usr/bin/env python3
"""영문 제품명 시드 — data/raw/oliveyoung_kr_en_paired.csv → product_names_en

    python scripts/seed_product_names_en.py

멱등하다. CSV가 원본이므로 매칭을 고치면 CSV를 고치고 다시 돌린다.

입력 (PR #60의 수집 결과)
  한 쌍이 두 행이다 — 같은 `쌍번호`에 `언어`가 '한글'인 행과 '영어'인 행.
  한글 행의 `상품URL`에서 `goodsNo`를 꺼내 products.product_url로 역조회해
  product_id를 찾고, 영어 행의 `상품명`을 영문명으로 넣는다.

  쌍번호    쌍을 묶는 번호
  언어      한글 | 영어
  매칭방법  전성분 | 전성분(구성 다름) | 상품명 검색
  신뢰도    높음 | 보통 | 확인필요
  점수      0~1
  상품URL   한글 행에만 goodsNo가 있다

CSV에는 메이크업·건강식품도 있는데 우리 products는 스킨케어 4종 카테고리라,
붙지 않는 쌍이 10%쯤 나온다. 그건 정상이고 개수만 보고한다.
"""
from __future__ import annotations

import csv
import re
import sys
from collections import defaultdict
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_values

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "backend"))

from app.config import settings  # noqa: E402

CSV_PATH = REPO / "data/raw/oliveyoung_kr_en_paired.csv"

GOODS_NO = re.compile(r"goodsNo=([A-Z0-9]+)")

METHODS = {"전성분", "전성분(구성 다름)", "상품명 검색"}
CONFIDENCES = {"높음", "보통", "확인필요"}


def goods_no(url: str) -> str | None:
    m = GOODS_NO.search(url or "")
    return m.group(1) if m else None


def parse(rows: list[dict]) -> tuple[list[dict], list[str]]:
    """CSV 행 → 쌍 목록. 한쪽 언어만 있는 쌍과 값이 이상한 쌍은 errors로."""
    pairs: dict[str, dict[str, dict]] = defaultdict(dict)
    for r in rows:
        pairs[r["쌍번호"]][r["언어"]] = r

    out, errors = [], []
    for no, p in sorted(pairs.items(), key=lambda kv: int(kv[0]) if kv[0].isdigit() else 0):
        kr, en = p.get("한글"), p.get("영어")
        if not kr or not en:
            errors.append(f"쌍 {no}: 한쪽 언어만 있음 ({sorted(p)})")
            continue

        gn = goods_no(kr.get("상품URL", ""))
        name_en = (en.get("상품명") or "").strip()
        method = (kr.get("매칭방법") or "").strip()
        conf = (kr.get("신뢰도") or "").strip()
        if not gn:
            errors.append(f"쌍 {no}: 한글 상품URL에 goodsNo가 없음")
        elif not name_en:
            errors.append(f"쌍 {no}: 영문 상품명이 비어 있음")
        elif method not in METHODS:
            errors.append(f"쌍 {no}: 매칭방법 '{method}'")
        elif conf not in CONFIDENCES:
            errors.append(f"쌍 {no}: 신뢰도 '{conf}'")
        else:
            try:
                score = float(kr.get("점수") or 0)
            except ValueError:
                errors.append(f"쌍 {no}: 점수 '{kr.get('점수')}'")
                continue
            out.append({
                "goods_no": gn,
                "name_en": name_en,
                "brand_en": (en.get("브랜드") or "").strip() or None,
                "match_method": method,
                "confidence": conf,
                "score": score,
            })
    return out, errors


def main() -> None:
    with open(CSV_PATH, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    parsed, errors = parse(rows)
    if errors:
        print("\n".join(errors[:20]))
        sys.exit(f"잘못된 쌍 {len(errors)}건 — 적재하지 않았습니다.")
    print(f"CSV {len(rows):,}행 → 쌍 {len(parsed):,}건")

    with psycopg2.connect(settings.DATABASE_DSN) as conn, conn.cursor() as cur:
        cur.execute("SELECT id, product_url FROM products")
        id_of: dict[str, int] = {}
        for pid, url in cur.fetchall():
            gn = goods_no(url)
            if gn:
                id_of[gn] = pid

        # (product_id, name_en)이 PK다. CSV에는 같은 조합이 여러 쌍번호로
        # 들어 있다(97개 그룹) — 한글 상품의 옵션별 행이 같은 글로벌 리스팅에
        # 걸린 경우다. 점수·신뢰도까지 같으므로 점수가 가장 높은 하나만 남긴다.
        # 한 배치 안에 중복이 남으면 ON CONFLICT DO UPDATE가 거부한다.
        best: dict[tuple[int, str], tuple] = {}
        missing = []
        for p in parsed:
            pid = id_of.get(p["goods_no"])
            if pid is None:
                missing.append(p["goods_no"])
                continue
            key = (pid, p["name_en"])
            row = (
                pid, p["name_en"], p["brand_en"],
                p["match_method"], p["confidence"], p["score"],
            )
            if key not in best or p["score"] > best[key][5]:
                best[key] = row
        values = list(best.values())
        collapsed = sum(1 for p in parsed if id_of.get(p["goods_no"]) is not None) - len(values)
        if collapsed:
            print(f"같은 (제품, 영문명) 중복 {collapsed}건은 점수 높은 쪽만 남겼습니다")

        if missing:
            # CSV가 메이크업·건강식품까지 덮는데 products는 스킨케어 4종이다.
            print(f"products에 없는 상품 {len(missing)}건(건너뜀): {missing[:5]}")

        execute_values(
            cur,
            """INSERT INTO product_names_en
                   (product_id, name_en, brand_en, match_method, confidence, score)
               VALUES %s
               ON CONFLICT (product_id, name_en) DO UPDATE SET
                   brand_en     = EXCLUDED.brand_en,
                   match_method = EXCLUDED.match_method,
                   confidence   = EXCLUDED.confidence,
                   score        = EXCLUDED.score,
                   updated_at   = now()""",
            values,
            page_size=1000,
        )
        conn.commit()

        cur.execute("SELECT count(*), count(DISTINCT product_id) FROM product_names_en")
        total, products = cur.fetchone()
        cur.execute(
            "SELECT confidence, count(*) FROM product_names_en GROUP BY 1 ORDER BY 2 DESC"
        )
        by_conf = ", ".join(f"{c} {n:,}" for c, n in cur.fetchall())
        print(f"적재 {len(values):,}건 → product_names_en {total:,}행 / 제품 {products:,}개")
        print(f"  신뢰도: {by_conf}")


if __name__ == "__main__":
    main()
