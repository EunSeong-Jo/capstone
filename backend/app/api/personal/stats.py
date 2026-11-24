"""대시보드 숫자 — /api/v1/me/stats."""

from __future__ import annotations

from typing import Any

from fastapi import Depends, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.personal import (
    CartItem,
    ClosetItem,
    Gift,
    Like,
    Order,
    OrderItem,
    PointTransaction,
    Review,
    ScanResult,
)
from app.models.user import User
from app.schemas.personal import StatsOut
from app.services.commerce.experience import level_of, total_exp
from app.services.commerce.order_stage import CLOSED_STATUSES, order_stage
from app.api.personal._common import router
from app.api.personal.closet import CLOSET_REMOVED

# ── 통계 ──────────────────────────────────────────────────────


@router.get("/stats", response_model=StatsOut, summary="대시보드 숫자")
async def read_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StatsOut:
    """전부 실제 행에서 센다.

    예전에는 홈과 마이페이지에 `{saved: 128400, scans: 21, swaps: 9}` 같은
    고정값이 박혀 있었다.

    **레벨·경험치도 여기서 계산한다.** 클라이언트가 행동할 때마다 더해
    나가면 값이 그 브라우저에만 쌓여 기기를 바꾸면 0부터 다시 시작하고,
    콘솔에서 고쳐도 서버는 모른다. 계산식은 services/commerce/experience.py에 있다.

    한 쿼리로 모으는 이유
    ---------------------
    세는 대상이 9가지인데, 예전에는 그만큼 쿼리를 **순차로** 날렸다. DB가
    Neon(원격)이라 쿼리 한 번 왕복이 실측 212ms여서 그것만으로 2초가 넘었고,
    홈에서 레벨이 한참 뒤에 튀어나왔다. 스칼라 서브쿼리로 합치면 왕복이
    한 번이다 — 실측 3,663ms → 410ms.

    `asyncio.gather`로 병렬화할 수는 없다. 하나의 AsyncSession은 동시에
    두 쿼리를 보낼 수 없다.
    """

    def rows_of(model) -> Any:
        """이 사용자의 행 수. 선물만 컬럼 이름이 다르다(보낸 사람).
        주문은 취소·반품을 빼고 센다 — 산 것이 아니다. 화장대는 삭제된 제품을 뺀다."""
        owner = Gift.sender_user_id if model is Gift else model.user_id
        stmt = select(func.count()).select_from(model).where(owner == user.id)
        if model is Order:
            stmt = stmt.where(Order.status.not_in(CLOSED_STATUSES))
        if model is ClosetItem:
            stmt = stmt.where(ClosetItem.status != CLOSET_REMOVED)
        return stmt.scalar_subquery()

    def sum_of(column, owner) -> Any:
        stmt = select(func.coalesce(func.sum(column), 0)).where(owner == user.id)
        if column is Order.total:
            stmt = stmt.where(Order.status.not_in(CLOSED_STATUSES))
        return stmt.scalar_subquery()

    (
        closet,
        likes,
        orders,
        scans,
        reviews,
        gifts,
        spent,
        points,
        cart_qty,
        received_gifts,
        closed_orders,
    ) = (
        await db.execute(
            select(
                rows_of(ClosetItem),
                rows_of(Like),
                rows_of(Order),
                rows_of(ScanResult),
                rows_of(Review),
                rows_of(Gift),
                sum_of(Order.total, Order.user_id),
                sum_of(PointTransaction.amount, PointTransaction.user_id),
                sum_of(CartItem.qty, CartItem.user_id),
                select(func.count()).select_from(Gift).where(Gift.recipient_user_id == user.id).scalar_subquery(),
                select(func.count())
                .select_from(Order)
                .where(Order.user_id == user.id, Order.status.in_(CLOSED_STATUSES))
                .scalar_subquery(),
            )
        )
    ).one()

    # 후기를 쓸 수 있는 제품: 취소·반품이 아닌 주문 중 배송이 끝났고 아직 후기가 없는 줄.
    # 배송 단계는 주문 시각으로 계산하는 값이라(order_stage) 행을 받아 파이썬에서 센다.
    item_rows = (
        await db.execute(
            select(OrderItem.product_id, Order.status, Order.placed_at)
            .join(Order, Order.id == OrderItem.order_id)
            .where(
                Order.user_id == user.id,
                Order.status.not_in(CLOSED_STATUSES),
                ~select(Review.id).where(Review.order_item_id == OrderItem.id).exists(),
            )
        )
    ).all()
    reviewable = sum(1 for pid, status, placed in item_rows if pid is not None and order_stage(status, placed) == "delivered")

    exp = total_exp(scans=scans, reviews=reviews, orders=orders, gifts=gifts)
    level, exp_in_level, level_span = level_of(exp)

    return StatsOut(
        closet_count=closet,
        cart_count=cart_qty,
        like_count=likes,
        order_count=orders,
        scan_count=scans,
        review_count=reviews,
        gift_count=gifts,
        received_gift_count=received_gifts,
        cancel_return_count=closed_orders,
        reviewable_count=reviewable,
        total_spent=spent,
        point_balance=points,
        exp=exp,
        level=level,
        exp_in_level=exp_in_level,
        level_span=level_span,
    )
