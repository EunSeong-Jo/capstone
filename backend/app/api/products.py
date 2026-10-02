"""제품 조회 API (Task 6.1).

읽기 전용. 프론트엔드가 src/mocks/를 벗고 실제 데이터로 붙는 통로다.

    GET /api/v1/products              목록 · 필터 · 정렬 · 페이지네이션
    GET /api/v1/products/search       제품명 부분일치 (ILIKE)
    GET /api/v1/products/match        OCR 텍스트로 찾기 (trgm 유사도)
    GET /api/v1/products/{id}         상세 + 전성분
    GET /api/v1/products/{id}/reviews 이 제품의 후기

경로 순서 주의: /search·/match가 /{id}보다 먼저 선언돼야 한다. 뒤에 두면
FastAPI가 "search"·"match"를 id로 해석해 422를 낸다.
"""
from __future__ import annotations

import hashlib
import json
from enum import Enum

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response
from sqlalchemy import Select, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.cache import cache_get, cache_set, get_cache_version
from app.db.session import get_db
from app.models.product import (
    Brand,
    Category,
    Ingredient,
    IngredientDescription,
    Product,
    ProductIngredient,
)
from app.services.skin_type import SkinRule, apply_exclusions, fit_score, load_rule
from app.models.personal import Review
from app.models.user import User
from app.schemas.product import (
    IngredientOut,
    MatchSignalOut,
    MatchSignalsOut,
    ProductDetailOut,
    ProductListOut,
    ProductMatchOut,
    ProductOut,
    ProductReviewOut,
    ProductReviewsOut,
)

router = APIRouter(prefix="/api/v1/products", tags=["products"])

MAX_PAGE_SIZE = 100
# 데이터 변경은 배치 스크립트(load_products.py/seed_ingredients.py) 실행
# 시점에만 일어나고, 그때 products:cache_version이 즉시 올라가 이전 버전
# 키를 무효화한다. 즉 TTL은 정합성이 아니라 Redis 메모리 청소용 안전망일
# 뿐이라 길게 잡아도 "낡은 데이터가 보이는" 문제는 생기지 않는다 — 대신
# 트래픽이 뜸한 쿼리 조합이 캐시 미스(DB 왕복 1.2~1.9s)를 만날 빈도가
# 크게 줄어든다.
LIST_CACHE_TTL = 3600     # 1시간 — 목록·검색
DETAIL_CACHE_TTL = 21600  # 6시간 — 상세


def _cache_key(namespace: str, version: int, **params: object) -> str:
    """캐시 키 = 네임스페이스 + 버전 + 파라미터 해시.

    해시를 쓰는 이유: 검색어에 ':'·공백·이모지가 들어가도 키가 깨지지 않고,
    새 쿼리 파라미터를 추가할 때 누락하면(=캐시 포이즈닝) 호출부에서
    딕셔너리로 명시 전달을 강제해 리뷰 때 바로 티가 나게 하기 위해서다.
    """
    normalized = json.dumps(
        {k: v for k, v in sorted(params.items())},
        ensure_ascii=False, separators=(",", ":"),
    )
    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:24]
    return f"products:{namespace}:v{version}:{digest}"


class SortBy(str, Enum):
    """정렬 기준.

    기본값이 popular인 이유: 개인화 추천은 Task 14의 몫인데 profiles와
    similarities가 아직 비어 있다. 리뷰 수는 지금 가진 데이터 중 '많이
    팔린 것'에 가장 가까운 신호다.
    """

    popular = "popular"        # 리뷰 수 내림차순
    price_asc = "priceAsc"
    # 단가 오름차순. price_asc와 따로 두는 이유는 '내가 낼 돈'과 '가성비'가
    # 다른 질문이기 때문이다 — 80,000원짜리 20매가 단가로는 가장 싸다.
    unit_price_asc = "unitPriceAsc"
    price_desc = "priceDesc"
    rating = "rating"
    # 추천 성분이 많은 순. skinType을 함께 주지 않으면 popular와 같다.
    skin_fit = "skinFit"


