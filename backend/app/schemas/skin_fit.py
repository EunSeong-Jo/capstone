"""피부 궁합 응답 스키마 (Task 14)."""
from __future__ import annotations

from app.schemas.product import _CamelModel


class FitIngredientOut(_CamelModel):
    """이유를 만든 성분. position은 전성분 표기 순서(1부터)라 목록 칩을 강조하는 데 쓴다."""

    position: int
    name: str


class FitReasonOut(_CamelModel):
    kind: str          # plus | minus
    text: str
    ingredients: list[FitIngredientOut] = []


class SkinFitOut(_CamelModel):
    """verdict: good 잘 맞음 · ok 무난 · caution 주의 · unknown 판단 근거 부족."""

    product_id: int
    skin_type: str
    verdict: str
    score: int | None = None
    reasons: list[FitReasonOut] = []


class FitBriefOut(_CamelModel):
    """목록 카드의 배지용 요약(이유 없음)."""

    product_id: int
    verdict: str
    score: int | None = None


class SkinFitBatchOut(_CamelModel):
    skin_type: str
    items: list[FitBriefOut]
