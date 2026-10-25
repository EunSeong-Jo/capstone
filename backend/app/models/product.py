"""제품 · 성분 도메인.

데이터 출처
  - products / brands / categories : 올리브영 크롤러 (scripts/load_products.py)
  - ingredients / ingredient_aliases : 대한화장품협회 표준화명칭목록
                                       (scripts/seed_ingredients.py)
  - ingredient_descriptions : data/seed/ingredient_descriptions.csv
                              (scripts/seed_ingredient_descriptions.py)
  - ingredient_functions : data/seed/ingredient_functions/labels.csv
                           (scripts/seed_ingredient_functions.py)
  - tags / ingredient_tags / grade / ewg : 수동 큐레이션 (아직 미착수)
"""
from __future__ import annotations

from datetime import date

from sqlalchemy import (
    Boolean,
    Date,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    text,
)
from sqlalchemy import FetchedValue
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class Brand(Base, TimestampMixin):
    """브랜드. 추천 시 '동일 브랜드 최대 N개' 다양성 보정에 쓴다."""

    __tablename__ = "brands"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False, unique=True)

    products: Mapped[list["Product"]] = relationship(back_populates="brand")


class Category(Base, TimestampMixin):
    """카테고리. parent_id 자기참조로 2단계까지만 (스킨케어 › 토너)."""

    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    label: Mapped[str | None] = mapped_column(Text)
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL")
    )

    parent: Mapped["Category | None"] = relationship(remote_side=[id])
    products: Mapped[list["Product"]] = relationship(back_populates="category")


