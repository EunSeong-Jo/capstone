"""예산 구매 가이드 요청·응답 (Task 15, PRD 시나리오 C)."""
from __future__ import annotations

from pydantic import Field, model_validator

from app.schemas.product import ProductOut, _CamelModel

# 슬라이더(화장대 예산)는 0원부터 고를 수 있다. 상한만 막는다 — 너무 적은
# 예산은 422가 아니라 빈 결과 + minPossibleTotal("최소 N원이 필요해요")로 답한다.
MAX_BUDGET = 1_000_000


class BudgetGuideIn(_CamelModel):
    budget_min: int = Field(ge=0, le=MAX_BUDGET)
    budget_max: int = Field(ge=0, le=MAX_BUDGET)
    # 없으면 로그인 사용자의 프로필 피부타입. 둘 다 없으면 별점·리뷰만 본다.
    skin_type: str | None = None
    # 무향 = 향료·알레르기 유발 착향제 태그가 있는 제품 제외. 무알코올 = 건조 유발 알코올.
    fragrance_free: bool = False
    alcohol_free: bool = False
    # 화장대에 이미 있는 제품. 새로 살 루틴에 같은 제품을 넣지 않는다.
    exclude_product_ids: list[int] = Field(default_factory=list, max_length=200)

    @model_validator(mode="after")
    def _range(self) -> "BudgetGuideIn":
        if self.budget_min > self.budget_max:
            raise ValueError("최소 예산이 최대 예산보다 큽니다")
        return self


class GuideItemOut(_CamelModel):
    step: str          # toner / essence / cream / sunscreen
    step_label: str    # 토너 / 에센스 / 크림 / 선크림
    product: ProductOut
    # 피부타입 추천 성분 태그가 걸린 성분 수. 0이면 매칭 근거가 없다.
    matched_ingredients: int


class GuideCombinationOut(_CamelModel):
    label: str         # 알뜰 / 균형 / 여유
    items: list[GuideItemOut]
    total: int
    remaining: int     # budget_max - total
    average_rating: float | None = None
    reason: str
    # 예산 범위(min) 아래로만 조합이 나왔을 때 True — 화면이 "범위보다 저렴"이라고 알린다.
    below_range: bool = False


class BudgetGuideOut(_CamelModel):
    combinations: list[GuideCombinationOut]
    budget_min: int
    budget_max: int
    skin_type: str | None = None
    # 예산이 모자라 루틴 뒤쪽 단계를 뺐을 때 그 단계 이름(선크림 → 크림 → 에센스 순으로 빠진다).
    # 비어 있으면 네 단계를 다 담았다.
    missing_steps: list[str] = []
    # 네 단계를 다 담지 못했을 때 전체 루틴의 최저 합계. 화면이 "전체 루틴은 최소 N원"에 쓴다.
    min_possible_total: int | None = None
