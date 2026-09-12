"""대체품 조회 응답 스키마 (Task 3).

`schemas/product.py`의 `_CamelModel`을 그대로 물려받아 camelCase를 맞춘다.
프론트 `src/types/index.ts`의 `Alternative`가 `Product`를 extends 하는 구조라
응답도 같은 모양이어야 한다.

지금 내지 않는 필드
    priceDelta · savingRate · skinMatch · reasonTags
        Alternative 타입에는 있지만 전부 파생값이거나 다른 태스크의 몫이다.
        가격차는 프론트가 기준제품 가격을 이미 갖고 있어 굳이 서버가 낼
        이유가 없고, 피부타입 궁합은 profiles·skin_type_rules가 비어 있다.
        없는 값을 지어내지 않는다.
"""
from __future__ import annotations

from app.schemas.product import ProductOut, _CamelModel


class SimilarProductOut(ProductOut):
    """제품 카드 + 유사도 근거.

    score는 method마다 척도가 다르다. tfidf 0.5와 rbo 0.5는 같은 의미가
    아니므로 화면에서 백분율로 바꿔 보여줄 때는 method를 함께 봐야 한다.
    """

    score: float
    shared_ingredients: list[str] = []


class SimilarListOut(_CamelModel):
    """어떤 기준으로 뽑았는지를 응답에 남긴다.

    method를 돌려주지 않으면 화면이 tfidf 결과인지 rbo 결과인지 알 수 없다.
    세 방식을 비교하는 중이라 이 값이 특히 중요하다.
    """

    seed_id: int
    method: str
    items: list[SimilarProductOut]