class CompositionFilter(str, Enum):
    """제품 구성 필터.

    기본값이 single인 이유: 기획세트·굿즈 동봉 제품은 전성분이 제품 하나에
    대응한다고 보장할 수 없어 대체품 추천이 어긋난다. 앱에는 단일제품만
    노출하고, 나머지는 데이터로만 들고 있는다.

    all·bundle 등은 분류 검증과 디버깅용이다. bonus(증량·화장품 증정)를
    다시 포함할지는 1차 결과를 보고 정하기로 했고, 그때 기본값만 바꾸면
    되도록 파라미터로 열어 둔다.
    """

    single = "single"
    bonus = "bonus"
    goods = "goods"
    bundle = "bundle"
    all = "all"


def _apply_composition(stmt: Select, composition: CompositionFilter) -> Select:
    if composition is CompositionFilter.all:
        return stmt
    return stmt.where(Product.composition == composition.value)


def _apply_sort(stmt: Select, sort: SortBy, rule: SkinRule | None = None) -> Select:
    # NULL을 뒤로 보낸다. rating·review_count에 결측이 69건(1.7%) 있어,
    # 기본값 없이 정렬하면 PostgreSQL이 NULL을 최대값으로 취급해 앞에 세운다.
    if sort is SortBy.price_asc:
        return stmt.order_by(Product.price.asc(), Product.id.asc())
    if sort is SortBy.price_desc:
        return stmt.order_by(Product.price.desc(), Product.id.asc())
    if sort is SortBy.rating:
        return stmt.order_by(Product.rating.desc().nullslast(), Product.id.asc())
    if sort is SortBy.unit_price_asc:
        # 단가를 못 내는 제품(11건)은 뒤로 보낸다. NULL을 앞에 세우면
        # '가장 싼 것'을 물었는데 값이 없는 제품이 먼저 나온다.
        return stmt.order_by(Product.unit_price.asc().nullslast(), Product.id.asc())
    if sort is SortBy.skin_fit:
        # 같은 점수 안에서는 인기순으로 갈린다 — 태그가 0~3개라 동점이 많다.
        return stmt.order_by(
            fit_score(rule).desc(),
            Product.review_count.desc().nullslast(),
            Product.id.asc(),
        )
    return stmt.order_by(Product.review_count.desc().nullslast(), Product.id.asc())


def _to_out(p: Product) -> ProductOut:
    """ORM → 응답 DTO. brand·category를 문자열로 편다.

    name은 정제명(display_name)을 우선한다. DB의 products.name은 '기획'·'N종
    택1' 같은 문구가 붙은 원본이라 화면에 그대로 내보내면 지저분하다. 원본은
    composition 판정에 쓰이므로 DB에는 남겨 둔다.
    """
    return ProductOut(
        id=p.id,
        name=p.display_name or p.name,
        brand=p.brand.name if p.brand else "",
        category=p.category.code if p.category else "",
        price=p.price or 0,
        image_url=p.image_url,
        rating=float(p.rating) if p.rating is not None else None,
        review_count=p.review_count,
        composition=p.composition,
        unit_price=float(p.unit_price) if p.unit_price is not None else None,
        unit_label=p.unit_label,
    )


async def _paginate(
    db: AsyncSession, stmt: Select, page: int, size: int
) -> ProductListOut:
    """공통 페이지네이션. count(*) OVER()로 count+목록을 한 왕복에 담는다.

    count(*) OVER()는 WHERE/JOIN 적용 후, LIMIT/OFFSET 적용 전 시점의
    행 수를 계산하므로 페이지와 무관하게 필터링된 전체 결과 기준의 정확한
    총계가 나온다. 요청한 page가 실제 결과 범위를 넘어서면(마지막 페이지
    뒤) 행 자체가 0개라 total도 함께 사라지므로 그 경우만 별도 count로
    보충한다(드문 경로라 성능 영향 무시 가능).

    brand·category는 다대일이라 joinedload로 메인 쿼리의 LEFT JOIN
    하나에 합친다 — selectinload처럼 관계당 별도 SELECT를 추가로
    날리지 않는다.
    """
    windowed = stmt.add_columns(func.count().over().label("_total"))
    result = await db.execute(
        windowed.options(joinedload(Product.brand), joinedload(Product.category))
        .offset((page - 1) * size)
        .limit(size)
    )
    rows = result.all()

    if rows:
        total = rows[0][1]
        items = [_to_out(p) for p, _ in rows]
    else:
        items = []
        total = (
            await db.scalar(
                select(func.count()).select_from(stmt.order_by(None).subquery())
            )
            if page > 1
            else 0
        ) or 0

    return ProductListOut(items=items, total=total, page=page, size=size)


@router.get("", response_model=ProductListOut, summary="제품 목록")
async def list_products(
    response: Response,
    db: AsyncSession = Depends(get_db),
    category: str | None = Query(
        None, description="카테고리 코드 (스킨케어 · 마스크팩 · 클렌징 · 선케어)"
    ),
    brand: str | None = Query(None, description="브랜드명 완전일치"),
    min_price: int | None = Query(None, ge=0, alias="minPrice"),
    max_price: int | None = Query(None, ge=0, alias="maxPrice"),
    sort: SortBy = Query(SortBy.popular),
    composition: CompositionFilter = Query(
        CompositionFilter.single,
        description="제품 구성. 기본은 단일제품만, all이면 전부",
    ),
    skin_type: str | None = Query(
        None, alias="skinType",
        description="피부타입 ID (subuji · hwasan · mulgae 등). 기피 성분이 든 제품을 뺀다",
    ),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=MAX_PAGE_SIZE),
) -> ProductListOut | Response:
    """조건에 맞는 제품을 정렬해 반환한다.

    품절·단종은 기본으로 제외한다(status='active').
    기획세트·굿즈 동봉도 기본으로 제외한다(composition='single').

    skinType을 주면 `skin_type_rules`의 exclude_tags에 걸리는 제품을 뺀다.
    모르는 타입이면 필터 없이 그냥 전체를 낸다 — 진단 결과가 바뀌거나
    규칙을 잠시 꺼 둔 사이에 화면이 통째로 비는 편이 더 나쁘다.
    """
    version = await get_cache_version()
    key = _cache_key(
        "list", version,
        category=category, brand=brand, min_price=min_price,
        max_price=max_price, sort=sort.value, composition=composition.value,
        skin_type=skin_type, page=page, size=size,
    )
    cached = await cache_get(key)
    if cached is not None:
        return Response(
            content=cached, media_type="application/json",
            headers={"Cache-Control": "public, max-age=60", "X-Cache": "HIT"},
        )

    rule = await load_rule(db, skin_type)
    stmt = apply_exclusions(
        _apply_composition(
            select(Product).where(Product.status == "active"), composition
        ),
        rule,
    )

    if category:
        stmt = stmt.join(Category, Product.category_id == Category.id).where(
            Category.code == category
        )
    if brand:
        stmt = stmt.join(Brand, Product.brand_id == Brand.id).where(
            Brand.name == brand
        )
    if min_price is not None:
        stmt = stmt.where(Product.price >= min_price)
    if max_price is not None:
        stmt = stmt.where(Product.price <= max_price)

    result = await _paginate(db, _apply_sort(stmt, sort, rule), page, size)

    await cache_set(key, result.model_dump_json(by_alias=True), LIST_CACHE_TTL)
    response.headers["Cache-Control"] = "public, max-age=60"
    response.headers["X-Cache"] = "MISS"
    return result


