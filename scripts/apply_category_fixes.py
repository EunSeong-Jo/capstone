#!/usr/bin/env python3
"""카테고리 오분류 교정 반영 — v5 교정 로그 → products

    python scripts/apply_category_fixes.py --dry-run
    python scripts/apply_category_fixes.py

멱등하다. 여러 번 돌려도 결과가 같다.

**load_products.py를 돌린 뒤에는 반드시 이 스크립트를 다시 돌려야 한다.**
현재 DB는 구 CSV(data/raw/oliveyoung_products.csv)로 적재되는데 거기에는
교정 전 카테고리가 들어 있어, upsert가 교정 결과를 매번 덮어쓴다. v5를
적재 기준으로 삼으면 이 스크립트는 불필요해진다.

무엇을 하나
-----------
data/raw/oliveyoung_v5_category_fix.csv의 '이후'(교정 후 카테고리)를 DB의
현재 카테고리와 대조한다.

  교정 후가 얼굴 4종 안  →  카테고리 갱신
  교정 후가 4종 밖       →  제품 삭제 (FK가 CASCADE라 성분·유사도도 정리)

교정 로그의 '이전' 컬럼은 쓰지 않는다. 그 값은 v5 기준이고 DB는 구 CSV에서
왔기 때문에 서로 다르다 — 예를 들어 트리헛 스크럽은 로그상 '이너뷰티 →
바디케어'지만 DB에는 클렌징으로 들어와 있었다. '이전'으로 대상을 고르면
이런 건을 놓친다.
"""
from __future__ import annotations

import argparse
import collections
import csv
import re
import sys
from pathlib import Path

import psycopg2

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "backend"))

from app.config import settings  # noqa: E402

FIX_CSV = REPO / "data/raw/oliveyoung_v5_category_fix.csv"
V5_CSV = REPO / "data/raw/oliveyoung_products_v5.csv"
OLD_CSV = REPO / "data/raw/oliveyoung_products.csv"

# 얼굴에 쓰는 4종만 적재한다. load_products.ALLOWED_CATEGORIES와 같은 목록.
FACE = {"스킨케어", "마스크팩", "클렌징", "선케어"}

_GOODS_NO = re.compile(r"goodsNo=([A-Za-z0-9]+)")


def read_csv(path: Path) -> list[dict]:
    with open(path, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def targets() -> dict[str, str]:
    """goods_no → 교정 후 카테고리.

    교정 로그는 브랜드+상품명으로만 제품을 가리키므로 v5에서 goods_no를 찾는다.
    """
    idx: dict[tuple[str, str], list[str]] = collections.defaultdict(list)
    for r in read_csv(V5_CSV):
        m = _GOODS_NO.search(r.get("상품URL") or "")
        if m:
            idx[(r["브랜드"].strip(), r["상품명"].strip())].append(m.group(1))

    out: dict[str, str] = {}
    for r in read_csv(FIX_CSV):
        if not (r.get("브랜드") or "").strip():
            continue
        for gno in idx[(r["브랜드"].strip(), r["상품명"].strip())]:
            out[gno] = r["이후"].strip()
    return out


def v5_categories() -> dict[str, str]:
    """goods_no → v5의 카테고리.

    같은 goods_no가 여러 행이면 첫 행을 쓴다 — 묶음분리된 행들은 카테고리가
    같다.
    """
    out: dict[str, str] = {}
    for r in read_csv(V5_CSV):
        m = _GOODS_NO.search(r.get("상품URL") or "")
        if m:
            out.setdefault(m.group(1), (r.get("카테고리") or "").strip())
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    target = targets()
    v5_cat = v5_categories()
    print(f"교정 로그에서 특정한 제품 {len(target)}건")

    conn = psycopg2.connect(settings.DATABASE_DSN)
    cur = conn.cursor()
    cur.execute("SELECT id, code FROM categories")
    cat_id = {c: i for i, c in cur.fetchall()}

    # DB의 실제 카테고리와 v5를 직접 대조한다. 구 CSV끼리 비교하면 중복
    # goods_no를 첫 행으로 볼지 마지막 행으로 볼지에 따라 결과가 달라지는데,
    # 로더는 마지막 행을 쓴다. DB를 보면 그 모호함이 사라진다.
    cur.execute(
        """SELECT p.goods_no, c.code, p.name FROM products p
             LEFT JOIN categories c ON c.id = p.category_id"""
    )
    indb = {g: (c, n) for g, c, n in cur.fetchall()}

    to_delete, to_update, noop = [], [], 0
    # 카테고리가 바뀐 제품은 분류를 믿을 수 없어 전부 제외한다. 교정 로그에
    # 근거가 적힌 것은 일부뿐이라 나머지를 검증할 방법이 없고, 잘못된
    # 카테고리는 '선케어의 대체품이 클렌징'이 되는 결과로 이어진다.
    for gno, (current, name) in indb.items():
        after = v5_cat.get(gno)
        if after and after != current:
            to_delete.append((gno, current, after, name))
    already = {g for g, *_ in to_delete}

    for gno, after in target.items():
        if gno not in indb or gno in already:
            continue                      # 4종 밖이라 애초에 적재되지 않았거나 위에서 처리됨
        current, name = indb[gno]
        if after not in FACE:
            to_delete.append((gno, current, after, name))
        elif current != after:
            to_update.append((gno, current, after, name))
        else:
            noop += 1

    print(f"  제거 {len(to_delete)}건 / 갱신 {len(to_update)}건 / 이미 일치 {noop}건")
    for gno, cur_cat, after, name in to_delete[:12]:
        print(f"    제거 {gno} [{cur_cat}] → {after:<12} {name[:38]}")
    if len(to_delete) > 12:
        print(f"    … 외 {len(to_delete) - 12}건")
    for gno, cur_cat, after, name in to_update:
        print(f"    갱신 {gno} [{cur_cat}] → [{after}] {name[:42]}")

    if not to_delete and not to_update:
        print("\n변경 없음 — 이미 반영돼 있습니다")
        conn.close()
        return

    if args.dry_run:
        print("\n--dry-run — 반영하지 않았습니다")
        conn.close()
        return

    try:
        for gno, _, after, _ in to_update:
            cur.execute(
                "UPDATE products SET category_id = %s, updated_at = now() WHERE goods_no = %s",
                (cat_id[after], gno),
            )
        if to_delete:
            # products의 FK가 전부 ON DELETE CASCADE다.
            # product_ingredients와 similarities(양쪽 방향)가 함께 지워진다.
            cur.execute(
                "DELETE FROM products WHERE goods_no = ANY(%s)",
                ([g for g, *_ in to_delete],),
            )
        conn.commit()
        print(f"\n반영 완료 — 갱신 {len(to_update)} / 제거 {len(to_delete)}")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
