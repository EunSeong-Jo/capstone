"""주문 — POST /api/v1/orders(장바구니 결제) · /api/v1/me/orders(내역·취소·반품·자주 구매)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import Depends, HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.personal import CartItem, Order, OrderItem, PointTransaction, Review
from app.models.product import Product
from app.models.user import User
from app.schemas.personal import (
    FrequentItemOut,
    OrderCloseIn,
    OrderItemOut,
    OrderOut,
    TrackingStepOut,
)
from app.services.commerce.order_stage import (
    CANCELLED,
    CLOSED_STATUSES,
    RETURNED,
    can_cancel,
    can_return,
    order_stage,
    tracking,
)
from app.api.personal._common import router, orders_router, POINT_RATE, _products_of
from app.api.personal.closet import _closet_add_ordered, _closet_release_ordered

# ── 주문 ──────────────────────────────────────────────────────


async def _order_out(db: AsyncSession, order: Order) -> OrderOut:
    items = list(
        await db.scalars(
            select(OrderItem).where(OrderItem.order_id == order.id).order_by(OrderItem.id)
        )
    )
    reviewed = set(
        await db.scalars(
            select(Review.order_item_id).where(
                Review.order_item_id.in_([i.id for i in items] or [0])
            )
        )
    )
    return OrderOut(
        id=order.id,
        total=order.total,
        status=order.status,
        placed_at=order.placed_at,
        stage=order_stage(order.status, order.placed_at),
        tracking=[
            TrackingStepOut(stage=name, at=at)
            for name, at in tracking(order.status, order.placed_at, order.closed_at)
        ],
        can_cancel=can_cancel(order.status, order.placed_at),
        can_return=can_return(order.status, order.placed_at),
        closed_at=order.closed_at,
        close_reason=order.close_reason,
        items=[
            OrderItemOut(
                id=i.id,
                product_id=i.product_id,
                product_name=i.product_name,
                brand_name=i.brand_name,
                unit_price=i.unit_price,
                qty=i.qty,
                reviewed=i.id in reviewed,
            )
            for i in items
        ],
    )


@orders_router.post("", response_model=OrderOut, status_code=201, summary="주문(장바구니 결제)")
async def place_order(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrderOut:
    """장바구니를 주문으로 바꾼다.

    **실제 결제는 없다.** 그래도 진짜 행을 남기는 이유는 주문내역·후기·
    포인트·'자주 구매'가 전부 여기서 파생되기 때문이다 — 지금까지 그
    화면들은 각자 하드코딩된 예시를 들고 있었다.

    가격은 결제 시점의 값을 order_items에 박제한다. 제품 가격이 나중에
    바뀌어도 과거 주문 금액이 따라 움직이면 안 된다.
    """
    rows = list(await db.scalars(select(CartItem).where(CartItem.user_id == user.id)))
    if not rows:
        raise HTTPException(status_code=422, detail="장바구니가 비어 있습니다")

    catalog = list(
        await db.scalars(
            select(Product)
            .where(Product.id.in_([r.product_id for r in rows]))
            .options(joinedload(Product.brand))
        )
    )
    by_id = {p.id: p for p in catalog}

    order = Order(user_id=user.id, total=0)
    db.add(order)
    await db.flush()

    total = 0
    for row in rows:
        product = by_id.get(row.product_id)
        if product is None:
            continue
        unit_price = product.price or 0
        total += unit_price * row.qty
        db.add(
            OrderItem(
                order_id=order.id,
                product_id=product.id,
                product_name=product.display_name or product.name,
                brand_name=product.brand.name if product.brand else None,
                unit_price=unit_price,
                qty=row.qty,
            )
        )

    order.total = total
    if total > 0:
        db.add(
            PointTransaction(
                user_id=user.id,
                amount=int(total * POINT_RATE),
                reason="order",
                order_id=order.id,
            )
        )

    # 산 제품은 화장대에 담는다(같은 트랜잭션 — 주문이 실패하면 담기지도 않는다).
    await _closet_add_ordered(db, user.id, [r.product_id for r in rows if r.product_id in by_id])

    await db.execute(delete(CartItem).where(CartItem.user_id == user.id))
    await db.commit()
    await db.refresh(order)
    return await _order_out(db, order)


@router.get("/orders", response_model=list[OrderOut], summary="주문내역")
async def list_orders(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[OrderOut]:
    orders = list(
        await db.scalars(
            select(Order)
            .where(Order.user_id == user.id)
            .order_by(Order.placed_at.desc())
        )
    )
    return [await _order_out(db, o) for o in orders]


async def _close_order(
    db: AsyncSession, user: User, order_id: uuid.UUID, new_status: str,
    reason: str | None,
) -> OrderOut:
    """취소·반품 공통. 적립했던 주문 포인트도 회수한다."""
    order = await db.scalar(
        select(Order).where(Order.id == order_id, Order.user_id == user.id)
    )
    if order is None:
        raise HTTPException(status_code=404, detail="주문을 찾을 수 없습니다")

    allowed = (
        can_cancel(order.status, order.placed_at)
        if new_status == CANCELLED
        else can_return(order.status, order.placed_at)
    )
    if not allowed:
        detail = (
            "결제완료 단계에서만 취소할 수 있어요"
            if new_status == CANCELLED
            else "배송완료된 주문만 반품할 수 있어요"
        )
        raise HTTPException(status_code=409, detail=detail)

    order.status = new_status
    order.closed_at = datetime.now(timezone.utc)
    order.close_reason = (reason or "").strip() or None

    earned = await db.scalar(
        select(func.coalesce(func.sum(PointTransaction.amount), 0)).where(
            PointTransaction.order_id == order.id, PointTransaction.reason == "order"
        )
    )
    if earned:
        db.add(
            PointTransaction(
                user_id=user.id,
                amount=-int(earned),
                reason="order_cancel" if new_status == CANCELLED else "order_return",
                order_id=order.id,
            )
        )
    # 취소·반품했으니 이 주문으로 담긴 제품은 화장대에서 뺀다.
    await _closet_release_ordered(db, user.id, order.id)
    await db.commit()
    await db.refresh(order)
    return await _order_out(db, order)


@router.post("/orders/{order_id}/cancel", response_model=OrderOut, summary="주문 취소")
async def cancel_order(
    order_id: uuid.UUID,
    body: OrderCloseIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrderOut:
    """결제완료 단계(배송 준비 전)에서만 된다. 실제 결제가 없어 환불은 기록뿐이다."""
    return await _close_order(db, user, order_id, CANCELLED, body.reason)


@router.post("/orders/{order_id}/return", response_model=OrderOut, summary="반품 신청")
async def return_order(
    order_id: uuid.UUID,
    body: OrderCloseIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrderOut:
    """배송완료된 주문만. 회수·검수 과정이 없어 신청 즉시 반품 완료로 기록한다."""
    return await _close_order(db, user, order_id, RETURNED, body.reason)


@router.get("/orders/frequent", response_model=list[FrequentItemOut], summary="자주 구매")
async def list_frequent(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[FrequentItemOut]:
    """구매 횟수 내림차순. 주문 기록이 없으면 빈 목록이다.

    빈 목록을 목업으로 채우지 않는다 — 예전에는 그 자리에 가짜 '3회 구매'
    카드가 있었고, id가 실재 제품과 겹쳐 엉뚱한 상세가 열렸다.
    """
    rows = list(
        await db.execute(
            select(
                OrderItem.product_id,
                func.sum(OrderItem.qty).label("cnt"),
                func.max(Order.placed_at).label("last"),
            )
            .join(Order, Order.id == OrderItem.order_id)
            .where(Order.user_id == user.id, OrderItem.product_id.is_not(None))
            # 취소·반품한 주문은 산 것이 아니다.
            .where(Order.status.not_in(CLOSED_STATUSES))
            .group_by(OrderItem.product_id)
            .order_by(func.sum(OrderItem.qty).desc())
            .limit(20)
        )
    )
    products = await _products_of(db, [r.product_id for r in rows])
    return [
        FrequentItemOut(
            product=products[r.product_id],
            purchase_count=int(r.cnt),
            last_ordered_at=r.last,
        )
        for r in rows
        if r.product_id in products
    ]
