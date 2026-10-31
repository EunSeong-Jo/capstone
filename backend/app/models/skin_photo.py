"""얼굴 사진 AI 피부 분석 도메인.

**원본 사진을 담지 않는다.** 사진은 분석 요청 중 메모리에만 있고
(`docs/dev_guidelines.md` 11.2), 여기에는 동의 기록·구독 상태·분석에서 뽑은
점수, 그리고 업체가 돌려준 **얼굴 없는 투명 마스크 PNG**(`SkinAnalysisImage`)만 남는다.
마스크 이미지 URL(2시간 만료)은 저장하지 않는다.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, LargeBinary, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

FACE_PHOTO = "face_photo"


class UserConsent(Base):
    """동의 기록. (사용자, 종류)당 1행이고 재동의·철회는 같은 행을 갱신한다.

    `version`은 동의받을 당시 문구의 버전이다. 문구가 바뀌어 버전이 달라지면
    이전 동의는 현재 문구에 대한 동의로 보지 않는다(services/skin_quota.py).
    """

    __tablename__ = "user_consents"
    __table_args__ = (UniqueConstraint("user_id", "consent_type", name="uq_user_consents"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    consent_type: Mapped[str] = mapped_column(Text, nullable=False)
    version: Mapped[str] = mapped_column(Text, nullable=False)
    agreed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )
    withdrawn_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Subscription(Base):
    """AI 피부관리 구독.

    **결제는 붙어 있지 않다.** 활성화는 버튼 한 번으로 기간만 기록한다(장바구니
    결제와 같은 성격). PG를 붙일 때 이 행을 만드는 지점이 바뀔 뿐 구조는 같다.
    해지(`cancelled`)해도 `current_period_end`까지는 구독자로 본다.
    """

    __tablename__ = "subscriptions"
    __table_args__ = (Index("idx_subscriptions_user", "user_id", "current_period_end"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    plan: Mapped[str] = mapped_column(Text, nullable=False, server_default="ai_skin_care")
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="active")
    current_period_start: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    current_period_end: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class SkinAnalysis(Base):
    """성공한 사진 분석 1회 = 1행. 월 이용 횟수도 이 행을 센다.

    실패한 분석(얼굴 인식 실패 등)은 행을 만들지 않으므로 한도를 쓰지 않는다.
    `metrics`에는 점수와 피부타입 문자열만 있고 이미지 URL은 없다.
    """

    __tablename__ = "skin_analyses"
    __table_args__ = (Index("idx_skin_analyses_user", "user_id", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )
    quota_kind: Mapped[str] = mapped_column(Text, nullable=False)       # free / subscription
    concern_set: Mapped[str] = mapped_column(Text, nullable=False)      # basic / extended
    provider_mode: Mapped[str] = mapped_column(Text, nullable=False)    # sd / hd / mock / sample(허용 계정 외: 저장된 분석을 복사)
    metrics: Mapped[dict] = mapped_column(JSONB, nullable=False)


class SkinAnalysisImage(Base):
    """분석 항목별 결과 이미지(투명 PNG). (분석, 항목)당 1행.

    컨테이너 디스크는 재배포 때 사라지므로 DB에 둔다. 한 장이 수백 KB라 분석 1회에 2~3MB.
    분석이 지워지면(계정 삭제 포함) 함께 지워지고, 동의를 철회하면 사용자 단위로 지운다.
    `user_id`는 철회 때 조인 없이 지우려고 둔다.
    """

    __tablename__ = "skin_analysis_images"
    __table_args__ = (Index("idx_skin_analysis_images_user", "user_id"),)

    analysis_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("skin_analyses.id", ondelete="CASCADE"), primary_key=True
    )
    key: Mapped[str] = mapped_column(Text, primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    png: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )
