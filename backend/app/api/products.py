"""제품 조회 API (Task 6.1).

읽기 전용 3개. 프론트엔드가 src/mocks/를 벗고 실제 데이터로 붙는 통로다.

    GET /api/v1/products          목록 · 필터 · 정렬 · 페이지네이션
    GET /api/v1/products/search   제품명 부분일치
    GET /api/v1/products/{id}     상세 + 전성분

경로 순서 주의: /search가 /{id}보다 먼저 선언돼야 한다. 뒤에 두면
FastAPI가 "search"를 id로 해석해 422를 낸다.
"""
from __future__ import annotations

import hashlib
import json
from enum import Enum

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response
from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.cache import cache_get, cache_set, get_cache_version
from app.db.session import get_db
from app.models.product import (
    Brand,
    Category,
    Ingredient,
    Product,
    ProductIngredient,
)
from app.schemas.product import (
    IngredientOut,
    ProductDetailOut,
    ProductListOut,
    ProductOut,
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
    price_desc = "priceDesc"
    rating = "rating"


def _apply_sort(stmt: Select, sort: SortBy) -> Select:
    # NULL을 뒤로 보낸다. rating·review_count에 결측이 69건(1.7%) 있어,
    # 기본값 없이 정렬하면 PostgreSQL이 NULL을 최대값으로 취급해 앞에 세운다.
    if sort is SortBy.price_asc:
        return stmt.order_by(Product.price.asc(), Product.id.asc())
    if sort is SortBy.price_desc:
        return stmt.order_by(Product.price.desc(), Product.id.asc())
    if sort is SortBy.rating:
        return stmt.order_by(Product.rating.desc().nullslast(), Product.id.asc())
    return stmt.order_by(Product.review_count.desc().nullslast(), Product.id.asc())


def _to_out(p: Product) -> ProductOut:
    """ORM → 응답 DTO. brand·category를 문자열로 편다."""
    return ProductOut(
        id=p.id,
        name=p.name,
        brand=p.brand.name if p.brand else "",
        category=p.category.code if p.category else "",
        price=p.price or 0,
        image_url=p.image_url,
        rating=float(p.rating) if p.rating is not None else None,
        review_count=p.review_count,
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
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=MAX_PAGE_SIZE),
) -> ProductListOut | Response:
    """조건에 맞는 제품을 정렬해 반환한다.

    품절·단종은 기본으로 제외한다(status='active').
    """
    version = await get_cache_version()
    key = _cache_key(
        "list", version,
        category=category, brand=brand, min_price=min_price,
        max_price=max_price, sort=sort.value, page=page, size=size,
    )
    cached = await cache_get(key)
    if cached is not None:
        return Response(
            content=cached, media_type="application/json",
            headers={"Cache-Control": "public, max-age=60", "X-Cache": "HIT"},
        )

    stmt = select(Product).where(Product.status == "active")

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

    result = await _paginate(db, _apply_sort(stmt, sort), page, size)

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
    key = _cache_key("search", version, q=q, sort=sort.value, page=page, size=size)
    cached = await cache_get(key)
    if cached is not None:
        return Response(
            content=cached, media_type="application/json",
            headers={"Cache-Control": "public, max-age=60", "X-Cache": "HIT"},
        )

    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    stmt = (
        select(Product)
        .where(Product.status == "active")
        .where(Product.name.ilike(f"%{escaped}%", escape="\\"))
    )
    result = await _paginate(db, _apply_sort(stmt, sort), page, size)

    await cache_set(key, result.model_dump_json(by_alias=True), LIST_CACHE_TTL)
    response.headers["Cache-Control"] = "public, max-age=60"
    response.headers["X-Cache"] = "MISS"
    return result


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

    rows = await db.execute(
        select(Ingredient.id, Ingredient.name_ko, Ingredient.name_en,
               ProductIngredient.position)
        .join(ProductIngredient, ProductIngredient.ingredient_id == Ingredient.id)
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
            IngredientOut(id=i, name=ko, name_en=en, position=pos)
            for i, ko, en, pos in rows.all()
        ],
    )

    await cache_set(key, detail.model_dump_json(by_alias=True), DETAIL_CACHE_TTL)
    response.headers["Cache-Control"] = "public, max-age=300"
    response.headers["X-Cache"] = "MISS"
    return detail
