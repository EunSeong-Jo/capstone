"""SQLAlchemy 선언적 베이스.

모든 모델이 이 Base를 상속하며, Alembic은 Base.metadata를 보고
마이그레이션을 자동 생성한다. 스키마의 단일 원본이다.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    """생성·수정 시각. DB 서버 시각을 쓴다(클라이언트 시계에 의존하지 않도록)."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