class Product(Base, TimestampMixin):
    """제품 마스터.

    UNIQUE 키가 goods_no인 이유: 상품명의 77%에 '[7월 올영픽]' 같은
    프로모션 접두사가 붙고 55%에 기획/증정 문구가 섞여, 이름 조합으로는
    같은 제품이 재수집 때마다 새 행으로 들어온다. goodsNo가 올리브영의
    실제 제품 식별자다.
    """

    __tablename__ = "products"
    __table_args__ = (
        Index("idx_products_brand", "brand_id"),
        Index("idx_products_category", "category_id"),
        Index("idx_products_status", "status"),
        Index("idx_products_composition", "composition"),
        Index("idx_products_option_parent", "option_parent_id"),
        Index("idx_products_price", "price"),
        Index("idx_products_unit_price", "unit_price"),
        Index("idx_products_rating", "rating"),
        Index("idx_products_review_count", "review_count"),
        # 제품명 퍼지 검색 (pg_trgm). 확장은 첫 마이그레이션에서 설치한다.
        Index(
            "idx_products_name_trgm",
            "name",
            postgresql_using="gin",
            postgresql_ops={"name": "gin_trgm_ops"},
        ),
        Index(
            "idx_products_display_name_trgm",
            "display_name",
            postgresql_using="gin",
            postgresql_ops={"display_name": "gin_trgm_ops"},
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    goods_no: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)

    # name은 정제 전 원본이다. '기획'·'N종 택1'·'+50ml' 같은 문구가
    # composition 판정(app/utils/composition.py)의 입력이라 지우면 분류가 깨진다.
    # 화면에는 display_name을 쓴다 — 없으면 name으로 떨어진다.
    name: Mapped[str] = mapped_column(Text, nullable=False)
    display_name: Mapped[str | None] = mapped_column(Text)

    brand_id: Mapped[int | None] = mapped_column(
        ForeignKey("brands.id", ondelete="SET NULL")
    )
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL")
    )

    price: Mapped[int | None] = mapped_column(Integer)           # 원 단위
    list_price: Mapped[int | None] = mapped_column(Integer)      # 할인 전 정가
    discount_rate: Mapped[int | None] = mapped_column(SmallInteger)
    rating: Mapped[float | None] = mapped_column(Numeric(2, 1))
    review_count: Mapped[int | None] = mapped_column(Integer)

    image_url: Mapped[str | None] = mapped_column(Text)
    product_url: Mapped[str | None] = mapped_column(Text)

    # 상품정보제공고시 표에서 수집. 형식이 자유로워 길이를 제한하지 않는다
    # (manufacturer는 '제조업자 : X / 책임판매업자 : Y ...' 형태로 최대 435자).
    volume: Mapped[str | None] = mapped_column(Text)

    # 총 내용량. v5의 `내용량_정리`에서 파싱한다. volume(원문)과 달리 계산용이다.
    # ml과 g를 나눠 두는 이유는 부피와 무게라 직접 비교할 수 없어서다 —
    # 단가는 `price / volume_ml`처럼 바로 낸다. '10매'짜리는 둘 다 NULL.
    volume_ml: Mapped[float | None] = mapped_column(Numeric(10, 2))
    volume_g: Mapped[float | None] = mapped_column(Numeric(10, 2))

    # v5의 `내용량_확인필요`. 정제 작업자가 총량을 하나로 말할 수 없다고 표시한
    # 제품이다 ('각 옵션별 용량이 다름' · '409ml (6개) + 210매'). 위 두 값이
    # 채워져 있어도 믿을 수 없으므로, 단가를 낼 때는 이 제품을 빼야 한다.
    volume_uncertain: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )

    # 매수·개수와 그 종류. sheet(매·장)와 piece(개)를 나누는 이유는 매는 소비
    # 단위고 개는 포장 단위라서다 — '10매' 마스크팩의 "1매당"은 비교에 쓸모가
    # 있지만 '325ml (2개)' 토너의 "1개당"은 없다. 아래 unit_price의 우선순위가
    # 이 구분으로 갈린다.
    unit_count: Mapped[int | None] = mapped_column(Integer)
    unit_kind: Mapped[str | None] = mapped_column(Text)   # sheet / piece

    # 단가. DB 생성 컬럼이라 여기서는 읽기만 한다 — INSERT에 넣으면 거부된다.
    # 우선순위는 1매당 > 10ml당 > 10g당 > 1개당이고 식은 마이그레이션
    # b8c9d0e1f2a3에 있다. 10 단위를 쓰는 이유는 1ml당이면 100~300원대가 되어
    # 화면에서 읽히지 않기 때문이다.
    unit_price: Mapped[float | None] = mapped_column(
        Numeric(12, 2), server_default=FetchedValue(), server_onupdate=FetchedValue()
    )
    unit_label: Mapped[str | None] = mapped_column(
        Text, server_default=FetchedValue(), server_onupdate=FetchedValue()
    )

    country: Mapped[str | None] = mapped_column(Text)
    manufacturer: Mapped[str | None] = mapped_column(Text)
    expiry: Mapped[str | None] = mapped_column(Text)

    # 원본 전성분 문자열을 파싱한 성분 개수(중복 포함).
    # product_ingredients 행수와 다르다 — 그쪽은 제품 내 중복 성분을 한 번만
    # 세기 때문. 4,634건 중 719건(15.5%)에서 값이 갈린다.
    #
    # 차이가 클수록 'N종 택1' 기획세트일 가능성이 높다. 호수별 전성분을
    # 한 셀에 이어 붙이면서 같은 성분이 반복되기 때문
    # (최대 사례: 원본 1,978개 → 고유 141개).
    # 유사도 계산에서 이런 제품을 걸러낼 때 이 값이 판단 근거가 된다.
    ingredient_count_raw: Mapped[int | None] = mapped_column(Integer)

    report_no: Mapped[str | None] = mapped_column(Text)  # 식약처 보고번호
    status: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="active"
    )  # active / soldout / discontinued

    # 제품 구성. status(판매 상태)와는 다른 축이다 — '품절된 단일제품'이 성립한다.
    # single 외에는 전성분이 제품 하나에 대응한다고 보장할 수 없어 유사도 계산에서
    # 빼고 앱에도 노출하지 않는다. 판정 규칙은 app/utils/composition.py.
    composition: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="single"
    )  # single / bonus / goods / bundle / optgroup
    # 옵션형 묶음("A/B/C 택1")의 분해 결과. 원본 행은 composition='optgroup'으로 표시해 인식·추천·유사도에서
    # 빼고, 라벨별 전성분을 가진 옵션 행이 option_parent_id로 원본을 가리킨다. 원본이 아닌 일반 제품은 전부 NULL.
    # 분해 규칙은 app/utils/product_options.py, 적재는 scripts/load_products.py(expand_options).
    option_parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE")
    )
    option_label: Mapped[str | None] = mapped_column(Text)        # '화장발' · '카밍풀'
    option_order: Mapped[int | None] = mapped_column(SmallInteger)  # 1부터. 1이 그룹의 대표
    source: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="oliveyoung"
    )

    brand: Mapped["Brand | None"] = relationship(back_populates="products")
    category: Mapped["Category | None"] = relationship(back_populates="products")
    ingredients: Mapped[list["ProductIngredient"]] = relationship(
        back_populates="product", cascade="all, delete-orphan"
    )


class Ingredient(Base, TimestampMixin):
    """성분 마스터. 대한화장품협회 표준화명칭목록이 원본.

    norm_name이 표기 흔들림을 흡수하는 조회 키다
    ('살리실릭애씨드(0.5%)' · '살리실릭애씨드' → 같은 행).
    code가 NULL이면 사전에 없는 성분(크롤링 원문 그대로 등록).
    """

    __tablename__ = "ingredients"
    __table_args__ = (Index("idx_ingredients_code", "code"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    norm_name: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    name_ko: Mapped[str] = mapped_column(Text, nullable=False)
    name_en: Mapped[str | None] = mapped_column(Text)   # INCI
    code: Mapped[str | None] = mapped_column(String(20))

    # 아래 3개는 수동 큐레이션 대상 (크롤링으로 얻을 수 없음)
    ewg_grade: Mapped[int | None] = mapped_column(SmallInteger)   # 1~10
    grade: Mapped[str | None] = mapped_column(Text)               # key/normal/warn
    is_allergen: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )

    aliases: Mapped[list["IngredientAlias"]] = relationship(
        back_populates="ingredient", cascade="all, delete-orphan"
    )
    products: Mapped[list["ProductIngredient"]] = relationship(
        back_populates="ingredient"
    )


class IngredientAlias(Base):
    """구명칭 → 표준명 매핑.

    '디메치콘'과 '다이메티콘'을 같은 성분으로 세지 않으면 유사도가
    실제보다 낮게 나온다. 협회 명칭변경목록 4,000여 건이 원본.

    is_ambiguous: 한 구명칭이 서로 다른 표준명 둘 이상으로 갈라지는 경우
    (예: '승마추출물' → 촛대승마추출물 / 라케모사승마뿌리추출물).
    52건 있으며, 기계적으로 결정할 수 없으므로 자동 변환에서 제외한다.
    """

    __tablename__ = "ingredient_aliases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    alias: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    ingredient_id: Mapped[int] = mapped_column(
        ForeignKey("ingredients.id", ondelete="CASCADE"), nullable=False
    )
    is_ambiguous: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    changed_at: Mapped[date | None] = mapped_column(Date)  # 명칭 변경 고시일

    ingredient: Mapped["Ingredient"] = relationship(back_populates="aliases")


class IngredientDescription(Base, TimestampMixin):
    """성분 설명 — 한 줄 설명 + 효능·역할 키워드.

    원본은 data/seed/ingredient_descriptions.csv이고
    scripts/seed_ingredient_descriptions.py가 적재한다. ingredients와 따로 두는
    이유는 성분 마스터(협회 사전)와 출처·갱신 주기가 다르기 때문이다.

    keywords: 고정 어휘에서만 고른다(적재 스크립트가 검사).
    source: 'llm'(생성 초안) | 'reviewed'(사람 검수 완료)
    """

    __tablename__ = "ingredient_descriptions"

    ingredient_id: Mapped[int] = mapped_column(
        ForeignKey("ingredients.id", ondelete="CASCADE"), primary_key=True
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    keywords: Mapped[list[str]] = mapped_column(
        ARRAY(Text), nullable=False, server_default="{}"
    )
    source: Mapped[str] = mapped_column(String(20), nullable=False)


class IngredientFunction(Base, TimestampMixin):
    """성분 기능 분류 — 이 성분이 무슨 일을 하는가.

    원본은 data/seed/ingredient_functions/labels.csv(분류표·지침은 같은 폴더 README)이고
    scripts/seed_ingredient_functions.py가 적재한다. 유사도(`hybrid`)와 피부 궁합이 쓴다.

    `tags`(피부타입 규칙이 이름으로 참조)와 **별개의 어휘**다 — 기존 태그는 키워드 매칭이라
    과대·과소 포함이 있고, 바꾸면 규칙이 어긋난다.

    functions: 기능 코드 H보습 B장벽 S진정 W미백 A주름·탄력 O항산화 P피지·모공 E각질 U자외선(복수)
    role:      a활성 e에몰리언트 s용매 f계면활성 t점증 p방부 x기타 j오염(분류 제외) — 하나
    flags:     I자극 소지 F향료 L건조 알코올(복수)
    confidence: 1낮음(검수 대상, 궁합 판정 근거에서 제외) · 2보통 · 3확실
    source:    'ai_expert'(AI가 성분 지식으로 판정) | 'reviewed'(사람 검수) | 'mfds'(식약처 고시 목록) | 'cosing'(EU CosIng 확인)
    allergen_listed: 식약처 알레르기 유발 착향제 고시 목록의 성분인가(이게 화면의 "알레르기 유발" 표시와 하드 필터의 근거)
    """

    __tablename__ = "ingredient_functions"

    ingredient_id: Mapped[int] = mapped_column(
        ForeignKey("ingredients.id", ondelete="CASCADE"), primary_key=True
    )
    functions: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, server_default="{}")
    role: Mapped[str] = mapped_column(String(1), nullable=False)
    flags: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, server_default="{}")
    confidence: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(20), nullable=False)
    allergen_listed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )


