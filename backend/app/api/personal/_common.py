"""개인 데이터 API가 함께 쓰는 라우터 · 상수 · 제품 조인."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.api.products import _to_out
from app.models.product import Product
from app.schemas.product import ProductOut

router = APIRouter(prefix="/api/v1/me", tags=["personal"])
orders_router = APIRouter(prefix="/api/v1/orders", tags=["orders"])
gifts_router = APIRouter(prefix="/api/v1/gifts", tags=["gifts"])
reviews_router = APIRouter(prefix="/api/v1/reviews", tags=["reviews"])


# 최근 본 상품 보관 개수. 넘으면 오래된 것부터 지운다.
RECENT_LIMIT = 30

# 주문 1원당 적립 포인트 비율(1%). 결제가 흉내라 포인트도 상징적이지만,
# **계산식이 한 곳에 있다**는 점이 중요하다 — 화면마다 다른 숫자를 쓰지 않는다.
POINT_RATE = 0.01
# 후기 작성 적립. 고정액이다.
REVIEW_POINT = 100


async def _products_of(db: AsyncSession, ids: list[int]) -> dict[int, ProductOut]:
    """제품 id 목록 → 응답 DTO. 없는 id는 결과에서 빠진다."""
    if not ids:
        return {}
    rows = await db.scalars(
        select(Product)
        .where(Product.id.in_(ids))
        .options(joinedload(Product.brand), joinedload(Product.category))
    )
    return {p.id: _to_out(p) for p in rows}


async def _require_product(db: AsyncSession, product_id: int) -> None:
    """없는 제품을 담으려 하면 404.

    FK가 이미 막지만, 그대로 두면 IntegrityError가 500으로 올라간다.
    카탈로그에 없는 id는 클라이언트의 실수이므로 404로 알린다.
    """
    exists = await db.scalar(select(Product.id).where(Product.id == product_id))
    if exists is None:
        raise HTTPException(status_code=404, detail="제품을 찾을 수 없습니다")
