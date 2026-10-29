"""내 성분 취향 응답 (퍼스널 AI 3단계)."""
from __future__ import annotations

from app.schemas.product import _CamelModel


class EvidenceProduct(_CamelModel):
    id: int
    name: str


class PreferenceIngredientOut(_CamelModel):
    ingredient_id: int
    name: str
    weight: int                       # 가장 큰 성분을 100으로 한 상대 세기(0~100)
    products: list[EvidenceProduct]   # 이 성분이 들어 있어서 좋아했거나(또는 별로였던) 내 제품 몇 개


class PreferenceOut(_CamelModel):
    active: bool
    signal_count: int                 # 성분 정보가 있는 신호 제품 수
    min_signals: int
    sources: dict[str, int]           # review / repeat / like / closet 개수
    liked: list[PreferenceIngredientOut]
    disliked: list[PreferenceIngredientOut]
    message: str