class ProductIngredient(Base):
    """제품 ↔ 성분 N:M.

    position은 전성분 표기 순서(1부터). 화장품 전성분은 함량 내림차순
    표기가 원칙이라 이 순서 자체가 정보이며, RBO 유사도가 이걸 쓴다.
    """

    __tablename__ = "product_ingredients"
    __table_args__ = (Index("idx_product_ingredients_ingredient", "ingredient_id"),)

    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), primary_key=True
    )
    ingredient_id: Mapped[int] = mapped_column(
        ForeignKey("ingredients.id", ondelete="CASCADE"), primary_key=True
    )
    position: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    raw_name: Mapped[str | None] = mapped_column(Text)  # 크롤링 원문 보존

    product: Mapped["Product"] = relationship(back_populates="ingredients")
    ingredient: Mapped["Ingredient"] = relationship(back_populates="products")


class Tag(Base):
    """효능 태그 마스터. skin_type_rules가 참조하는 어휘의 실체."""

    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(Text, nullable=False, unique=True)  # moisture_balance
    label: Mapped[str] = mapped_column(Text, nullable=False)              # 균형보습


class IngredientTag(Base):
    # (ingredient_id, tag_id) 복합 PK가 유일성을 이미 보장하므로
    # 별도 UniqueConstraint를 두지 않는다 (두면 Alembic이 매번 드리프트로 잡는다).
    __tablename__ = "ingredient_tags"

    ingredient_id: Mapped[int] = mapped_column(
        ForeignKey("ingredients.id", ondelete="CASCADE"), primary_key=True
    )
    tag_id: Mapped[int] = mapped_column(
        ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True
    )


class ProductNameEn(Base, TimestampMixin):
    """제품의 영문명 — 올리브영 글로벌에 올라간 같은 상품의 이름.

    원본은 `data/raw/oliveyoung_kr_en_paired.csv`(PR #60)이고
    `scripts/seed_product_names_en.py`가 적재한다. 한글 쪽 상품URL의
    `goodsNo`로 `products.product_url`을 역조회해 붙인다.

    왜 products에 컬럼을 더하지 않았나
    ---------------------------------
    한 제품이 **여러 영문 리스팅에 매칭된다**(goodsNo 중복 194건). OCR에는
    별칭이 많을수록 유리하다 — 포장 표기가 그중 하나와 맞으면 찾아진다.
    컬럼 하나면 그만큼을 버려야 한다.

    매칭 근거를 함께 남기는 이유
    ---------------------------
    `confidence`가 '확인필요'인 218건을 질의에서 빼거나 가중할 수 있어야
    한다. 쌍을 맞춘 방법도 남긴다 — 대부분 전성분 대조라 근거가 강하지만
    '상품명 검색'으로 맞춘 17건은 성질이 다르다.

    OCR 대조는 `name_en`의 GIN trgm 인덱스를 쓴다. 영문을 한글 발음으로
    전사해 대조하던 예전 방식은 점수가 0.15 구간에 깔려 임계값을 정할 수
    없었다 — `Low Molecular → 저분자`처럼 음차가 아니라 번역인 이름은
    아예 빗나갔다.
    """

    __tablename__ = "product_names_en"
    __table_args__ = (
        Index("idx_product_names_en_trgm", "name_en", postgresql_using="gin",
              postgresql_ops={"name_en": "gin_trgm_ops"}),
    )

    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), primary_key=True
    )
    name_en: Mapped[str] = mapped_column(Text, primary_key=True)
    brand_en: Mapped[str | None] = mapped_column(Text)
    # 전성분 | 전성분(구성 다름) | 상품명 검색
    match_method: Mapped[str] = mapped_column(Text, nullable=False)
    # 높음 | 보통 | 확인필요
    confidence: Mapped[str] = mapped_column(Text, nullable=False)
    score: Mapped[float] = mapped_column(Float, nullable=False)
