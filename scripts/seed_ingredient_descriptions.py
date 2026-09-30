#!/usr/bin/env python3
"""성분 설명 시드 — data/seed/ingredient_descriptions.csv → ingredient_descriptions

    python scripts/seed_ingredient_descriptions.py

멱등하다. CSV가 원본이므로 설명을 고칠 때는 CSV를 고치고 다시 돌린다.
설명은 제품 상세 응답에 실리므로 적재 후 상세 캐시 버전을 올린다.
description이 빈 행은 건너뛴다(파싱 잔해 등 아직 채우지 않은 성분).

입력 컬럼
  norm_name     ingredients.norm_name과 맞춰 ingredient_id를 찾는다
  description   한 줄 설명
  keywords      '|'로 구분, 아래 KEYWORDS 안에서 최대 2개
  source        llm | reviewed
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_values

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "backend"))

from app.config import settings  # noqa: E402

CSV_PATH = REPO / "data/seed/ingredient_descriptions.csv"


def bump_cache_version() -> None:
    """products:cache_version INCR — best-effort.

    설명은 ProductDetailOut.ingredients[]에 실리므로, 재적재 후 상세 캐시에
    옛 설명이 남지 않도록 무효화한다. 실패해도 스크립트 자체는 성공으로
    끝나야 한다.
    """
    try:
        import redis
        r = redis.Redis.from_url(
            settings.REDIS_URL, socket_connect_timeout=0.5, socket_timeout=0.5,
        )
        print(f"캐시 버전 갱신 → v{r.incr('products:cache_version')}")
    except Exception as exc:  # noqa: BLE001
        print(f"캐시 버전 갱신 실패(무시): {exc}")

# 효능(화면 칩으로 노출) + 역할(제형 성분 분류). 자유 입력을 허용하면
# '보습'·'수분공급'·'촉촉함'이 갈라져 필터가 무너진다.
KEYWORDS = {
    "보습", "진정", "장벽강화", "브라이트닝", "탄력", "항산화", "피지조절",
    "각질케어", "자외선차단", "영양",
    "용제", "보존", "유화", "세정", "점증", "pH조절", "향료", "사용감개선",
    "안정화", "색소",
}
SOURCES = {"llm", "reviewed"}


def parse(rows: list[dict]) -> tuple[list[tuple], list[str]]:
    """CSV 행 → (norm_name, description, keywords, source). 잘못된 행은 errors로."""
    out, errors = [], []
    for i, r in enumerate(rows, start=2):  # 1행은 헤더
        desc = (r.get("description") or "").strip()
        if not desc:
            continue
        kws = [k for k in (r.get("keywords") or "").split("|") if k]
        source = (r.get("source") or "").strip()
        if not kws or len(kws) > 2 or set(kws) - KEYWORDS:
            errors.append(f"{i}행 {r['norm_name']}: 키워드 {kws}")
        elif source not in SOURCES:
            errors.append(f"{i}행 {r['norm_name']}: source '{source}'")
        else:
            out.append((r["norm_name"], desc, kws, source))
    return out, errors


def main() -> None:
    with open(CSV_PATH, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    parsed, errors = parse(rows)
    if errors:
        print("\n".join(errors[:20]))
        sys.exit(f"잘못된 행 {len(errors)}건 — 적재하지 않았습니다.")
    print(f"CSV {len(rows):,}행 중 설명 있는 행 {len(parsed):,}건")

    with psycopg2.connect(settings.DATABASE_DSN) as conn, conn.cursor() as cur:
        cur.execute("SELECT norm_name, id FROM ingredients")
        id_of = dict(cur.fetchall())

        values = [(id_of[n], d, k, s) for n, d, k, s in parsed if n in id_of]
        missing = [n for n, *_ in parsed if n not in id_of]
        if missing:
            # 성분 재시드로 행이 사라졌거나 별칭으로 합쳐진 경우
            print(f"DB에 없는 성분 {len(missing)}건(건너뜀): {missing[:10]}")

        execute_values(
            cur,
            """INSERT INTO ingredient_descriptions
                   (ingredient_id, description, keywords, source)
               VALUES %s
               ON CONFLICT (ingredient_id) DO UPDATE SET
                   description = EXCLUDED.description,
                   keywords    = EXCLUDED.keywords,
                   source      = EXCLUDED.source,
                   updated_at  = now()""",
            values,
            template="(%s, %s, %s::text[], %s)",
            page_size=1000,
        )
        conn.commit()
        cur.execute("SELECT count(*) FROM ingredient_descriptions")
        print(f"적재 {len(values):,}건 → ingredient_descriptions {cur.fetchone()[0]:,}행")

    bump_cache_version()


if __name__ == "__main__":
    main()
