"""
Task 2.3 — 수집 데이터 PostgreSQL 저장 로직
"""

import logging
from datetime import datetime, timezone

import psycopg2
from psycopg2.extras import execute_values

logger = logging.getLogger(__name__)

def get_connection(db_url: str):
    """psycopg2 연결 반환. db_url 예: postgresql://user:pw@host:5432/db"""
    return psycopg2.connect(db_url)


def init_tables(conn) -> None:
    """더 이상 여기서 테이블을 만들지 않는다.

    스키마의 단일 원본은 SQLAlchemy 모델(app/models/)이며,
    실제 생성은 Alembic이 담당한다:

        cd backend && alembic upgrade head

    이전에는 이 모듈의 CREATE_TABLES_SQL 문자열이 유일한 스키마 정의였는데,
    그 구조(products.product_name, 성분을 문자열로 저장)는 현재 모델과
    호환되지 않는다. 남겨두면 어느 쪽이 진짜인지 모호해지므로 제거했다.
    """
    logger.warning(
        "init_tables()는 더 이상 테이블을 생성하지 않습니다. "
        "스키마는 `alembic upgrade head`로 관리하세요."
    )


def _parse_price(price_str: str) -> int | None:
    try:
        return int(price_str.replace(",", "").strip()) if price_str else None
    except ValueError:
        return None


def _parse_rating(rating_str: str) -> float | None:
    try:
        return float(rating_str) if rating_str else None
    except ValueError:
        return None


def upsert_product(conn, product: dict) -> int | None:
    """제품 1건 upsert. 삽입된 or 기존 product_id 반환."""
    sql = """
        INSERT INTO products (product_name, brand, category, price, rating, review_count, product_url, report_no, source)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (product_name, brand, source) DO UPDATE
            SET category     = EXCLUDED.category,
                price        = EXCLUDED.price,
                rating       = EXCLUDED.rating,
                review_count = EXCLUDED.review_count
        RETURNING id
    """
    with conn.cursor() as cur:
        cur.execute(sql, (
            product.get("product_name", "")[:500],
            product.get("brand", "")[:200],
            product.get("category", "")[:100],
            _parse_price(str(product.get("price", ""))),
            _parse_rating(str(product.get("rating", ""))),
            int(product["review_count"]) if str(product.get("review_count", "")).isdigit() else None,
            product.get("product_url", "")[:1000],
            product.get("report_no", "")[:100],
            product.get("source", ""),
        ))
        row = cur.fetchone()
    conn.commit()
    return row[0] if row else None


def upsert_ingredients(conn, product_id: int, ingredients: list[str]) -> None:
    """전성분 리스트를 product_ingredients 테이블에 저장."""
    with conn.cursor() as cur:
        cur.execute("DELETE FROM product_ingredients WHERE product_id = %s", (product_id,))
        if ingredients:
            execute_values(
                cur,
                "INSERT INTO product_ingredients (product_id, ingredient_name, position) VALUES %s",
                [(product_id, ing[:300], idx) for idx, ing in enumerate(ingredients)],
            )
    conn.commit()


def bulk_save(conn, products: list[dict], parse_ingredients_fn) -> dict:
    """
    제품 리스트를 일괄 저장.
    parse_ingredients_fn: ingredients_raw(str) -> list[str]
    """
    success, failed = 0, 0

    for product in products:
        try:
            product_id = upsert_product(conn, product)
            if product_id:
                ingredients = parse_ingredients_fn(product.get("ingredients_raw", ""))
                if ingredients:
                    upsert_ingredients(conn, product_id, ingredients)
            success += 1
        except Exception as e:
            logger.error(f"저장 실패 ({product.get('product_name')}): {e}")
            conn.rollback()
            failed += 1

    logger.info(f"저장 완료 — 성공: {success}, 실패: {failed}")
    return {"success": success, "failed": failed}
