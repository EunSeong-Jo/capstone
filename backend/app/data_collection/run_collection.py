"""
Task 2 — 데이터 수집 실행 스크립트
사용법: python -m app.data_collection.run_collection --source mfds|oliveyoung|all
"""

import argparse
import logging
import os

from .mfds_collector import fetch_products as fetch_mfds, parse_ingredients
from .oliveyoung_crawler import crawl_products
from .db_storage import get_connection, init_tables, bulk_save

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://swappy:swappy_dev@localhost:5432/swappy"
)
MFDS_API_KEY = os.getenv("MFDS_API_KEY", "")


def run_mfds(conn):
    logger.info("=== 식약처 API 수집 시작 ===")
    products = list(fetch_mfds(api_key=MFDS_API_KEY))
    result = bulk_save(conn, products, parse_ingredients)
    logger.info(f"식약처 수집 결과: {result}")


def run_oliveyoung(conn):
    logger.info("=== 올리브영 크롤링 시작 ===")
    for category in ["skincare", "base_makeup"]:
        products = list(crawl_products(category=category, max_pages=20))
        result = bulk_save(conn, products, parse_ingredients)
        logger.info(f"올리브영 {category} 결과: {result}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", choices=["mfds", "oliveyoung", "all"], default="all")
    args = parser.parse_args()

    conn = get_connection(DB_URL)
    init_tables(conn)

    if args.source in ("mfds", "all"):
        run_mfds(conn)
    if args.source in ("oliveyoung", "all"):
        run_oliveyoung(conn)

    conn.close()
    logger.info("=== 전체 수집 완료 ===")


if __name__ == "__main__":
    main()
