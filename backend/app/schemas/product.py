"""제품 조회 응답 스키마.

필드명을 camelCase로 낸다. 프론트엔드 `src/types/index.ts`의 `Product`를
그대로 쓰기 위해서다. 30개 페이지가 이미 `imageUrl`·`reviewCount`를 쓰고 있어
서버가 맞추는 편이 전체 수정량이 훨씬 적다.

brand·category는 FK지만 응답에서는 **문자열**로 편다. 프론트 타입이
`brand: string`이라, 중첩 객체로 내면 모든 화면의 타입을 고쳐야 한다.

내지 않는 필드
    originalPrice · discountRate
        products.list_price / discount_rate가 4,150건 전부 NULL이다.
        크롤러가 수집하지 않았다. 항상 null을 보내느니 필드를 두지 않는다.
    ingredients[].grade / ewgGrade
        수동 큐레이션 대상이라 아직 비어 있다. 없는 값을 지어내지 않는다.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class _CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,   # 파이썬 쪽에서는 snake_case로 채운다
        from_attributes=True,
    )


class ProductOut(_CamelModel):
    """목록·카드용. 프론트 `Product` 타입과 호환된다.

    price는 절대 None이 아니다. ProductCardV가 `price.toLocaleString()`을
    가드 없이 호출해서, null이면 화면이 죽는다. DB 실측 null 0건이고
    컬럼 자체는 nullable이라 여기서 필수로 못박아 계약으로 만든다.
    """

    id: int
    name: str
    brand: str
    category: str
    price: int
    image_url: str | None = None
    rating: float | None = None
    review_count: int | None = None


class IngredientOut(_CamelModel):
    """전성분 1건. position은 표기 순서(1부터)이자 함량 내림차순이다."""

    id: int
    name: str
    name_en: str | None = None
    position: int


class ProductDetailOut(ProductOut):
    """상세용. 상품정보제공고시 항목과 전성분이 붙는다."""

    product_url: str | None = None
    volume: str | None = None
    country: str | None = None
    manufacturer: str | None = None
    expiry: str | None = None
    report_no: str | None = None

    # 원본 전성분 문자열의 성분 개수(중복 포함). ingredients 길이와 다를 수 있다.
    # 차이가 크면 'N종 택1' 기획세트다 — 유사도 계산에서 걸러낼 때 쓴다.
    ingredient_count_raw: int | None = None
    ingredients: list[IngredientOut] = []


class ProductListOut(_CamelModel):
    """목록 응답. total은 필터가 적용된 전체 건수다(페이지 크기와 무관)."""

    items: list[ProductOut]
    total: int
    page: int
    size: int
