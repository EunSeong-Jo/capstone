#!/usr/bin/env python3
"""제품 구성 백필 — v5 정제본 → products.composition (Task 3)

    python scripts/backfill_composition.py --dry-run   # 분포만 출력
    python scripts/backfill_composition.py             # 실제 갱신

멱등하다. 같은 CSV로 여러 번 돌려도 결과가 같다.

왜 별도 스크립트인가
--------------------
판정에 필요한 `처리메모`·`증정기획_정리`·`상품명_원본`은 v5(PR #37)에만 있는
컬럼이고, 현재 DB는 그 이전 CSV로 적재돼 있다. v5 자체의 적재는 goodsNo 중복
(305그룹 524행) 처리 방식이 정해지지 않아 보류 상태라, 구성 값만 먼저 옮긴다.

두 CSV는 goods_no로 100% 겹친다(DB 4,144건 전부 매칭).

앞으로 적재하는 제품은 load_products.py가 같은 판정 함수로 값을 채우므로
이 스크립트는 일회성이다. 다만 v5를 다시 뽑거나 분류 규칙을 고쳤을 때
되돌리기 쉽도록 멱등하게 둔다.
"""
from __future__ import annotations

import argparse
import collections
import csv
import re
import sys
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_values

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "backend"))

from app.config import settings  # noqa: E402
from app.utils.composition import VALUES, classify  # noqa: E402

DEFAULT_CSV = REPO / "data/raw/oliveyoung_products_v5.csv"

_GOODS_NO = re.compile(r"goodsNo=([A-Za-z0-9]+)")

# 오염이 심한 쪽이 이긴다. 묶음분리된 행들은 원본과 goods_no를 공유하므로
# (예: A000000191214가 향수 4종으로 쪼개져 4행) 한 goods_no에 여러 판정이
# 나온다. 그중 하나라도 묶음이면 그 제품은 묶음으로 본다.
_RANK = {v: i for i, v in enumerate(VALUES)}


def bump_cache_version() -> None:
    """products:cache_version INCR — best-effort.

    조회 API가 이 값을 캐시 키에 넣는다. 올리지 않으면 TTL 1시간 동안
    필터 적용 전 응답이 그대로 나간다.
    """
    try:
        import redis
        r = redis.Redis.from_url(
            settings.REDIS_URL, socket_connect_timeout=0.5, socket_timeout=0.5,
        )
        print(f"캐시 버전 갱신 → v{r.incr('products:cache_version')}")
    except Exception as exc:  # noqa: BLE001
        print(f"캐시 버전 갱신 실패(무시): {exc}")


def read_csv(path: Path) -> dict[str, str]:
    """goods_no → composition. 같은 goods_no는 더 오염된 판정을 채택."""
    best: dict[str, str] = {}
    with open(path, newline="", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            m = _GOODS_NO.search(r.get("상품URL") or "")
            if not m:
                continue
            gno = m.group(1)
            c = classify(
                r.get("상품명_원본"),
                r.get("처리메모"),
                r.get("증정기획_정리"),
                r.get("내용량_원본"),
            )
            if gno not in best or _RANK[c] > _RANK[best[gno]]:
                best[gno] = c
    return best


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", type=Path, default=DEFAULT_CSV)
    ap.add_argument("--dry-run", action="store_true", help="갱신 없이 분포만 출력")
    args = ap.parse_args()

    if not args.csv.exists():
        sys.exit(f"CSV가 없습니다: {args.csv}")

    by_goods = read_csv(args.csv)
    print(f"CSV 판정 {len(by_goods):,}건")

    conn = psycopg2.connect(settings.DATABASE_DSN)
    cur = conn.cursor()
    cur.execute("SELECT goods_no, name, composition FROM products")
    rows = cur.fetchall()

    # CSV에 없는 제품은 이름만으로 판정한다. 구 CSV의 상품명은 정제 전
    # 원본이라 '기획'·'N종' 같은 문구가 살아 있어 이름 규칙이 통한다.
    updates: list[tuple[str, str]] = []
    dist = collections.Counter()
    changed = collections.Counter()
    fallback = 0
    for gno, name, current in rows:
        new = by_goods.get(gno)
        if new is None:
            new = classify(name)
            fallback += 1
        dist[new] += 1
        if new != current:
            updates.append((gno, new))
            changed[f"{current} → {new}"] += 1

    print(f"DB 제품 {len(rows):,}건 (CSV 미매칭 {fallback:,}건은 이름으로 판정)")
    print("\n분류 결과")
    for v in VALUES:
        print(f"  {v:<8}{dist[v]:>6,}  {dist[v] / len(rows) * 100:>5.1f}%")

    if not updates:
        print("\n변경 없음 — 이미 최신입니다")
        conn.close()
        return

    print(f"\n갱신 대상 {len(updates):,}건")
    for k, n in changed.most_common():
        print(f"  {k:<22}{n:>6,}")

    if args.dry_run:
        print("\n--dry-run — 갱신하지 않았습니다")
        conn.close()
        return

    execute_values(
        cur,
        """UPDATE products SET composition = v.composition, updated_at = now()
             FROM (VALUES %s) AS v(goods_no, composition)
            WHERE products.goods_no = v.goods_no""",
        updates,
        page_size=500,
    )
    conn.commit()
    # cur.rowcount는 execute_values가 나눠 보낸 마지막 묶음만 센다(page_size 단위).
    # 전체 건수는 우리가 만든 목록 길이가 정확하다.
    print(f"\n갱신 완료 {len(updates):,}행")
    conn.close()
    bump_cache_version()


if __name__ == "__main__":
    main()
