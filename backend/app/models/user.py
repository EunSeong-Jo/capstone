"""사용자 · 인증 도메인 (Task 12).

users.id를 UUID로 두는 이유: 계정 식별자가 URL·토큰에 노출되는데
정수 순번이면 가입자 수와 가입 순서가 그대로 드러난다.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),  # PG 13+ 코어 내장
    )
    email: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    password_hash: Mapped[str | None] = mapped_column(Text)  # bcrypt. 소셜 로그인은 NULL
    nickname: Mapped[str | None] = mapped_column(Text)
    provider: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="local"
    )  # local / kakao / google
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="true"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    profile: Mapped["Profile | None"] = relationship(
        back_populates="user", cascade="all, delete-orphan", uselist=False
    )
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Profile(Base, TimestampMixin):
    """users와 1:1.

    skin_type은 최신 진단 1순위를 복사해 둔 비정규화 캐시다. 매 요청마다
    diagnoses를 조회하지 않기 위한 것이며, 원본은 diagnosis_ranks다.
    """

    __tablename__ = "profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    skin_type: Mapped[str | None] = mapped_column(Text)  # 8타입 코드
    scores: Mapped[dict | None] = mapped_column(JSONB)  # 5축 점수
    budget_min: Mapped[int | None] = mapped_column(Integer)
    budget_max: Mapped[int | None] = mapped_column(Integer)
    domains: Mapped[list | None] = mapped_column(JSONB)
    # 캐릭터에 얹은 꾸미기 장식. 에셋은 frontend/public/mascot/decoration_*.png이고
    # id가 곧 파일 번호다. NULL이면 장식 없음. 예전에는 localStorage에만 있어
    # 기기를 바꾸면 사라졌다.
    decoration_id: Mapped[int | None] = mapped_column(SmallInteger)

    user: Mapped["User"] = relationship(back_populates="profile")


class RefreshToken(Base):
    """리프레시 토큰. 원문이 아닌 SHA-256 해시만 저장한다."""

    __tablename__ = "refresh_tokens"
    __table_args__ = (
        Index("idx_refresh_tokens_hash", "token_hash"),
        Index("idx_refresh_tokens_user", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(Text, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="refresh_tokens")