@router.get("/search", response_model=ProductListOut, summary="제품명 검색")
async def search_products(
    response: Response,
    db: AsyncSession = Depends(get_db),
    q: str = Query(..., min_length=2, description="검색어 (2자 이상)"),
    sort: SortBy = Query(SortBy.popular),
    composition: CompositionFilter = Query(
        CompositionFilter.single,
        description="제품 구성. 기본은 단일제품만, all이면 전부",
    ),
    skin_type: str | None = Query(
        None, alias="skinType",
        description="피부타입 ID. 기피 성분이 든 제품을 뺀다",
    ),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=MAX_PAGE_SIZE),
) -> ProductListOut | Response:
    """제품명 부분일치 검색.

    ILIKE '%q%'는 idx_products_name_trgm(gin_trgm_ops)이 받는다.
    앞뒤 와일드카드라도 trigram 인덱스는 동작한다 — B-tree와 다른 점이다.

    LIKE 메타문자를 이스케이프한다. '50%' 같은 검색어가 와일드카드로
    해석되면 엉뚱한 결과가 나온다.
    """
    version = await get_cache_version()
    key = _cache_key(
        "search", version, q=q, sort=sort.value,
        composition=composition.value, skin_type=skin_type, page=page, size=size,
    )
    cached = await cache_get(key)
    if cached is not None:
        return Response(
            content=cached, media_type="application/json",
            headers={"Cache-Control": "public, max-age=60", "X-Cache": "HIT"},
        )

    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    # 정제명과 원본명 둘 다 본다. 정제 과정에서 '기획'·'더블' 같은 단어가
    # 지워지므로, 정제명만 보면 그 단어로 검색한 사용자가 아무것도 못 찾는다.
    # 반대로 원본명만 보면 정제 후 바뀐 표기를 놓친다.
    pattern = f"%{escaped}%"
    rule = await load_rule(db, skin_type)
    stmt = _apply_composition(
        select(Product)
        .where(Product.status == "active")
        .where(
            or_(
                Product.name.ilike(pattern, escape="\\"),
                Product.display_name.ilike(pattern, escape="\\"),
            )
        ),
        composition,
    )
    result = await _paginate(
        db, _apply_sort(apply_exclusions(stmt, rule), sort, rule), page, size
    )

    await cache_set(key, result.model_dump_json(by_alias=True), LIST_CACHE_TTL)
    response.headers["Cache-Control"] = "public, max-age=60"
    response.headers["X-Cache"] = "MISS"
    return result


# OCR 텍스트와 제품명의 trgm 유사도 하한.
#
# pg_trgm 기본 임계값은 0.3인데, OCR이 0↔O·1↔l을 섞고 용량·원산지 문구까지
# 끌고 오면 정답도 0.3 아래로 내려간다(실측 0.47~0.51). 낮게 잡아 후보를
# 넓히고, "자동 선택할 만큼 확실한가"는 점수를 받은 호출 측이 정한다.
MATCH_THRESHOLD = 0.15

# 한글명과 영문명을 한 번에 훑는다.
#
# 두 쿼리로 나누면 왕복이 두 번이고, 이 DB는 왕복 한 번이 실측 212ms다
# (Neon 원격). 4,013 + 3,175행이라 순차 스캔 비용은 왕복보다 훨씬 싸다 —
# 그래서 인덱스를 타는 `%` 연산자 대신 임계값 비교를 쓴다. `%`는
# set_limit()으로 세션 상태를 바꿔야 하는데 커넥션 풀에서는 신뢰할 수 없다.
_MATCH_SQL = """
with hits as (
  select p.id as product_id, 'ko' as src,
         similarity(lower(coalesce(p.display_name, p.name)), lower(:q)) as s,
         coalesce(p.display_name, p.name) as matched_text
  from products p
  where similarity(lower(coalesce(p.display_name, p.name)), lower(:q)) >= :th
  union all
  select e.product_id, 'en',
         similarity(lower(e.name_en), lower(:q)), e.name_en
  from product_names_en e
  where similarity(lower(e.name_en), lower(:q)) >= :th
),
ranked as (
  select *, row_number() over (partition by product_id order by s desc) rn from hits
)
select product_id, src, s, matched_text
from ranked where rn = 1
order by s desc, product_id
limit :lim
"""


