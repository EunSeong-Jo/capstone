#!/usr/bin/env python3
"""제품 적재 — 올리브영 크롤링 CSV → products / brands / categories / product_ingredients

    python scripts/load_products.py [--csv 경로]

멱등하다(goods_no 기준 upsert). 선행 조건: scripts/seed_ingredients.py

입력 CSV 컬럼 (crawling/utils.py의 HEADER)
    카테고리, 브랜드, 상품명, 가격(원), 평점, 리뷰수, 화장품성분,
    사용기한, 내용량, 제조국, 제조사, 이미지파일명, 이미지URL, 상품URL, 수집일시

성분 해석 순서
    1) normalize()      → ingredients.normalized_name
    2) 별칭 조회        → ingredient_aliases (is_ambiguous 제외)
    3) normalize_loose() → 괄호까지 제거 후 재시도
    4) 실패 시 ingredients에 신규 등록 (official_code=NULL)
  → 어떤 경우에도 성분을 버리지 않는다.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import re
import sys
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_values

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "backend"))

from app.config import settings  # noqa: E402
from app.utils.ingredients import (  # noqa: E402
    normalize,
    normalize_loose,
    parse_ingredients,
)

DEFAULT_CSV = REPO / "data/raw/oliveyoung_products.csv.gz"

# 'N종 택1' 기획세트는 호수별 전성분을 한 셀에 이어 붙여 최대 1,978개까지 나온다.
# 이런 행은 '모든 성분을 가진 제품'이 되어 무엇과도 유사해지므로 유사도 계산에서
# 걸러야 하는데, 그 판단은 적재가 아니라 유사도 배치(Task 3)의 몫으로 둔다.
#
# 적재 단계에서 자르지 않는 이유: 100개 임계로 4,478건 중 368건(8.2%)이 잘리는데
# 그 구간에 'VDL 커버 스테인 파운데이션 30ml'(105개) 같은 단일 제품이 섞여 있다.
# 한 번 버린 데이터는 되살릴 수 없으므로 원본을 그대로 두고,
# 소비 측에서 아래 기준으로 제외하는 편이 안전하다.
#
#     WHERE (SELECT count(*) FROM product_ingredients
#            WHERE product_id = p.id) <= 100
#
# 참고 분포(4,478건): 중앙 38 · 90퍼센타일 87 · 95퍼센타일 142 · 최대 1,978
SIMILARITY_SAFE_MAX = 100   # 통계 표시용 기준값 (적재를 막지는 않는다)

_GOODS_NO = re.compile(r"goodsNo=([A-Za-z0-9]+)")


def to_int(s: str) -> int | None:
    s = re.sub(r"[^\d]", "", s or "")
    return int(s) if s else None


def to_float(s: str) -> float | None:
    s = (s or "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def read_rows(path: Path) -> list[dict]:
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", type=Path, default=DEFAULT_CSV)
    args = ap.parse_args()

    if not args.csv.exists():
        sys.exit(f"CSV가 없습니다: {args.csv}")

    rows = read_rows(args.csv)
    print(f"CSV {len(rows):,}행")

    # ── goods_no 기준 dedup (뒤에 온 행이 최신) ──────────────────
    by_goods: dict[str, dict] = {}
    no_goods_no = 0
    for r in rows:
        m = _GOODS_NO.search(r.get("상품URL", "") or "")
        if not m:
            no_goods_no += 1
            continue
        by_goods[m.group(1)] = r
    print(f"고유 제품 {len(by_goods):,}건 "
          f"(중복 {len(rows) - len(by_goods) - no_goods_no:,} / URL없음 {no_goods_no})")

    conn = psycopg2.connect(settings.DATABASE_DSN)
    cur = conn.cursor()

    # ── 브랜드 · 카테고리 ────────────────────────────────────────
    brands = sorted({(r.get("브랜드") or "").strip() for r in by_goods.values()} - {""})
    cats = sorted({(r.get("카테고리") or "").strip() for r in by_goods.values()} - {""})

    execute_values(cur,
        "INSERT INTO brands (name) VALUES %s ON CONFLICT (name) DO NOTHING",
        [(b,) for b in brands], page_size=500)
    execute_values(cur,
        "INSERT INTO categories (code, label) VALUES %s ON CONFLICT (code) DO NOTHING",
        [(c, c) for c in cats], page_size=500)
    conn.commit()

    cur.execute("SELECT name, id FROM brands")
    brand_id = dict(cur.fetchall())
    cur.execute("SELECT code, id FROM categories")
    cat_id = dict(cur.fetchall())
    print(f"브랜드 {len(brand_id):,} / 카테고리 {len(cat_id)}")

    # ── 제품 ─────────────────────────────────────────────────────
    product_rows = []
    for gno, r in by_goods.items():
        product_rows.append((
            gno,
            (r.get("상품명") or "").strip(),
            brand_id.get((r.get("브랜드") or "").strip()),
            cat_id.get((r.get("카테고리") or "").strip()),
            to_int(r.get("가격(원)", "")),
            to_float(r.get("평점", "")),
            to_int(r.get("리뷰수", "")),
            (r.get("이미지URL") or "").strip() or None,
            (r.get("상품URL") or "").strip() or None,
            (r.get("내용량") or "").strip() or None,
            (r.get("제조국") or "").strip() or None,
            (r.get("제조사") or "").strip() or None,
            (r.get("사용기한") or "").strip() or None,
        ))

    execute_values(cur, """
        INSERT INTO products
            (goods_no, name, brand_id, category_id, price, rating, review_count,
             image_url, product_url, volume, country, manufacturer, expiry_info)
        VALUES %s
        ON CONFLICT (goods_no) DO UPDATE SET
            name = EXCLUDED.name, brand_id = EXCLUDED.brand_id,
            category_id = EXCLUDED.category_id, price = EXCLUDED.price,
            rating = EXCLUDED.rating, review_count = EXCLUDED.review_count,
            image_url = EXCLUDED.image_url, product_url = EXCLUDED.product_url,
            volume = EXCLUDED.volume, country = EXCLUDED.country,
            manufacturer = EXCLUDED.manufacturer, expiry_info = EXCLUDED.expiry_info,
            updated_at = now()
    """, product_rows, page_size=500)
    conn.commit()

    cur.execute("SELECT goods_no, id FROM products")
    pid_of = dict(cur.fetchall())
    print(f"제품 적재 {len(pid_of):,}건")

    # ── 성분 해석 ────────────────────────────────────────────────
    cur.execute("SELECT normalized_name, id FROM ingredients")
    ing_id = dict(cur.fetchall())
    cur.execute("SELECT alias, ingredient_id FROM ingredient_aliases WHERE NOT is_ambiguous")
    alias_id = dict(cur.fetchall())
    print(f"사전 로드 — 성분 {len(ing_id):,} / 별칭 {len(alias_id):,}")

    stat = {"direct": 0, "alias": 0, "loose": 0, "new": 0}
    pending_new: dict[str, str] = {}   # normalized → 원문

    def resolve(raw: str) -> str | None:
        """성분 원문 → normalized_name (신규는 pending_new에 적재)"""
        key = normalize(raw)
        if not key:
            return None
        if key in ing_id:
            stat["direct"] += 1
            return key
        if key in alias_id:
            stat["alias"] += 1
            return key
        loose = normalize_loose(raw)
        if loose and loose in ing_id:
            stat["loose"] += 1
            return loose
        if key not in pending_new:
            pending_new[key] = raw.strip()
            stat["new"] += 1
        return key

    links: list[tuple[str, str, int, str]] = []  # (goods_no, key, position, raw)
    over_threshold = skipped_empty = 0
    for gno, r in by_goods.items():
        parts = parse_ingredients(r.get("화장품성분", ""))
        if not parts:
            skipped_empty += 1
            continue
        if len(parts) > SIMILARITY_SAFE_MAX:
            over_threshold += 1   # 적재는 하되 집계만 남긴다
        seen: set[str] = set()
        pos = 0
        for raw in parts:
            key = resolve(raw)
            if not key or key in seen:
                continue      # 같은 제품 안의 중복 성분은 첫 등장만
            seen.add(key)
            pos += 1
            links.append((gno, key, pos, raw.strip()))

    print(f"성분 해석 — 사전직결 {stat['direct']:,} / 별칭 {stat['alias']:,} / "
          f"완화 {stat['loose']:,} / 신규 {stat['new']:,}")
    print(f"성분없음 {skipped_empty}건 · "
          f"성분 {SIMILARITY_SAFE_MAX}개 초과 {over_threshold}건"
          f"(적재는 하되 유사도 계산에서 제외 권장)")

    # 사전에 없던 성분 등록
    if pending_new:
        execute_values(cur,
            """INSERT INTO ingredients (normalized_name, korean_name)
               VALUES %s ON CONFLICT (normalized_name) DO NOTHING""",
            [(k, v) for k, v in pending_new.items()], page_size=1000)
        conn.commit()
        cur.execute("SELECT normalized_name, id FROM ingredients")
        ing_id = dict(cur.fetchall())

    # ── product_ingredients ──────────────────────────────────────
    def to_ingredient_id(key: str) -> int | None:
        return ing_id.get(key) or alias_id.get(key)

    pi_rows = []
    for gno, key, pos, raw in links:
        pid, iid = pid_of.get(gno), to_ingredient_id(key)
        if pid and iid:
            pi_rows.append((pid, iid, pos, raw))

    cur.execute("DELETE FROM product_ingredients WHERE product_id = ANY(%s)",
                (list(pid_of.values()),))
    execute_values(cur,
        """INSERT INTO product_ingredients (product_id, ingredient_id, position, raw_name)
           VALUES %s ON CONFLICT (product_id, ingredient_id) DO NOTHING""",
        pi_rows, page_size=5000)
    conn.commit()

    for t in ("products", "product_ingredients", "brands", "categories", "ingredients"):
        cur.execute(f"SELECT count(*) FROM {t}")
        print(f"  {t:22s} {cur.fetchone()[0]:>9,}")

    cur.close()
    conn.close()
    print("\n완료")


if __name__ == "__main__":
    main()
