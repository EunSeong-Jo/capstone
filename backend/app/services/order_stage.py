"""주문 배송 단계.

**실제 택배 연동이 없다.** 그래서 배송 단계는 저장하지 않고 주문 시각에서
계산한다 — 결제완료 → 배송준비중 → 배송중 → 배송완료. 시연에서 취소(결제완료
단계)와 반품(배송완료 단계)을 바로 보여줄 수 있게 간격을 짧게 잡았다.
택배사 연동이 붙으면 이 계산을 송장 상태 조회로 바꾸면 된다.

취소·반품은 계산이 아니라 기록이다(`orders.status`, `closed_at`).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

# (단계, 주문 뒤 이 시간이 지나면 이 단계가 된다)
STAGE_SCHEDULE: list[tuple[str, timedelta]] = [
    ("paid", timedelta(0)),
    ("preparing", timedelta(minutes=5)),
    ("shipping", timedelta(minutes=15)),
    ("delivered", timedelta(minutes=30)),
]

CANCELLED = "cancelled"
RETURNED = "returned"
CLOSED_STATUSES = (CANCELLED, RETURNED)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def shipping_stage(placed_at: datetime, now: datetime | None = None) -> str:
    """지금 배송 단계. 취소·반품 여부와 무관한 '예정대로라면'의 단계다."""
    elapsed = (now or datetime.now(timezone.utc)) - _aware(placed_at)
    stage = STAGE_SCHEDULE[0][0]
    for name, after in STAGE_SCHEDULE:
        if elapsed >= after:
            stage = name
    return stage


def order_stage(status: str, placed_at: datetime, now: datetime | None = None) -> str:
    """화면에 보일 단계. 취소·반품이면 그것이 우선이다."""
    if status in CLOSED_STATUSES:
        return status
    return shipping_stage(placed_at, now)


def tracking(status: str, placed_at: datetime, closed_at: datetime | None,
             now: datetime | None = None) -> list[tuple[str, datetime | None]]:
    """배송조회 타임라인. 아직 오지 않은 단계는 시각이 None이다.

    취소·반품된 주문은 그 시점까지 지나간 단계만 시각을 갖는다.
    """
    placed = _aware(placed_at)
    cutoff = _aware(closed_at) if closed_at else (now or datetime.now(timezone.utc))
    return [
        (name, placed + after if placed + after <= cutoff else None)
        for name, after in STAGE_SCHEDULE
    ]


def can_cancel(status: str, placed_at: datetime, now: datetime | None = None) -> bool:
    return status == "placed" and shipping_stage(placed_at, now) == "paid"


def can_return(status: str, placed_at: datetime, now: datetime | None = None) -> bool:
    return status == "placed" and shipping_stage(placed_at, now) == "delivered"
