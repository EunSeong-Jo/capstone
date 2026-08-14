#!/usr/bin/env python3
"""제품 적재 — 올리브영 크롤링 CSV → products / brands / categories / product_ingredients

    python scripts/load_products.py [--csv 경로]

멱등하다(goods_no 기준 upsert). 선행 조건: scripts/seed_ingredients.py

입력 CSV 컬럼 (crawling/utils.py의 HEADER)
    카테고리, 브랜드, 상품명, 가격(원), 평점, 리뷰수, 화장품성분,
    사용기한, 내용량, 제조국, 제조사, 이미지파일명, 이미지URL, 상품URL, 수집일시

성분 해석 순서
    1) normalize()      → ingredients.norm_name
    2) 별칭 조회        → ingredient_aliases (is_ambiguous 제외)
    3) normalize_loose() → 괄호까지 제거 후 재시도
    4) 실패 시 ingredients에 신규 등록 (code=NULL)
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

# 적재 대상 카테고리. 화이트리스트로 둔 이유는 재수집 때 새 카테고리가
# 조용히 섞여 들어오는 것을 막기 위해서다.
#
# 이 서비스의 축은 '얼굴 피부타입 진단 → 성분이 비슷한 대체품'이다.
# 진단 5개 축이 전부 얼굴 기준이라, 추천 대상도 얼굴용으로 맞춘다.
#
# 뺀 카테고리와 이유:
#   이너뷰티·향수/디퓨저 — 성분 기반 추천이 구조적으로 불가능. 먹는 제품과
#     향료 제품은 전성분 표기 대상이 아니거나 표기 방식이 달라, 수집된
#     60건 중 39건(65%)·48건 중 24건(50%)에 성분이 아예 없다.
#   남성케어(50건) · 헤어케어(75건) · 바디케어(72건) — 성분은 온전하나
#     비교군이 얇다. 브랜드가 41~45개로 흩어져 제품당 브랜드 2개꼴이라
#     의미 있는 성분 교집합이 생기지 않는다. 헤어·바디는 얼굴 진단 결과와
#     연결할 근거도 없다.
#   메이크업(87건) — 위 이유에 더해 데이터가 오염돼 있다. 'N종 택1'
#     기획세트가 호수별 전성분을 한 셀에 이어 붙여 원본 평균 성분이 373개다
#     (전체 평균 42). 호수 정보를 수집할 수 있게 되면 복원 후보.
#
# CSV 원본은 그대로 두므로 이 집합에 다시 추가하면 언제든 복구된다.
ALLOWED_CATEGORIES = {"스킨케어", "마스크팩", "클렌징", "선케어"}

# 성분 칸에 성분 대신 안내문구가 적힌 경우. 판매자가 상품정보제공고시 표에
# 그렇게 입력한 것이라 재수집해도 같은 값이 나온다.
#
#     '상세페이지 참조' · '상품 상세페이지 참고.' · '■ 제품 상세페이지 참조'
#
# 성분이 딱 하나로 파싱될 때만 적용한다. 정상 단일성분 제품
# ('아벤느 온천수(아쿠아)', '로즈힙씨오일(100%)')을 잘못 걸러내지 않기 위해서다.
_PLACEHOLDER = re.compile(r"상세\s*페이지|상품\s*상세|별도\s*표기|해당\s*없음|^\s*없음\s*$")

_GOODS_NO = re.compile(r"goodsNo=([A-Za-z0-9]+)")


def is_unusable(parts: list[str]) -> bool:
    """전성분을 얻을 수 없는 제품인지 판단.

    성분이 없으면 대체품 추천 자체가 불가능하다. 기기·브러시·패치처럼
    애초에 화장품이 아닌 것과, 판매자가 성분 대신 안내문구를 넣은 것이
    여기 걸린다.
    """
    if not parts:
        return True
    return len(parts) == 1 and bool(_PLACEHOLDER.search(parts[0]))


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
    #
    # 같은 goods_no가 여러 카테고리에 걸쳐 등재된 제품이 71건 있다
    # (스킨케어+클렌징 18 · 메이크업+선케어 4 · 스킨케어+헤어케어 8 …).
    # 클렌징오일처럼 올리브영이 실제로 양쪽에 노출하는 제품들이다.
    # 지금은 CSV에서 마지막에 온 행의 카테고리를 따르므로, 어느 쪽이
    # 될지는 수집 순서에 달려 있다. 카테고리별 추천을 붙일 때
    # (Task 3) 우선순위 규칙을 정해야 한다.
    #
    # 카테고리 필터가 이 루프 안에 있어, ALLOWED_CATEGORIES를 바꾸면
    # 이런 제품의 소속이 함께 바뀐다. 예: 에스쁘아 비벨벳 커버쿠션은
    # 메이크업을 빼면서 선케어로 넘어왔다(SPF42 제품이라 타당하다).
    by_goods: dict[str, dict] = {}
    no_goods_no = excluded = 0
    for r in rows:
        if (r.get("카테고리") or "").strip() not in ALLOWED_CATEGORIES:
            excluded += 1
            continue
        m = _GOODS_NO.search(r.get("상품URL", "") or "")
        if not m:
            no_goods_no += 1
            continue
        by_goods[m.group(1)] = r
    dup = len(rows) - len(by_goods) - no_goods_no - excluded
    print(f"고유 제품 {len(by_goods):,}건 "
          f"(중복 {dup:,} / URL없음 {no_goods_no} / 제외 카테고리 {excluded:,})")

    conn = psycopg2.connect(settings.DATABASE_DSN)
    cur = conn.cursor()

    # ── 성분 사전 선로드 ─────────────────────────────────────────
    # 전성분 구분자가 제품마다 달라(쉼표/공백/@) 파서가 사전을 참고해야 한다.
    cur.execute("SELECT norm_name, id FROM ingredients")
    ing_id = dict(cur.fetchall())
    cur.execute("SELECT alias, ingredient_id FROM ingredient_aliases WHERE NOT is_ambiguous")
    alias_id = dict(cur.fetchall())
    vocab = set(ing_id) | set(alias_id)
    print(f"사전 로드 — 성분 {len(ing_id):,} / 별칭 {len(alias_id):,}")

    # ── 전성분을 얻을 수 없는 제품 제외 ──────────────────────────
    parsed = {g: parse_ingredients(r.get("화장품성분", ""), vocab)
              for g, r in by_goods.items()}
    unusable = {g for g, p in parsed.items() if is_unusable(p)}
    if unusable:
        for g in unusable:
            del by_goods[g], parsed[g]
        print(f"성분 없음으로 제외 {len(unusable):,}건 → 적재 대상 {len(by_goods):,}건")

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
        # 원본 문자열 기준 성분 개수(중복 포함). product_ingredients 행수는
        # 제품 내 중복을 제거하므로 이 값과 다를 수 있다.
        raw_count = len(parsed[gno])
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
            raw_count,
        ))

    execute_values(cur, """
        INSERT INTO products
            (goods_no, name, brand_id, category_id, price, rating, review_count,
             image_url, product_url, volume, country, manufacturer, expiry,
             ingredient_count_raw)
        VALUES %s
        ON CONFLICT (goods_no) DO UPDATE SET
            name = EXCLUDED.name, brand_id = EXCLUDED.brand_id,
            category_id = EXCLUDED.category_id, price = EXCLUDED.price,
            rating = EXCLUDED.rating, review_count = EXCLUDED.review_count,
            image_url = EXCLUDED.image_url, product_url = EXCLUDED.product_url,
            volume = EXCLUDED.volume, country = EXCLUDED.country,
            manufacturer = EXCLUDED.manufacturer, expiry = EXCLUDED.expiry,
            ingredient_count_raw = EXCLUDED.ingredient_count_raw,
            updated_at = now()
    """, product_rows, page_size=500)
    conn.commit()

    cur.execute("SELECT goods_no, id FROM products")
    pid_of = dict(cur.fetchall())
    print(f"제품 적재 {len(pid_of):,}건")

    # ── 성분 해석 ────────────────────────────────────────────────
    stat = {"direct": 0, "alias": 0, "loose": 0, "new": 0}
    pending_new: dict[str, str] = {}   # normalized → 원문

    def resolve(raw: str) -> str | None:
        """성분 원문 → norm_name (신규는 pending_new에 적재)"""
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
    over_threshold = 0
    for gno in by_goods:
        parts = parsed[gno]
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
    print(f"성분 {SIMILARITY_SAFE_MAX}개 초과 {over_threshold}건 "
          f"(적재는 하되 유사도 계산에서 제외 권장)")

    # 사전에 없던 성분 등록
    if pending_new:
        execute_values(cur,
            """INSERT INTO ingredients (norm_name, name_ko)
               VALUES %s ON CONFLICT (norm_name) DO NOTHING""",
            [(k, v) for k, v in pending_new.items()], page_size=1000)
        conn.commit()
        cur.execute("SELECT norm_name, id FROM ingredients")
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
