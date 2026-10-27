"""추천 · 유사도 도메인 (Task 3 · 14).

사용자가 직접 쓰는 데이터가 아니라 배치가 채우는 계산 결과다.
API 응답 속도가 여기서 갈린다.
"""
from __future__ import annotations

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
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Similarity(Base):
    """사전 계산된 성분 유사도.

    전체 쌍이 아니라 제품별 상위 20개만 저장한다. 제품 4,150개면
    전체 쌍은 861만 행이지만 상위 20개만 두면 8만여 행으로 끝난다.

    방향이 있는 관계다. product_id가 사용자가 보고 있는 제품,
    similar_id가 그 대체품으로 제시할 제품이다. a/b로 두면 어느 쪽이
    기준인지 이름만으로는 알 수 없어 조회 방향을 헷갈리기 쉽다.

    두 방향을 모두 쓰려면 배치가 양쪽 행을 다 넣어야 한다. 상위 20개만
    저장하므로 A의 상위권에 B가 있다고 B의 상위권에 A가 있다는 보장이
    없기 때문이다.

    method를 PK에 포함해 TF-IDF·hybrid 결과를 나란히 두고
    어느 쪽이 나은지 비교할 수 있게 한다.
    """

    __tablename__ = "similarities"
    __table_args__ = (
        # 대체품 조회의 주 쿼리 경로: 기준제품 → 방식 → 점수 내림차순
        Index(
            "idx_similarities_lookup",
            "product_id",
            "method",
            text("score DESC"),
        ),
    )

    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), primary_key=True
    )
    similar_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), primary_key=True
    )
    method: Mapped[str] = mapped_column(Text, primary_key=True)  # tfidf/hybrid
    score: Mapped[float] = mapped_column(Float, nullable=False)  # 0~1
    shared_ingredients: Mapped[list | None] = mapped_column(JSONB)  # 근거 표시용
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )


class SkinTypeRule(Base):
    """피부타입별 추천/기피 태그 (Task 14).

    JSONB로 관리해 운영 중 수정이 가능하다 — 재배포 없이 추천 성향을 바꾼다.
    """

    __tablename__ = "skin_type_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    skin_type: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    include_tags: Mapped[list] = mapped_column(JSONB, nullable=False)
    exclude_tags: Mapped[list] = mapped_column(JSONB, nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="true"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()"),
        onupdate=text("now()"),
        nullable=False,
    )


class ProductSkinFit(Base):
    """제품 × 피부타입 궁합 (사전 계산) — 피부 궁합의 **단일 계산 결과**.

    `services/skin_fit.evaluate`가 성분 기능 라벨(`ingredient_functions`)로 계산한 값을
    `scripts/compute_skin_fit.py`가 8타입 × 단일제품 전체에 대해 적재한다. 목록 정렬(`sort=skinFit`)·
    피부타입 필터(`excluded`)·홈 추천 점수·예산 가이드가 모두 이 테이블을 읽는다. 라벨이나 규칙(`PREFER`/`AVOID`)을
    바꾸면 배치를 다시 돌린다 — 안 돌리면 화면의 값과 이 테이블이 어긋난다.

    score:    0~100. 판단 근거가 부족하면(활성·에몰리언트 성분 3종 미만) NULL, verdict는 unknown
    verdict:  good | ok | caution | unknown
    matched:  그 타입의 선호 기능을 가진 성분 수
    excluded: 이 타입의 필터가 목록에서 빼는 제품인가(고시 목록·일반 향료 / 건조 알코올)
    has_fragrance·has_drying_alcohol: 타입과 무관한 사실(예산 가이드의 '무향'·'무알코올' 조건)
    """

    __tablename__ = "product_skin_fit"
    __table_args__ = (
        Index("idx_product_skin_fit_rank", "skin_type", text("score DESC NULLS LAST")),
    )

    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), primary_key=True
    )
    skin_type: Mapped[str] = mapped_column(Text, primary_key=True)
    score: Mapped[int | None] = mapped_column(SmallInteger)
    verdict: Mapped[str] = mapped_column(Text, nullable=False)
    matched: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")
    excluded: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    has_fragrance: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    has_drying_alcohol: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )
