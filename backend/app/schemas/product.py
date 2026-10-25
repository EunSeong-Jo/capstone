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

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field
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
    # single / bonus / goods / bundle. 기본 조회는 single만 내보내므로 늘
    # "single"이지만, ?composition= 로 분류를 검증할 때 값이 보여야 한다.
    composition: str = "single"

    # 단가. 마스크팩에 '20매' 같은 대용량이 섞여 있어 총액만으로는 비교가
    # 어긋난다 — 80,000원/20매가 3,000원/1매보다 27배 비싼 것처럼 정렬된다.
    #
    # 라벨을 '1매당'이 아니라 코드로 내는 이유: 문구는 화면이 정한다. 서버가
    # 한국어를 내면 문구를 바꿀 때마다 서버를 고쳐야 한다.
    #
    # 둘은 항상 함께 있거나 함께 없다(DB 생성 컬럼이 같은 식에서 나온다).
    # 한쪽만 오면 화면이 'None당 3,000원'을 그린다.
    unit_price: float | None = None      # 1매당 / 10ml당 / 10g당 / 1개당 금액
    unit_label: str | None = None        # sheet / ml10 / g10 / piece


class IngredientOut(_CamelModel):
    """전성분 1건. position은 표기 순서(1부터)이자 함량 내림차순이다."""

    id: int
    name: str
    name_en: str | None = None
    position: int

    # 성분 분류. 정본은 성분 기능 라벨(ingredient_functions)이고 `services/skin_fit.classify_ingredient`가 계산한다.
    # 궁합 카드·배지·목록 필터와 같은 기준이다.
    #
    #   key     내 피부타입(skinType을 준 경우)의 선호 기능을 가진 활성·에몰리언트 성분
    #   warn    주의 성분 — 식약처 알레르기 유발 착향제·일반 향료·건조 알코올(타입과 무관),
    #           그리고 내 타입이 기피하는 플래그(확신도 3)
    #   normal  라벨은 있지만 어느 쪽도 아닌 성분
    #   None    분류 근거(라벨)가 없는 성분 — 화면은 '분류 미정'으로 중립 표시한다
    #
    # ewg_grade는 내지 않는다. 컬럼은 있지만 비어 있고, 출처를 검증할 수 없는
    # 숫자를 채우면 화면이 근거 없는 안전 등급을 주장하게 된다.
    grade: str | None = None
    # 식약처 알레르기 유발 착향제 고시 목록의 성분인가 (ingredient_functions.allergen_listed)
    is_allergen: bool = False
    # 성분 기능 라벨. 화면이 "보습·진정 성분" 같은 설명과 이유 연결에 쓴다. 라벨이 없으면 비어 있다.
    functions: list[str] = []      # H B S W A O P E U
    role: str | None = None        # a e s f t p x j
    flags: list[str] = []          # I F L
    confidence: int | None = None  # 1~3

    # 성분 설명. `scripts/seed_ingredient_descriptions.py`가
    # ingredient_descriptions에 적재한다. 설명이 없는 성분은 셋 다 비어 있다.
    #
    #   description         한 줄 설명
    #   keywords            고정 어휘 20개(효능 10 · 역할 10)에서 최대 2개
    #   description_source  llm(생성 초안) | reviewed(검수 완료)
    #                       화면은 llm일 때 '참고용' 문구를 붙인다
    description: str | None = None
    keywords: list[str] = []
    description_source: str | None = None


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


class ProductReviewOut(_CamelModel):
    """제품 상세의 후기 한 건.

    작성자는 닉네임만 낸다 — 이메일·id를 내보낼 이유가 없다. 닉네임이 없는
    계정은 서버가 가려 준다.
    """

    id: int
    nickname: str
    rating: int
    body: str | None = None
    created_at: datetime
    photo_urls: list[str] = []
    # 작성자 피부타입 코드(8종). 진단 전이면 None.
    skin_type: str | None = None


class ProductReviewsOut(_CamelModel):
    """후기 목록 + 평점 분포.

    `distribution`은 5점부터 1점까지의 건수다. 별점 막대를 그리는 화면이
    목록을 다시 세지 않아도 되고, 페이지를 넘겨도 분포는 전체 기준으로
    고정된다.
    """

    items: list[ProductReviewOut]
    # 이 제품의 후기 전체 수(필터와 무관). 제목의 '후기 (N)'.
    total: int
    # 지금 필터(별점·피부타입)에 맞는 수. 필터가 없으면 total과 같다.
    matched: int = 0
    # 소수 첫째 자리까지. 후기가 없으면 None이다 — 0.0으로 내면 "최악"과
    # "아직 없음"이 같아 보인다.
    average: float | None = None
    distribution: dict[int, int]


class MatchSignalOut(_CamelModel):
    """텍스트 대조 신호.

    `matched_on`은 어느 이름에서 맞았는지다 — 'ko'면 `products.name`
    (또는 display_name), 'en'이면 `product_names_en.name_en`이다.
    `matched_text`는 그 이름 원문이라, 왜 이 제품이 걸렸는지 눈으로
    확인할 수 있다.
    """

    score: float
    matched_on: str
    matched_text: str


class MatchSignalsOut(_CamelModel):
    """후보가 걸린 근거들.

    지금은 텍스트 하나뿐이지만 묶음으로 내는 이유는, 촬영 이미지 ↔ 제품
    이미지 유사도를 두 번째 신호로 더할 때 응답 모양을 깨지 않기 위해서다.
    그때 `image`가 붙고 호출 측은 둘을 함께 보고 판단한다.
    """

    text: MatchSignalOut


class MatchVariantOut(_CamelModel):
    """같은 제품의 용량·구성 변형 한 줄 (드롭다운용)."""

    product: ProductOut
    label: str               # '350ml' · '350ml · 더블기획 (+어성초 크림 20ml)'


class ProductMatchOut(_CamelModel):
    """OCR 텍스트로 찾은 제품 후보.

    같은 제품의 용량·기획 변형은 한 후보로 접는다. `product`는 그 묶음에서 **가장 용량이 작은**
    제품이고, 변형이 둘 이상이면 `variants`에 대표를 포함한 전부(용량 오름차순)가 들어 있다.
    """

    product: ProductOut
    signals: MatchSignalsOut
    variants: list[MatchVariantOut] = []


class ProductScanIn(_CamelModel):
    """사진으로 화장품 찾기. 화면이 장변 1024px JPEG로 줄여 data URL로 보낸다."""

    image: str = Field(max_length=4_000_000)
    limit: int = Field(default=3, ge=1, le=10)


class ProductScanOut(_CamelModel):
    """인식한 글자와 후보.

    자동으로 하나를 고르지 않는다 — 실사진에서 정답과 '카탈로그에 없는 제품'의
    점수가 겹쳐 임계값이 서지 않았다(IMAGE_MATCH_SUMMARY ③). 화면은 후보를 보여 주고
    "찾는 제품이 없어요"를 함께 둔다.
    """

    text: str
    candidates: list[ProductMatchOut]
