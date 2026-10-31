"""성분 사전 응답 스키마 (검색 > 성분검색 > 성분 사전)."""
from __future__ import annotations

from app.schemas.product import _CamelModel


class IngredientCategoryOut(_CamelModel):
    """사전의 분류 한 칸. 기능(보습·진정…)과 주의(알레르기·자극…) 두 묶음이다."""

    id: str
    label: str
    emoji: str
    group: str          # 'function' | 'caution'
    blurb: str          # 한 줄 안내
    count: int          # 이 분류의 성분 수(제품에 쓰이는 것만)


class IngredientCategoryListOut(_CamelModel):
    items: list[IngredientCategoryOut]


class IngredientDictItemOut(_CamelModel):
    """사전의 성분 1건. 설명이 없으면 description·keywords는 비고 라벨만 채워진다."""

    id: int
    name: str
    name_en: str | None = None
    functions: list[str] = []      # H B S W A O P E U
    role: str | None = None        # a e s f t p x j
    flags: list[str] = []          # I F L
    confidence: int | None = None  # 1~3
    is_allergen: bool = False
    grade: str | None = None       # 'warn' | 'normal' | None(라벨 없음). 피부타입과 무관한 기준이라 'key'는 나오지 않는다
    description: str | None = None
    keywords: list[str] = []
    description_source: str | None = None
    product_count: int = 0         # 이 성분이 든 판매 중 제품 수


class IngredientDictListOut(_CamelModel):
    items: list[IngredientDictItemOut]
    total: int
    page: int
    size: int
