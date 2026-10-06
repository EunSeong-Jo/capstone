"""제품 점수 — 피부타입 매칭 · 별점 · 리뷰 수.

홈 추천(`api/recommendations_main.py`)과 예산 구매 가이드(`services/budget_guide.py`)가
같은 식으로 제품을 줄 세운다. 두 곳의 기준이 어긋나면 "홈에서는 1등인데 가이드에는
안 나오는" 일이 생기므로 한 곳에 둔다.
"""
from __future__ import annotations

import math

from sqlalchemy import Float, cast, func

from app.models.product import Product
from app.services.skin_type import SkinRule, fit_score

# 점수 가중치. 브랜드 다양성(W_BRAND)까지 합이 1이다.
W_MATCH = 0.4
W_RATING = 0.3
W_REVIEW = 0.2
W_BRAND = 0.1

# 매칭 성분 수를 0~1로 누르는 기준. 실측 상위 제품이 20종 안팎이라
# 그 위로는 더 벌어져도 의미가 없다.
MATCH_CAP = 20
# 리뷰수 로그 정규화 기준. 10만 리뷰를 1.0으로 본다.
REVIEW_LOG_CAP = math.log10(100_000)


def base_score(rule: SkinRule | None) -> tuple:
    """SQL에서 계산하는 세 항. (매칭, 별점, 리뷰) 각각 0~1로 정규화한다."""
    match = func.least(cast(fit_score(rule), Float) / MATCH_CAP, 1.0)
    rating = func.coalesce(cast(Product.rating, Float), 0.0) / 5.0
    review = func.least(
        func.log(func.greatest(func.coalesce(Product.review_count, 0), 1) + 1)
        / REVIEW_LOG_CAP,
        1.0,
    )
    return match, rating, review


def product_score(rule: SkinRule | None):
    """브랜드 다양성을 뺀 점수(0~0.9). SQL 표현식."""
    match, rating, review = base_score(rule)
    return W_MATCH * match + W_RATING * rating + W_REVIEW * review
