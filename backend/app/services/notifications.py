"""알림 피드.

**알림을 저장하지 않는다.** 기록에서 뽑아 만든다 — 주문·포인트·후기·선물·
진단에 전부 시각이 박혀 있어서, 매번 훑으면 같은 목록이 나온다. 경험치를
`/me/stats`에서 계산하는 것과 같은 방식이다.

이렇게 하면
  - 알림을 만들어 넣는 코드를 행동마다 심지 않아도 된다(빠뜨릴 일이 없다)
  - 과거에 한 일까지 소급해서 보인다
  - 저장한 알림과 실제 기록이 어긋날 수 없다

저장하는 것은 "어디까지 읽었는지"(`profiles.notifications_seen_at`) 하나다.

지금 못 만드는 알림
-------------------
가격 인하는 `products.price`가 현재값 하나뿐이라 "21,000원 → 18,900원"을
만들 수 없다(가격 이력 테이블이 필요하다). 재입고는 신청 기능 자체가 없다.
**둘 다 만들지 않는다** — 근거 없이 흉내 내면 목업과 다를 바 없다.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.diagnosis import Diagnosis
from app.models.personal import Gift, Order, OrderItem, PointTransaction, Review
from app.models.user import User

# 진단을 다시 권하는 간격. 계절이 두 번 바뀌는 정도다.
REDIAGNOSE_AFTER = timedelta(days=90)

# 한 번에 내는 최대 건수. 오래된 주문까지 전부 내려 보낼 이유가 없다.
MAX_ITEMS = 30


@dataclass(slots=True)
class Notification:
    """화면이 그리는 알림 한 건.

    `kind`는 아이콘과 이동 경로를 정하는 데 쓴다. `at`이 정렬 기준이자
    읽음 판정 기준이다.
    """

    id: str
    kind: str
    title: str
    body: str
    at: datetime
    # 탭했을 때 갈 곳. 없으면 그냥 알림이다.
    link: str | None = None


async def build_feed(db: AsyncSession, user: User) -> list[Notification]:
    """이 사용자의 기록에서 알림을 만든다. 최신순."""
    items: list[Notification] = []

    # 주문
    orders = list(
        await db.scalars(
            select(Order)
            .where(Order.user_id == user.id)
            .order_by(Order.placed_at.desc())
            .limit(MAX_ITEMS)
        )
    )
    for order in orders:
        items.append(
            Notification(
                id=f"order:{order.id}",
                kind="order",
                title="주문이 접수됐어요",
                body=f"{order.total:,}원 결제 · 주문내역에서 확인할 수 있어요",
                at=order.placed_at,
                link="/mypage/order-history",
            )
        )

    # 포인트 적립
    points = list(
        await db.scalars(
            select(PointTransaction)
            .where(PointTransaction.user_id == user.id, PointTransaction.amount > 0)
            .order_by(PointTransaction.created_at.desc())
            .limit(MAX_ITEMS)
        )
    )
    for tx in points:
        items.append(
            Notification(
                id=f"point:{tx.id}",
                kind="point",
                title=f"{tx.amount:,}P 적립됐어요",
                body="포인트 내역에서 확인할 수 있어요",
                at=tx.created_at,
                link="/mypage/points",
            )
        )

    # 아직 후기를 안 쓴 주문 항목. 개수만 알리고 목록으로 보낸다 —
    # 항목마다 알림을 내면 한 번 주문에 알림이 여러 개 쌓인다.
    # 개수와 가장 최근 주문 시각만 필요하므로 행을 내려받지 않고 DB에서 센다(예전에는 전부 읽어 왔다).
    todo_count, todo_at = (
        await db.execute(
            select(func.count(OrderItem.id), func.max(Order.placed_at))
            .join(Order, Order.id == OrderItem.order_id)
            .outerjoin(Review, Review.order_item_id == OrderItem.id)
            .where(Order.user_id == user.id, Review.id.is_(None))
        )
    ).one()
    if todo_count:
        items.append(
            Notification(
                id=f"review-todo:{todo_count}",
                kind="review",
                title="후기를 기다리는 제품이 있어요",
                body=f"{todo_count}건 · 주문내역에서 바로 쓸 수 있어요",
                at=todo_at,
                link="/mypage/order-history",
            )
        )

    # 선물
    gifts = list(
        await db.scalars(
            select(Gift)
            .where(Gift.sender_user_id == user.id)
            .order_by(Gift.created_at.desc())
            .limit(MAX_ITEMS)
        )
    )
    for gift in gifts:
        items.append(
            Notification(
                id=f"gift:{gift.id}",
                kind="gift",
                title=f"{gift.recipient_name}님께 보낼 선물을 기록했어요",
                body=gift.product_name,
                at=gift.created_at,
                link="/mypage/gifts",
            )
        )

    # 재진단 권유. 진단이 오래됐을 때만 낸다.
    latest = await db.scalar(
        select(Diagnosis)
        .where(Diagnosis.user_id == user.id)
        .order_by(Diagnosis.created_at.desc())
        .limit(1)
    )
    if latest is not None:
        age = datetime.now(timezone.utc) - latest.created_at
        if age >= REDIAGNOSE_AFTER:
            days = age.days
            items.append(
                Notification(
                    id=f"rediagnose:{latest.id}",
                    kind="diagnosis",
                    title="피부타입을 다시 진단해 보세요",
                    body=f"마지막 진단으로부터 {days}일이 지났어요. 계절이 바뀌면 피부도 달라져요",
                    # 진단 시점이 아니라 "다시 받을 때가 된 시점"이 알림의 시각이다.
                    at=latest.created_at + REDIAGNOSE_AFTER,
                    link="/qna",
                )
            )

    items.sort(key=lambda n: n.at, reverse=True)
    return items[:MAX_ITEMS]
