#!/usr/bin/env python3
"""데모 계정에 '배송완료' 주문을 한 건씩 넣는다 — 후기 작성 시연용 (QA 8)

    python scripts/seed_delivered_orders.py
    python scripts/seed_delivered_orders.py --dry-run     # 적재 없이 계획만 출력

후기는 배송완료 뒤에만 쓸 수 있다(`POST /api/v1/me/reviews`가 409로 막는다).
배송 단계는 저장하지 않고 주문 시각에서 계산하므로(`services/order_stage.py`,
30분 뒤 배송완료), 주문 시각을 3일 전으로 둔 주문을 넣으면 바로 배송완료다.

품목은 각 페르소나의 `ownedCosmetics` 앞 2개(`personas.json`). 가격은 지금
카탈로그 가격을 박제한다 — 실제 주문과 같은 방식이다. 포인트 적립 행은 넣지
않는다(시연 대상이 후기라서). 화장대에는 `seed_test_users.py`가 이미 넣는다.

멱등하다. 이미 배송완료 단계(30분 이상 지난 'placed') 주문이 있는 계정은
건너뛴다. 공용 DB에 쓰므로 돌리기 전에 팀에 알린다.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "backend"))

from app.config import settings  # noqa: E402

PERSONAS_JSON = REPO / "frontend" / "src" / "data" / "personas.json"
ITEMS_PER_ORDER = 2


def load_personas() -> list[dict]:
    return json.loads(PERSONAS_JSON.read_text(encoding="utf-8"))["personas"]


def has_delivered_order(cur, user_id: str) -> bool:
    cur.execute(
        """
        SELECT 1 FROM orders
        WHERE user_id = %s AND status = 'placed'
          AND placed_at <= now() - interval '30 minutes'
        LIMIT 1
        """,
        (user_id,),
    )
    return cur.fetchone() is not None


def insert_delivered_order(cur, user_id: str, persona: dict) -> int:
    """주문 1건 + 품목. 넣은 품목 수를 돌려준다(카탈로그에 없는 id는 건너뜀)."""
    rows = []
    for item in persona["ownedCosmetics"][:ITEMS_PER_ORDER]:
        cur.execute(
            """
            SELECT p.id, COALESCE(p.display_name, p.name), b.name, COALESCE(p.price, 0)
            FROM products p LEFT JOIN brands b ON b.id = p.brand_id
            WHERE p.id = %s
            """,
            (item["id"],),
        )
        row = cur.fetchone()
        if row is None:
            print(f"    ! 카탈로그에 없는 제품 id={item['id']} ({item['name'][:24]}) — 건너뜀")
            continue
        rows.append(row)
    if not rows:
        return 0

    cur.execute(
        """
        INSERT INTO orders (user_id, total, status, placed_at)
        VALUES (%s, %s, 'placed', now() - interval '3 days')
        RETURNING id
        """,
        (user_id, sum(price for *_, price in rows)),
    )
    order_id = cur.fetchone()[0]
    for product_id, name, brand, price in rows:
        cur.execute(
            """
            INSERT INTO order_items (order_id, product_id, product_name, brand_name, unit_price, qty)
            VALUES (%s, %s, %s, %s, %s, 1)
            """,
            (order_id, product_id, name, brand, price),
        )
    return len(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="적재 없이 계획만 출력")
    args = parser.parse_args()

    personas = load_personas()
    print(f"페르소나 {len(personas)}명 — 각자 배송완료 주문 1건(품목 최대 {ITEMS_PER_ORDER}개)")
    for p in personas:
        names = ", ".join(i["name"][:20] for i in p["ownedCosmetics"][:ITEMS_PER_ORDER])
        print(f"  - {p['nickname']:8s} {p['email']:20s} {names}")

    if args.dry_run:
        print("\n--dry-run: DB에 쓰지 않고 종료")
        return

    if not settings.DATABASE_DSN:
        sys.exit("DATABASE_DSN이 비어 있습니다. .env에 Neon 연결 문자열을 넣으세요.")

    import psycopg2

    with psycopg2.connect(settings.DATABASE_DSN) as conn, conn.cursor() as cur:
        for p in personas:
            cur.execute("SELECT id FROM users WHERE email = %s", (p["email"],))
            user = cur.fetchone()
            if user is None:
                print(f"  ! {p['nickname']} 계정 없음 — seed_test_users.py를 먼저 돌리세요")
                continue
            if has_delivered_order(cur, user[0]):
                print(f"  = {p['nickname']} 이미 배송완료 주문 있음 — 건너뜀")
                continue
            n = insert_delivered_order(cur, user[0], p)
            print(f"  ✓ {p['nickname']} 배송완료 주문 1건 (품목 {n}개)")
        conn.commit()


if __name__ == "__main__":
    main()
