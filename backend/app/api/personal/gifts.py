"""선물하기 — POST /api/v1/gifts · /api/v1/me/gifts/sent · received."""

from __future__ import annotations

from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.personal import Gift
from app.models.product import Product
from app.models.user import User
from app.schemas.personal import GiftIn, GiftOut
from app.api.personal._common import router, gifts_router

# ---------------------------------------------------------------------- 선물하기


def _gift_out(gift: Gift, sender_nickname: str | None = None) -> GiftOut:
    return GiftOut(
        id=gift.id,
        product_id=gift.product_id,
        product_name=gift.product_name,
        brand_name=gift.brand_name,
        unit_price=gift.unit_price,
        recipient_name=gift.recipient_name,
        sender_nickname=sender_nickname,
        message=gift.message,
        status=gift.status,
        created_at=gift.created_at,
    )


@gifts_router.post("", response_model=GiftOut, status_code=201, summary="선물 보내기")
async def send_gift(
    body: GiftIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GiftOut:
    """선물 기록을 남긴다.

    **결제도 전달도 없다.** `orders`와 같은 처지이고, 이유도 같다 — '보낸
    선물' 목록이 이 기록에서 파생되기 때문이다. 지금까지 그 목록은
    localStorage에 쌓이고 예시 데이터와 합쳐져 있었다.

    `status`는 항상 'pending'이다. 실제 발송 수단이 붙기 전까지 바뀌지 않고,
    화면도 그렇게 안내한다.
    """
    product = await db.scalar(
        select(Product).where(Product.id == body.product_id).options(joinedload(Product.brand))
    )
    if product is None:
        raise HTTPException(status_code=404, detail="제품을 찾을 수 없습니다")

    # 받는 사람은 닉네임으로 찾는다. 닉네임은 유일하지 않으므로 여럿이면
    # 누구에게 보낼지 정할 수 없다 — 아무에게나 보내지 않고 알린다.
    nickname = body.recipient_nickname.strip()
    recipients = list(
        await db.scalars(
            select(User.id).where(User.nickname == nickname, User.is_active.is_(True)).limit(2)
        )
    )
    if not recipients:
        raise HTTPException(status_code=404, detail=f"'{nickname}' 닉네임의 회원을 찾을 수 없어요")
    if len(recipients) > 1:
        raise HTTPException(
            status_code=409, detail=f"'{nickname}' 닉네임을 쓰는 회원이 여러 명이에요"
        )
    if recipients[0] == user.id:
        raise HTTPException(status_code=422, detail="나에게는 선물할 수 없어요")

    gift = Gift(
        sender_user_id=user.id,
        recipient_user_id=recipients[0],
        product_id=product.id,
        product_name=product.display_name or product.name,
        brand_name=product.brand.name if product.brand else None,
        unit_price=product.price or 0,
        recipient_name=nickname,
        message=(body.message or "").strip() or None,
    )
    db.add(gift)
    await db.commit()
    await db.refresh(gift)
    return _gift_out(gift)


@router.get("/gifts/sent", response_model=list[GiftOut], summary="보낸 선물")
async def list_sent_gifts(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[GiftOut]:
    gifts = list(
        await db.scalars(
            select(Gift)
            .where(Gift.sender_user_id == user.id)
            .order_by(Gift.created_at.desc())
        )
    )
    return [_gift_out(g) for g in gifts]


@router.get("/gifts/received", response_model=list[GiftOut], summary="받은 선물")
async def list_received_gifts(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[GiftOut]:
    rows = await db.execute(
        select(Gift, User.nickname)
        .join(User, User.id == Gift.sender_user_id)
        .where(Gift.recipient_user_id == user.id)
        .order_by(Gift.created_at.desc())
    )
    return [_gift_out(g, nickname or "익명") for g, nickname in rows]


# ------------------------------------------------------------------------ 알림
