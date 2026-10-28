"""대체품 조회 응답 스키마 (Task 3).

`schemas/product.py`의 `_CamelModel`을 그대로 물려받아 camelCase를 맞춘다.
프론트 `src/types/index.ts`의 `Alternative`가 `Product`를 extends 하는 구조라
응답도 같은 모양이어야 한다.

지금 내지 않는 필드
    priceDelta · savingRate · reasonTags
        Alternative 타입에는 있지만 파생값이다. 가격차는 프론트가 기준제품 가격을
        이미 갖고 있어 굳이 서버가 낼 이유가 없다. 없는 값을 지어내지 않는다.
        (skinMatch는 skinType을 주면 `skin_match`로 낸다 — services/skin_fit.py)
"""
from __future__ import annotations

from app.schemas.product import ProductOut, _CamelModel


class SimilarProductOut(ProductOut):
    """제품 카드 + 유사도 근거.

    score는 method마다 척도가 다르다. tfidf 0.5와 hybrid 0.5는 같은 의미가
    아니므로 화면에서 백분율로 바꿔 보여줄 때는 method를 함께 봐야 한다.
    """

    score: float
    shared_ingredients: list[str] = []
    # 함께 가진 기능(보습·진정…). hybrid에서만 채워진다.
    shared_functions: list[str] = []
    # skinType을 주면 채워진다: good | ok | caution | unknown
    skin_match: str | None = None
    # 같은 사전 계산(product_skin_fit)의 0~100 점수. 궁합순 정렬과 카드 표시가 같은 값을 쓰게 낸다
    skin_fit_score: int | None = None


class SimilarListOut(_CamelModel):
    """어떤 기준으로 뽑았는지를 응답에 남긴다.

    method를 돌려주지 않으면 화면이 tfidf 결과인지 hybrid 결과인지 알 수 없다.
    세 방식을 비교하는 중이라 이 값이 특히 중요하다.
    """

    seed_id: int
    method: str
    # fitFor를 줬을 때 기준 제품의 궁합 점수. 대체품이 "더 잘 맞는가"를 견주려면 같은 척도의 기준값이 필요하다
    seed_skin_fit_score: int | None = None
    # 기준 제품의 단가. 같은 제품의 다른 용량·리필이 **단가로** 더 싼지 견주는 데 쓴다(1매 1,500원 vs 10매 15,000원은 절약이 아니다)
    seed_unit_price: float | None = None
    seed_unit_label: str | None = None
    items: list[SimilarProductOut]
