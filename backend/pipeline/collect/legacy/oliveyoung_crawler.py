"""
Task 2.2 — 올리브영 웹 크롤러
Selenium + BeautifulSoup으로 카테고리별 제품 정보 수집
"""

import time
import logging
from typing import Generator

from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

logger = logging.getLogger(__name__)

OLIVEYOUNG_BASE = "https://www.oliveyoung.co.kr"
CATEGORY_URLS = {
    "skincare": f"{OLIVEYOUNG_BASE}/store/display/getMCategoryList.do?dispCatNo=100000100010001",
    "base_makeup": f"{OLIVEYOUNG_BASE}/store/display/getMCategoryList.do?dispCatNo=100000100020001",
}


def _build_driver(headless: bool = True) -> webdriver.Chrome:
    options = Options()
    if headless:
        options.add_argument("--headless")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1920,1080")
    options.add_argument(
        "user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
    return webdriver.Chrome(options=options)


def _parse_product_list(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    products = []

    for item in soup.select("li.flag-wrap"):
        try:
            name_el = item.select_one("p.name")
            brand_el = item.select_one("span.tx-brand")
            price_el = item.select_one("span.tx-cur")
            rating_el = item.select_one("span.point")
            review_el = item.select_one("span.tx-num")
            link_el = item.select_one("a.prod-link")

            products.append({
                "product_name": name_el.get_text(strip=True) if name_el else "",
                "brand": brand_el.get_text(strip=True) if brand_el else "",
                "price": price_el.get_text(strip=True).replace(",", "").replace("원", "") if price_el else "",
                "rating": rating_el.get_text(strip=True) if rating_el else "",
                "review_count": review_el.get_text(strip=True).replace(",", "") if review_el else "",
                "product_url": OLIVEYOUNG_BASE + link_el["href"] if link_el else "",
                "source": "oliveyoung",
            })
        except Exception as e:
            logger.debug(f"제품 파싱 오류: {e}")

    return products


def _fetch_ingredients(driver: webdriver.Chrome, product_url: str) -> str:
    """제품 상세 페이지에서 전성분 텍스트 추출."""
    try:
        driver.get(product_url)
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "div.prd-detail"))
        )
        soup = BeautifulSoup(driver.page_source, "html.parser")

        for el in soup.select("div.prd-detail p, div.ingredient-wrap"):
            text = el.get_text(strip=True)
            if "전성분" in text or len(text) > 100:
                return text

        return ""
    except Exception as e:
        logger.debug(f"전성분 추출 실패 ({product_url}): {e}")
        return ""


def crawl_products(
    category: str = "skincare",
    max_pages: int = 20,
    fetch_ingredients: bool = True,
    headless: bool = True,
) -> Generator[dict, None, None]:
    """올리브영 카테고리 페이지를 순회하며 제품 정보를 수집."""
    base_url = CATEGORY_URLS.get(category, CATEGORY_URLS["skincare"])
    driver = _build_driver(headless)

    try:
        for page in range(1, max_pages + 1):
            url = f"{base_url}&pageIdx={page}"
            driver.get(url)

            try:
                WebDriverWait(driver, 10).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, "li.flag-wrap"))
                )
            except Exception:
                logger.info(f"올리브영 {category} 수집 완료 (총 {page - 1}페이지)")
                break

            products = _parse_product_list(driver.page_source)
            if not products:
                break

            for product in products:
                if fetch_ingredients and product["product_url"]:
                    product["ingredients_raw"] = _fetch_ingredients(driver, product["product_url"])
                    time.sleep(1.0)
                else:
                    product["ingredients_raw"] = ""
                product["category"] = category
                yield product

            logger.info(f"올리브영 {category} {page}페이지 완료 ({len(products)}개)")
            time.sleep(2.0)
    finally:
        driver.quit()
