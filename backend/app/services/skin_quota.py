"""사진 분석 이용 한도.

규칙
----
- 얼굴 사진 수집에 **동의한** 사용자만 쓸 수 있다(동의가 없으면 허용 0회).
- 동의한 무료 사용자는 달마다 `SKIN_FREE_MONTHLY`회, 활성 구독자는
  `SKIN_SUBSCRIBER_MONTHLY`회다. 해지한 구독도 기간이 남았으면 구독자다.
- 달의 경계는 Asia/Seoul 기준 1일 0시다.
- **성공한 분석만** 센다(`skin_analyses`에 행이 생긴 것). 얼굴이 인식되지 않는
  실패는 행이 없으므로 한도를 쓰지 않는다.

Redis 카운터를 쓰지 않는 이유: 돈이 걸린 한도가 캐시 장애 때 풀리면 안 된다
(`core/rate_limit.py`는 fail-open이다). 횟수는 DB의 분석 행에서 센다.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.rate_limit import SEOUL_TZ
from app.models.skin_photo import FACE_PHOTO, SkinAnalysis, Subscription, UserConsent

# Perfect Corp에 요청하는 분석 항목(SD 이름). 가격표상 5~8개는 12유닛, 9~12개는 14유닛, 13~16개는 16유닛이다.
# 앞의 5개 + skin_type은 진단 점수·보정에 쓰이고, 나머지는 결과 화면 표시용이다.
BASIC_CONCERNS: tuple[str, ...] = (
    "oiliness", "moisture", "redness", "age_spot", "acne", "skin_type", "pore", "wrinkle",
)
EXTENDED_CONCERNS: tuple[str, ...] = BASIC_CONCERNS + (
    "firmness", "radiance", "texture", "dark_circle_v2",
    "eye_bag", "droopy_upper_eyelid", "droopy_lower_eyelid", "tear_trough",
)

SUBSCRIPTION_PERIOD_DAYS = 30


def basic_items_only(email: str | None) -> bool:
    """구독 중이어도 기본 항목(8개)만 분석하는 계정인가(`SKIN_BASIC_ITEMS_EMAILS`). 대소문자·공백은 무시한다."""
    if not email:
        return False
    allowed = {e.strip().lower() for e in settings.SKIN_BASIC_ITEMS_EMAILS.split(",") if e.strip()}
    return email.strip().lower() in allowed


@dataclass(frozen=True)
class Quota:
    plan: str                 # free / subscriber
    allowance: int
    used: int
    resets_at: datetime
    consent_granted: bool
    # True면 구독자여도 확장 항목을 분석하지 않는다. 횟수(allowance)와 구독 상태(plan)는 그대로다.
    basic_only: bool = False

    @property
    def remaining(self) -> int:
        return max(0, self.allowance - self.used)

    @property
    def extended(self) -> bool:
        return self.plan == "subscriber" and not self.basic_only

    @property
    def quota_kind(self) -> str:
        return "subscription" if self.plan == "subscriber" else "free"

    @property
    def concern_set(self) -> str:
        return "extended" if self.extended else "basic"

    @property
    def concerns(self) -> tuple[str, ...]:
        return EXTENDED_CONCERNS if self.extended else BASIC_CONCERNS


def month_window(now: datetime) -> tuple[datetime, datetime]:
    """`now`가 속한 서울 달의 [시작, 다음 달 시작)."""
    local = now.astimezone(SEOUL_TZ)
    start = local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1)
    else:
        end = start.replace(month=start.month + 1)
    return start, end


async def lock_user(db: AsyncSession, user_id: uuid.UUID) -> None:
    """사용자 단위 트랜잭션 잠금. 같은 사용자의 동시 요청이 한도를 함께 넘지 않게 한다."""
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": f"skin-analysis:{user_id}"}
    )


async def has_face_consent(db: AsyncSession, user_id: uuid.UUID) -> bool:
    """**지금 문구 버전**에 대한 유효한 동의가 있는가."""
    row = await db.scalar(
        select(UserConsent).where(
            UserConsent.user_id == user_id, UserConsent.consent_type == FACE_PHOTO
        )
    )
    return (
        row is not None
        and row.withdrawn_at is None
        and row.version == settings.FACE_CONSENT_VERSION
    )


async def active_subscription(
    db: AsyncSession, user_id: uuid.UUID, now: datetime
) -> Subscription | None:
    """기간이 남은 구독(해지했어도 `current_period_end`까지는 유효)."""
    return await db.scalar(
        select(Subscription)
        .where(Subscription.user_id == user_id, Subscription.current_period_end > now)
        .order_by(Subscription.current_period_end.desc())
        .limit(1)
    )


async def get_quota(
    db: AsyncSession, user_id: uuid.UUID, now: datetime | None = None, *, basic_only: bool = False
) -> Quota:
    now = now or datetime.now(SEOUL_TZ)
    start, end = month_window(now)

    consent = await has_face_consent(db, user_id)
    subscribed = await active_subscription(db, user_id, now) is not None
    plan = "subscriber" if subscribed else "free"

    if not consent:
        allowance = 0
    else:
        allowance = (
            settings.SKIN_SUBSCRIBER_MONTHLY if subscribed else settings.SKIN_FREE_MONTHLY
        )

    used = await db.scalar(
        select(func.count())
        .select_from(SkinAnalysis)
        .where(
            SkinAnalysis.user_id == user_id,
            SkinAnalysis.created_at >= start,
            SkinAnalysis.created_at < end,
        )
    )
    return Quota(
        plan=plan,
        allowance=allowance,
        used=used or 0,
        resets_at=end,
        consent_granted=consent,
        basic_only=basic_only,
    )
