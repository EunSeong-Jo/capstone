"""화장대 — /api/v1/me/closet. 주문하면 담기고, 취소·반품하면 주문으로 담긴 것만 빠진다."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import Depends, Query, Response, status
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.personal import ClosetItem, Order, OrderItem
from app.models.user import User
from app.schemas.personal import ClosetItemIn, ClosetItemOut
from app.services.commerce.order_stage import CLOSED_STATUSES
from app.api.personal._common import router, _products_of, _require_product

# ── 화장대 ────────────────────────────────────────────────────


# 화장대에서 뺀 제품. 행을 지우지 않고 이 상태로 두면 '삭제된 제품'에서
# 다시 보고 복원할 수 있다. 영구 삭제만 행을 지운다.
CLOSET_REMOVED = "removed"
# 주문으로 화장대에 담긴 제품의 경로. 취소·반품하면 이 경로로 담긴 것만 되돌린다.
ORDER_VIA = "order"


async def _closet_add_ordered(db: AsyncSession, user_id: uuid.UUID, product_ids: list[int]) -> None:
    """주문한 제품을 화장대에 담는다 — 산 제품은 쓰는 제품이다.

    - 화장대에 없으면 '보유 중'으로 새로 담는다(경로: order)
    - '삭제된 제품'이면 보유 중으로 복원한다. 경로도 order로 바꿔, 이 주문을
      취소하면 다시 삭제된 제품으로 돌아가게 한다
    - 이미 보유 중이면 건드리지 않는다(원래 경로를 지킨다 — 취소해도 남는다)
    """
    if not product_ids:
        return
    existing = {
        c.product_id: c
        for c in await db.scalars(
            select(ClosetItem).where(
                ClosetItem.user_id == user_id, ClosetItem.product_id.in_(product_ids)
            )
        )
    }
    for pid in dict.fromkeys(product_ids):
        item = existing.get(pid)
        if item is None:
            db.add(ClosetItem(user_id=user_id, product_id=pid, status="owned", added_via=ORDER_VIA))
        elif item.status == CLOSET_REMOVED:
            item.status = "owned"
            item.added_via = ORDER_VIA
            item.added_at = datetime.now(timezone.utc)


async def _closet_release_ordered(db: AsyncSession, user_id: uuid.UUID, order_id: uuid.UUID) -> None:
    """취소·반품한 주문으로 담긴 제품을 '삭제된 제품'으로 옮긴다(복원할 수 있다).

    주문으로 담긴 것(경로 order)만 옮긴다. 원래 화장대에 있던 제품은 그대로다.
    같은 제품이 아직 살아 있는 다른 주문에도 있으면 그 주문 때문에 쓰는 제품이므로 남긴다.
    """
    ordered = select(OrderItem.product_id).where(
        OrderItem.order_id == order_id, OrderItem.product_id.is_not(None)
    )
    still_ordered = (
        select(OrderItem.product_id)
        .join(Order, Order.id == OrderItem.order_id)
        .where(
            Order.user_id == user_id,
            Order.id != order_id,
            Order.status.not_in(CLOSED_STATUSES),
            OrderItem.product_id.is_not(None),
        )
    )
    await db.execute(
        update(ClosetItem)
        .where(
            ClosetItem.user_id == user_id,
            ClosetItem.product_id.in_(ordered),
            ClosetItem.product_id.not_in(still_ordered),
            ClosetItem.added_via == ORDER_VIA,
            ClosetItem.status != CLOSET_REMOVED,
        )
        .values(status=CLOSET_REMOVED)
    )


@router.get("/closet", response_model=list[ClosetItemOut], summary="내 화장대")
async def list_closet(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ClosetItemOut]:
    rows = list(
        await db.scalars(
            select(ClosetItem)
            .where(ClosetItem.user_id == user.id)
            .order_by(ClosetItem.added_at.desc())
        )
    )
    products = await _products_of(db, [r.product_id for r in rows])
    return [
        ClosetItemOut(
            id=r.id,
            product=products[r.product_id],
            status=r.status,
            added_via=r.added_via,
            added_at=r.added_at,
        )
        for r in rows
        if r.product_id in products
    ]


@router.post("/closet", response_model=ClosetItemOut, status_code=201, summary="화장대에 담기")
async def add_closet(
    body: ClosetItemIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ClosetItemOut:
    await _require_product(db, body.product_id)

    # 이미 있으면 새로 만들지 않고 그대로 돌려준다. 화면이 중복 담기를
    # 막고 있지만 그건 약속일 뿐이고, 409를 내면 "이미 있음"을 화면이
    # 다시 다뤄야 한다.
    existing = await db.scalar(
        select(ClosetItem).where(
            ClosetItem.user_id == user.id, ClosetItem.product_id == body.product_id
        )
    )
    if existing is None:
        existing = ClosetItem(
            user_id=user.id,
            product_id=body.product_id,
            status=body.status,
            added_via=body.added_via,
        )
        db.add(existing)
        await db.commit()
        await db.refresh(existing)
    elif existing.status == CLOSET_REMOVED:
        # 삭제된 제품을 다시 담으면 복원이다. 담은 경로·시각은 처음 것을 둔다.
        existing.status = "owned"
        await db.commit()
        await db.refresh(existing)

    products = await _products_of(db, [existing.product_id])
    return ClosetItemOut(
        id=existing.id,
        product=products[existing.product_id],
        status=existing.status,
        added_via=existing.added_via,
        added_at=existing.added_at,
    )


@router.delete("/closet/{product_id}", status_code=204, response_class=Response,
               summary="화장대에서 빼기")
async def remove_closet(
    product_id: int,
    permanent: bool = Query(False, description="true면 '삭제된 제품'에서도 지운다"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """기본은 '삭제된 제품'으로 옮기기다. 다시 담으면(POST) 복원된다."""
    owned_by = (ClosetItem.user_id == user.id, ClosetItem.product_id == product_id)
    if permanent:
        await db.execute(delete(ClosetItem).where(*owned_by))
    else:
        await db.execute(
            update(ClosetItem).where(*owned_by).values(status=CLOSET_REMOVED)
        )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
