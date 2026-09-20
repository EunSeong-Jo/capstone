"""
RAG 서비스 — Neon(PostgreSQL) 제품 DB에서 검색해 LLM 컨텍스트를 구성한다.

검색은 제품명 · 브랜드명 · 성분명 매칭으로 하고, 피부타입을 받으면
`skin_type_rules`의 exclude_tags에 걸리는 제품을 뺀다
(services/skin_type.py). 추천 태그를 가점으로 쓰는 스코어링은 아직 없다 —
지금은 평점·리뷰 수 순이다.

이전 버전(rag_seed.py의 SQLite 임시 시드)은 더 이상 쓰지 않는다.
"""
from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.product import Brand, Ingredient, Product, ProductIngredient
from app.services.skin_type import SkinRule, apply_exclusions, load_rule

# 키는 캐릭터 ID(docs/dev_guidelines.md §2.4)이고 skin_type_rules.skin_type과
# 같은 값이어야 한다 — 다르면 규칙 조회가 조용히 빗나간다.
_SKIN_TYPE_LABEL: dict[str, str] = {
    "mulgae": "반질반질물개",
    "memilmuk": "얼룩덜룩메밀묵",
    "ondalsam": "수분팡팡옹달샘",
    "samak": "바스락사막",
    "subuji": "겉바속촉수부지",
    "yuriguseul": "조심조심유리구슬",
    "injeolmi": "말랑말랑인절미",
    "hwasan": "울긋불긋화산",
}

_MAX_INGREDIENTS_SHOWN = 6

# ── 통용명 → 표준화명칭 매핑 (임시) ──────────────────────────────────────
# DB의 ingredients.name_ko는 대한화장품협회 표준화명칭이라 "히알루론산" 같은
# 통용명으로 검색하면 안 걸린다. ingredient_aliases에도 아직 이런 흔한
# 매핑이 없어(큐레이션 미착수) 자주 쓰이는 것만 우선 하드코딩해둔다.
# TODO: ingredient_aliases 데이터가 채워지면 이 매핑은 걷어내고 그쪽을 조회한다.
_INGREDIENT_SYNONYMS: dict[str, list[str]] = {
    "히알루론산": ["하이알루로닉애씨드", "하이알루로네이트"],
    "비타민씨": ["아스코빅애씨드", "아스코빌"],
    "비타민c": ["아스코빅애씨드", "아스코빌"],
    "센텔라": ["센텔라아시아티카", "마데카소사이드", "아시아티코사이드"],
    "판테놀": ["판테놀", "덱스판테놀"],
    "콜라겐": ["콜라겐"],
    "레티놀": ["레티놀", "레티날"],
}


def _tokenize(query: str) -> list[str]:
    """검색어를 공백 기준으로 쪼갠 키워드 후보.

    형태소 분석기 없이 최소한으로 개선한 것이다. "토너 추천해줘"처럼 조사·요청
    문구가 붙은 문장을 통째로 부분일치 시키면 그 문장 전체를 포함하는 상품명은
    사실상 없어서 절대 안 걸린다 — 예전 버그가 정확히 이거였다("토너 추천해줘"가
    "토너"만 있는 상품명과 매칭 안 됨). 공백으로 쪼개면 "토너" 토큰만으로 매칭된다.
    2글자 미만 토큰은 노이즈라 버리고, 다 걸러지면 원문 그대로 하나만 남긴다.
    """
    tokens = [t for t in query.split() if len(t) >= 2]
    return tokens or [query]


def _expand_ingredient_patterns(query: str) -> list[str]:
    """쿼리에 통용명이 섞여 있으면 표준화명칭 후보를 추가로 붙인다."""
    patterns = [query]
    for common, standards in _INGREDIENT_SYNONYMS.items():
        if common in query:
            patterns.extend(standards)
    return patterns


def skin_type_label(skin_type_id: str) -> str:
    """피부 타입 ID → 한국어 레이블 변환."""
    return _SKIN_TYPE_LABEL.get(skin_type_id, skin_type_id)


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


