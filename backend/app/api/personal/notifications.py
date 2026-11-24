"""알림 — /api/v1/me/notifications."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import Depends, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.personal import NotificationOut, NotificationsOut
from app.models.user import Profile
from app.services.commerce.notifications import build_feed
from app.api.personal._common import router

@router.get("/notifications", response_model=NotificationsOut, summary="알림")
async def list_notifications(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NotificationsOut:
    """주문·포인트·후기·선물·진단 기록에서 만든 알림 피드.

    **알림을 저장하지 않는다.** 행동할 때마다 알림 행을 심는 대신 매번
    기록을 훑는다 — 심는 코드를 빠뜨릴 일이 없고, 과거에 한 일도 소급해서
    보인다. 자세한 배경은 services/commerce/notifications.py에 있다.

    가격 인하·재입고 알림은 만들지 않는다. 가격 이력 테이블이 없고 재입고
    신청 기능 자체가 없어서, 지금 내보내면 지어낸 알림이 된다.
    """
    profile = await db.scalar(select(Profile).where(Profile.user_id == user.id))
    seen_at = profile.notifications_seen_at if profile else None

    feed = await build_feed(db, user)
    items = [
        NotificationOut(
            id=n.id,
            kind=n.kind,
            title=n.title,
            body=n.body,
            at=n.at,
            link=n.link,
            unread=seen_at is None or n.at > seen_at,
        )
        for n in feed
    ]
    return NotificationsOut(
        items=items,
        unread_count=sum(1 for i in items if i.unread),
    )


@router.post(
    "/notifications/seen",
    status_code=204,
    response_class=Response,
    summary="알림 읽음 표시",
)
async def mark_notifications_seen(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """지금까지의 알림을 읽은 것으로 표시한다.

    건별이 아니라 시각 하나로 끊는다. 알림이 저장돼 있지 않아 건별 상태를
    둘 데가 없고, 알림함은 열면 전부 보는 화면이라 그걸로 충분하다.
    """
    profile = await db.scalar(select(Profile).where(Profile.user_id == user.id))
    if profile is None:
        profile = Profile(user_id=user.id)
        db.add(profile)
    profile.notifications_seen_at = datetime.now(timezone.utc)
    await db.commit()
    return Response(status_code=204)
