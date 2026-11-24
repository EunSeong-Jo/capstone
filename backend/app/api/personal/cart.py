"""장바구니 — /api/v1/me/cart."""

from __future__ import annotations

import uuid

from fastapi import Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.personal import CartItem
from app.models.user import User
from app.schemas.personal import CartItemIn, CartLineOut, CartOut, QtyIn
from app.api.personal._common import router, _products_of, _require_product

# ── 장바구니 ──────────────────────────────────────────────────


async def _cart_out(db: AsyncSession, user_id: uuid.UUID) -> CartOut:
    rows = list(
        await db.scalars(
            select(CartItem)
            .where(CartItem.user_id == user_id)
            .order_by(CartItem.added_at.desc())
        )
    )
    products = await _products_of(db, [r.product_id for r in rows])
    lines = [
        CartLineOut(id=r.id, product=products[r.product_id], qty=r.qty)
        for r in rows
        if r.product_id in products
    ]
    return CartOut(
        lines=lines,
        count=sum(line.qty for line in lines),
        subtotal=sum(line.product.price * line.qty for line in lines),
    )


@router.get("/cart", response_model=CartOut, summary="장바구니")
async def read_cart(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CartOut:
    return await _cart_out(db, user.id)


@router.post("/cart", response_model=CartOut, summary="장바구니에 담기")
async def add_cart(
    body: CartItemIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CartOut:
    await _require_product(db, body.product_id)

    # 같은 제품을 다시 담으면 수량이 더해진다. UPSERT로 한 번에 처리해
    # 조회-후-삽입 사이의 경합(같은 계정 두 탭)을 없앤다.
    stmt = (
        pg_insert(CartItem)
        .values(user_id=user.id, product_id=body.product_id, qty=body.qty)
        .on_conflict_do_update(
            constraint="uq_cart_user_product",
            set_={"qty": CartItem.qty + body.qty},
        )
    )
    await db.execute(stmt)
    await db.commit()
    return await _cart_out(db, user.id)


@router.patch("/cart/{product_id}", response_model=CartOut, summary="수량 변경")
async def set_cart_qty(
    product_id: int,
    body: QtyIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CartOut:
    if body.qty == 0:
        # 0은 삭제다. 수량 0짜리 행을 남기면 목록·합계가 그걸 세어야 한다.
        await db.execute(
            delete(CartItem).where(
                CartItem.user_id == user.id, CartItem.product_id == product_id
            )
        )
    else:
        row = await db.scalar(
            select(CartItem).where(
                CartItem.user_id == user.id, CartItem.product_id == product_id
            )
        )
        if row is None:
            raise HTTPException(status_code=404, detail="장바구니에 없는 제품입니다")
        row.qty = body.qty
    await db.commit()
    return await _cart_out(db, user.id)


@router.delete("/cart/{product_id}", response_model=CartOut, summary="장바구니에서 빼기")
async def remove_cart(
    product_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CartOut:
    await db.execute(
        delete(CartItem).where(
            CartItem.user_id == user.id, CartItem.product_id == product_id
        )
    )
    await db.commit()
    return await _cart_out(db, user.id)