async def search_products(
    db: AsyncSession,
    query: str,
    skin_type_id: str | None = None,
    top_k: int = 5,
) -> list[dict]:
    """
    query: 사용자 자연어 질문
    skin_type_id: 진단된 피부 타입 ID. 규칙이 있으면 기피 성분이 든 제품을
                  뺀다. 모르는 타입이면 필터 없이 검색한다
    top_k: 반환할 최대 제품 수

    제품명 · 브랜드명 · 성분명 중 하나라도 검색어와 겹치는 제품을 찾는다.
    아무것도 안 걸리면 평점 상위 제품으로 대체하는데, 그 폴백에도 같은
    기피 필터를 건다 — 챗봇이 "추천할 게 없다"며 내놓는 제품이 정작
    사용자가 피해야 할 것이면 안 되기 때문이다.
    """
    rule = await load_rule(db, skin_type_id)
    name_patterns = [f"%{_escape_like(t)}%" for t in _tokenize(query)]
    ingredient_patterns = [f"%{_escape_like(p)}%" for p in _expand_ingredient_patterns(query)]

    stmt = (
        select(Product)
        .distinct()
        .join(Brand, Brand.id == Product.brand_id, isouter=True)
        .join(ProductIngredient, ProductIngredient.product_id == Product.id, isouter=True)
        .join(Ingredient, Ingredient.id == ProductIngredient.ingredient_id, isouter=True)
        .where(Product.status == "active")
        .where(
            or_(
                *[Product.name.ilike(p, escape="\\") for p in name_patterns],
                *[Brand.name.ilike(p, escape="\\") for p in name_patterns],
                *[Ingredient.name_ko.ilike(p, escape="\\") for p in ingredient_patterns],
            )
        )
        .options(joinedload(Product.brand), joinedload(Product.category))
        .order_by(Product.rating.desc().nullslast(), Product.review_count.desc().nullslast())
        .limit(top_k)
    )
    products = (await db.execute(apply_exclusions(stmt, rule))).scalars().all()

    if not products:
        products = await _fallback_top_rated(db, top_k, rule)
        ingredient_patterns = []  # 폴백은 검색어 매칭이 아니므로 강제 포함할 성분이 없다

    return [await _to_dict(db, p, ingredient_patterns) for p in products]


async def _fallback_top_rated(
    db: AsyncSession, top_k: int, rule: SkinRule | None = None
) -> list[Product]:
    """검색어에 안 걸리면 평점 상위 제품을 보여준다. 기피 필터는 그대로 건다."""
    stmt = (
        select(Product)
        .where(Product.status == "active")
        .options(joinedload(Product.brand), joinedload(Product.category))
        .order_by(Product.rating.desc().nullslast(), Product.review_count.desc().nullslast())
        .limit(top_k)
    )
    return list((await db.execute(apply_exclusions(stmt, rule))).scalars().all())


async def _to_dict(
    db: AsyncSession, product: Product, ingredient_patterns: list[str] | None = None
) -> dict:
    """ORM → LLM 컨텍스트용 dict.

    성분은 기본으로 표기순서 상위 N개를 보여주되, 검색 매칭 근거가 된 성분은
    순번과 무관하게 반드시 포함한다 — 안 그러면 "하이알루로닉애씨드가 41번째라
    상위 6개 밖"이라 정작 매칭시킨 성분을 LLM이 못 보고 "없다"고 답하게 된다.
    """
    conditions = [ProductIngredient.position <= _MAX_INGREDIENTS_SHOWN]
    if ingredient_patterns:
        conditions.extend(
            Ingredient.name_ko.ilike(p, escape="\\") for p in ingredient_patterns
        )

    rows = await db.execute(
        select(Ingredient.name_ko)
        .join(ProductIngredient, ProductIngredient.ingredient_id == Ingredient.id)
        .where(ProductIngredient.product_id == product.id)
        .where(or_(*conditions))
        .order_by(ProductIngredient.position)
    )
    return {
        "id": product.id,
        "name": product.name,
        "brand": product.brand.name if product.brand else "",
        "category": product.category.label if product.category else "",
        "price": product.price or 0,
        "rating": float(product.rating) if product.rating is not None else None,
        "ingredients": [r[0] for r in rows.all()],
    }
