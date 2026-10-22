"""내 제품 성분 분석 응답 스키마 (Task 14)."""
from __future__ import annotations

from app.schemas.product import _CamelModel
from app.schemas.skin_fit import FitReasonOut


class AnalysisFitOut(_CamelModel):
    verdict: str                 # good | ok | caution | unknown
    score: int | None = None
    reasons: list[FitReasonOut] = []


class FunctionStrengthOut(_CamelModel):
    code: str                    # H B S W A O P E U
    name: str
    value: int                   # 0~100
    count: int                   # 그 기능을 가진 활성·에몰리언트 성분 수


class KeyIngredientOut(_CamelModel):
    position: int
    name: str
    functions: list[str]
    recommended: bool = False    # 내 피부타입의 선호 기능을 가졌는가 (피부타입을 줬을 때만)


class CautionIngredientOut(_CamelModel):
    position: int
    name: str


class CautionGroupOut(_CamelModel):
    kind: str                    # listed | fragrance | alcohol | irritant
    label: str
    ingredients: list[CautionIngredientOut]


class AnatomyItemOut(_CamelModel):
    """전성분 한 칸. 화면이 기능별 색 띠로 그린다."""

    position: int
    name: str
    role: str | None = None      # a e s f t p x j. 라벨이 없으면 None
    functions: list[str] = []    # 기능 코드
    caution: str | None = None   # listed | fragrance | alcohol | irritant


class ClosetProductRef(_CamelModel):
    id: int
    name: str


class ClosetOverlapOut(_CamelModel):
    function: str
    name: str
    products: list[ClosetProductRef]


class ClosetGapOut(_CamelModel):
    function: str
    name: str


class ClosetSimilarOut(_CamelModel):
    id: int
    name: str
    percent: int


class ClosetPositionOut(_CamelModel):
    category: str
    owned_count: int             # 같은 카테고리의 다른 보유 제품 수
    overlaps: list[ClosetOverlapOut] = []
    gaps: list[ClosetGapOut] = []
    similar: list[ClosetSimilarOut] = []


class SkinStateOut(_CamelModel):
    """내 피부 상태(진단 5축) 한 축과 이 제품의 대응."""

    axis: str                    # moisture | oil | sensitivity | pigmentation | trouble
    name: str
    score: int                   # 진단 점수 0~10
    concern: str                 # focus 신경 쓸 부분 | mild 약간 | fine 괜찮음
    level: str                   # '건조한 편' 같은 사람이 읽는 표현
    need: list[str]              # 이 축을 돕는 기능 이름들
    coverage: int                # 그 기능들 중 이 제품의 최대 강도 0~100
    status: str                  # good | some | lack | fine
    message: str
    risk: str | None = None


class ProductAnalysisOut(_CamelModel):
    product_id: int
    name: str
    brand: str
    category: str
    image_url: str | None = None
    skin_type: str | None = None
    labeled_count: int           # 라벨이 있는 성분 수
    total_count: int             # 전성분 수
    fit: AnalysisFitOut | None = None
    # 진단 5축을 주었을 때만 채워진다
    skin_state: list[SkinStateOut] = []
    skin_state_summary: str | None = None
    # 내 피부타입이 중요하게 보는 기능 코드(선호 가중 0.6+). 피부타입을 모르면 비어 있다
    focus_functions: list[str] = []
    functions: list[FunctionStrengthOut]
    key_ingredients: list[KeyIngredientOut]
    cautions: list[CautionGroupOut]
    anatomy: list[AnatomyItemOut]
    closet: ClosetPositionOut | None = None
