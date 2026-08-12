"""피부타입 진단 도메인 (Task 11).

QnA 문항을 코드가 아닌 DB에 두는 이유는 PRD §7.2.3 — "룰 테이블 수정만으로
재배포 없이 반영". 문항이 바뀌어도 과거 진단은 version_id 덕분에 재현된다.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class QuizVersion(Base):
    __tablename__ = "quiz_versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    label: Mapped[str] = mapped_column(Text, nullable=False)  # "v1.8"
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )

    questions: Mapped[list["QuizQuestion"]] = relationship(
        back_populates="version", cascade="all, delete-orphan"
    )


class QuizQuestion(Base):
    __tablename__ = "quiz_questions"
    __table_args__ = (Index("idx_quiz_questions_version", "version_id", "order_no"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    version_id: Mapped[int] = mapped_column(
        ForeignKey("quiz_versions.id", ondelete="CASCADE"), nullable=False
    )
    code: Mapped[str] = mapped_column(Text, nullable=False)
    # 진단 5축: moisture / oil / sensitivity / pigmentation / trouble
    axis: Mapped[str] = mapped_column(Text, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    order_no: Mapped[int] = mapped_column(SmallInteger, nullable=False)

    version: Mapped["QuizVersion"] = relationship(back_populates="questions")
    options: Mapped[list["QuizOption"]] = relationship(
        back_populates="question", cascade="all, delete-orphan"
    )


class QuizOption(Base):
    __tablename__ = "quiz_options"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    question_id: Mapped[int] = mapped_column(
        ForeignKey("quiz_questions.id", ondelete="CASCADE"), nullable=False
    )
    label: Mapped[str] = mapped_column(Text, nullable=False)   # "5분 이내"
    weights: Mapped[dict] = mapped_column(JSONB, nullable=False)  # {"dry": 3}
    order_no: Mapped[int] = mapped_column(SmallInteger, nullable=False)

    question: Mapped["QuizQuestion"] = relationship(back_populates="options")


class Diagnosis(Base):
    """진단 1회 = 1행.

    user_id가 NULL이면 게스트 진단(Soft-gate). 가입 시 guest_token으로 찾아
    user_id를 채워 승계한다. answers 원본을 남기므로 QnA 룰이 바뀌면
    과거 진단도 재산정할 수 있다 (PRD §7.2.2).
    """

    __tablename__ = "diagnoses"
    __table_args__ = (
        Index("idx_diagnoses_user", "user_id", "created_at"),
        Index("idx_diagnoses_guest", "guest_token"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    guest_token: Mapped[str | None] = mapped_column(Text)
    version_id: Mapped[int] = mapped_column(
        ForeignKey("quiz_versions.id", ondelete="RESTRICT"), nullable=False
    )
    answers: Mapped[dict] = mapped_column(JSONB, nullable=False)      # 응답 원본
    scores: Mapped[dict] = mapped_column(JSONB, nullable=False)      # 산출 5축
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )

    ranks: Mapped[list["DiagnosisRank"]] = relationship(
        back_populates="diagnosis", cascade="all, delete-orphan"
    )


class DiagnosisRank(Base):
    """진단 결과 순위. 이슈 #8의 '2·3순위 표시' 요구사항.

    순위를 컬럼이 아닌 행으로 두면 4순위까지 늘려도 스키마 변경이 없다.
    """

    __tablename__ = "diagnosis_ranks"

    diagnosis_id: Mapped[int] = mapped_column(
        ForeignKey("diagnoses.id", ondelete="CASCADE"), primary_key=True
    )
    rank: Mapped[int] = mapped_column(SmallInteger, primary_key=True)  # 1,2,3
    skin_type: Mapped[str] = mapped_column(Text, nullable=False)
    score: Mapped[float] = mapped_column(Float, nullable=False)

    diagnosis: Mapped["Diagnosis"] = relationship(back_populates="ranks")