@router.get("/match", response_model=list[ProductMatchOut], summary="OCR 텍스트로 제품 찾기")
async def match_products(
    q: str = Query(..., min_length=2, description="OCR로 읽은 텍스트"),
    limit: int = Query(5, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
) -> list[ProductMatchOut]:
    """포장에서 읽은 텍스트로 비슷한 제품을 찾는다.

    `/search`와 다른 이유
    --------------------
    `/search`는 `ILIKE '%q%'`다. **OCR이 한 글자만 틀려도 0건**이 된다 —
    `T0RRIDEN`은 아무것도 반환하지 않는다. 여기서는 trgm 유사도로 대조하고
    점수를 함께 내므로, 호출 측이 "자동 선택할까 목록을 보여줄까"를 정할 수
    있다. 지금 OCR은 완전 실패가 44.4%여서(scripts/OCR_SUMMARY.md) 그
    판단이 호출 측에 있어야 한다.

    영문명을 함께 보는 이유
    ----------------------
    예전에는 영문을 한글 발음으로 근사 전사해 대조했다(extract_product_name.py의
    transliterate). 그러면 점수가 0.15 구간에 깔려 임계값을 정할 수 없고,
    `Low Molecular → 저분자`처럼 음차가 아니라 번역인 이름은 아예 빗나갔다.
    `product_names_en`에 실제 영문명이 들어온 뒤로는 원문 그대로 맞춘다.

    **브랜드를 지우지 말고 통짜로 넘기는 게 낫다.** 제품명 줄만 남기면
    오답이 1위로 올라온다 — '어성초 77 토너'는 블랑네이처를, 브랜드를 포함한
    '아누아 어성초 77 토너'는 아누아를 1위로 낸다.

    캐시는 두지 않는다. 질의가 매번 다른 OCR 텍스트라 적중률이 없다.
    """
    rows = (
        await db.execute(
            text(_MATCH_SQL), {"q": q, "th": MATCH_THRESHOLD, "lim": limit}
        )
    ).all()
    if not rows:
        return []

    products = {
        p.id: p
        for p in await db.scalars(
            select(Product)
            .where(Product.id.in_([r.product_id for r in rows]))
            .options(joinedload(Product.brand), joinedload(Product.category))
        )
    }

    out = []
    for r in rows:
        product = products.get(r.product_id)
        if product is None:  # 조회 사이에 지워진 제품
            continue
        out.append(
            ProductMatchOut(
                product=_to_out(product),
                signals=MatchSignalsOut(
                    text=MatchSignalOut(
                        score=round(float(r.s), 4),
                        matched_on=r.src,
                        matched_text=r.matched_text,
                    )
                ),
            )
        )
    return out


@router.get("/{product_id}", response_model=ProductDetailOut, summary="제품 상세")
async def get_product(
    response: Response,
    product_id: int = Path(..., ge=1),
    db: AsyncSession = Depends(get_db),
) -> ProductDetailOut | Response:
    """제품 1건과 전성분을 표기 순서대로 반환한다."""
    version = await get_cache_version()
    key = f"products:detail:v{version}:{product_id}"
    cached = await cache_get(key)
    if cached is not None:
        return Response(
            content=cached, media_type="application/json",
            headers={"Cache-Control": "public, max-age=300", "X-Cache": "HIT"},
        )

    product = await db.scalar(
        select(Product)
        .where(Product.id == product_id)
        .options(joinedload(Product.brand), joinedload(Product.category))
    )
    if product is None:
        # 404는 캐싱하지 않는다 — 부정 결과를 캐시하면 나중에 데이터가
        # 생겨도 TTL이 지날 때까지 계속 404가 나갈 수 있다.
        raise HTTPException(status_code=404, detail="제품을 찾을 수 없습니다")

    # 설명은 LEFT JOIN이다. 설명이 없는 성분(파싱 잔해 등)도 전성분에서
    # 빠지면 안 된다 — 화면은 description이 None이면 '준비 중'을 그린다.
    rows = await db.execute(
        select(Ingredient.id, Ingredient.name_ko, Ingredient.name_en,
               ProductIngredient.position, Ingredient.grade, Ingredient.is_allergen,
               IngredientDescription.description, IngredientDescription.keywords,
               IngredientDescription.source)
        .join(ProductIngredient, ProductIngredient.ingredient_id == Ingredient.id)
        .outerjoin(IngredientDescription,
                   IngredientDescription.ingredient_id == Ingredient.id)
        .where(ProductIngredient.product_id == product_id)
        .order_by(ProductIngredient.position)
    )

    base = _to_out(product)
    detail = ProductDetailOut(
        **base.model_dump(),
        product_url=product.product_url,
        volume=product.volume,
        country=product.country,
        manufacturer=product.manufacturer,
        expiry=product.expiry,
        report_no=product.report_no,
        ingredient_count_raw=product.ingredient_count_raw,
        ingredients=[
            IngredientOut(
                id=i, name=ko, name_en=en, position=pos,
                grade=grade, is_allergen=allergen,
                description=desc, keywords=kws or [], description_source=src,
            )
            for i, ko, en, pos, grade, allergen, desc, kws, src in rows.all()
        ],
    )

    await cache_set(key, detail.model_dump_json(by_alias=True), DETAIL_CACHE_TTL)
    response.headers["Cache-Control"] = "public, max-age=300"
    response.headers["X-Cache"] = "MISS"
    return detail


@router.get(
    "/{product_id}/reviews",
    response_model=ProductReviewsOut,
    summary="제품 후기",
)
async def list_product_reviews(
    product_id: int = Path(..., ge=1),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> ProductReviewsOut:
    """이 제품에 달린 후기.

    **캐시하지 않는다.** 제품 정보와 달리 후기는 사용자가 방금 쓴 것이
    바로 보여야 한다.

    후기는 산 제품에만 쓸 수 있다(`reviews.order_item_id`). 그래서 목록이
    비어 있는 것이 정상이고, 지금은 대부분의 제품이 그렇다 — 없는 후기를
    지어내는 대신 빈 목록을 낸다.

    `products.review_count`(크롤링으로 받아 온 올리브영 리뷰 수)와는 다른
    값이다. 저쪽은 우리가 내용을 갖고 있지 않다.
    """
    exists = await db.scalar(select(Product.id).where(Product.id == product_id))
    if exists is None:
        raise HTTPException(status_code=404, detail="제품을 찾을 수 없습니다")

    # 분포는 전체 기준이다. 페이지를 넘겨도 막대가 흔들리지 않는다.
    buckets = dict.fromkeys(range(1, 6), 0)
    for rating, count in await db.execute(
        select(Review.rating, func.count())
        .where(Review.product_id == product_id)
        .group_by(Review.rating)
    ):
        buckets[int(rating)] = int(count)

    total = sum(buckets.values())
    average = (
        round(sum(r * n for r, n in buckets.items()) / total, 1) if total > 0 else None
    )

    rows = await db.execute(
        select(Review, User.nickname)
        .join(User, User.id == Review.user_id)
        .where(Review.product_id == product_id)
        .order_by(Review.created_at.desc())
        .limit(limit)
        .offset(offset)
    )

    return ProductReviewsOut(
        items=[
            ProductReviewOut(
                id=review.id,
                # 닉네임만 낸다. 없으면 가린다 — 이메일을 대신 쓰면 그게 유출이다.
                nickname=nickname or "익명",
                rating=review.rating,
                body=review.body,
                created_at=review.created_at,
            )
            for review, nickname in rows
        ],
        total=total,
        average=average,
        distribution=buckets,
    )
