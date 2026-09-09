"""
Task 2.1 — 식약처 공공데이터 API 수집기
의약품안전나라 화장품 전성분 API에서 제품 데이터를 수집하여 JSON으로 반환
"""

import time
import logging
import requests
from typing import Generator

from app.utils.ingredients import parse_ingredients as _parse_ingredients

logger = logging.getLogger(__name__)

MFDS_BASE_URL = "http://apis.data.go.kr/1471000/CsmtcsIrdntInfoService01/getCsmtcsIrdntInfo01"
PAGE_SIZE = 100


def fetch_products(api_key: str, category: str = None) -> Generator[dict, None, None]:
    """식약처 API에서 전체 제품 데이터를 페이지 단위로 수집."""
    page = 1
    total_fetched = 0

    while True:
        params = {
            "serviceKey": api_key,
            "pageNo": page,
            "numOfRows": PAGE_SIZE,
            "type": "json",
        }
        if category:
            params["PRDUCT_KND_NM"] = category

        try:
            resp = requests.get(MFDS_BASE_URL, params=params, timeout=30)
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            logger.error(f"식약처 API 요청 실패 (page={page}): {e}")
            break

        body = data.get("body", {})
        items = body.get("items", [])

        if not items:
            break

        for item in items:
            yield {
                "product_name": item.get("PRDUCT_NM", "").strip(),
                "brand": item.get("ENTRPS_NM", "").strip(),
                "category": item.get("PRDUCT_KND_NM", "").strip(),
                "ingredients_raw": item.get("IRDNT_NM", "").strip(),
                "report_no": item.get("PRDLST_RPRT_NO", "").strip(),
                "source": "mfds",
            }

        total_fetched += len(items)
        logger.info(f"식약처 수집 중: {total_fetched}개 완료 (page={page})")

        if len(items) < PAGE_SIZE:
            break

        page += 1
        time.sleep(0.5)  # API 호출 제한 준수


# 파싱 로직은 app/utils/ingredients.py로 옮겼다.
# 단순 split(",")은 '1,2-헥산다이올'을 '1' + '2-헥산다이올'로 쪼갠다.
# 기존 호출부 호환을 위해 이름을 그대로 노출한다.
parse_ingredients = _parse_ingredients
