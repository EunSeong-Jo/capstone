"""제품 조회 API (Task 6.1).

읽기 전용 3개. 프론트엔드가 src/mocks/를 벗고 실제 데이터로 붙는 통로다.

    GET /api/v1/products          목록 · 필터 · 정렬 · 페이지네이션
    GET /api/v1/products/search   제품명 부분일치
    GET /api/v1/products/{id}     상세 + 전성분

경로 순서 주의: /search가 /{id}보다 먼저 선언돼야 한다. 뒤에 두면
FastAPI가 "search"를 id로 해석해 422를 낸다.
"""
from __future__ import annotations

from enum import Enum

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

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
    """공통 페이지네이션. count와 목록을 각각 한 번씩 조회한다."""
    total = await db.scalar(
        select(func.count()).select_from(stmt.order_by(None).subquery())
    )
    rows = await db.scalars(
        stmt.options(selectinload(Product.brand), selectinload(Product.category))
        .offset((page - 1) * size)
        .limit(size)
    )
    return ProductListOut(
        items=[_to_out(p) for p in rows.all()],
        total=total or 0,
        page=page,
        size=size,
    )


@router.get("", response_model=ProductListOut, summary="제품 목록")
async def list_products(
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
) -> ProductListOut:
    """조건에 맞는 제품을 정렬해 반환한다.

    품절·단종은 기본으로 제외한다(status='active').
    """
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

    return await _paginate(db, _apply_sort(stmt, sort), page, size)


@router.get("/search", response_model=ProductListOut, summary="제품명 검색")
async def search_products(
    db: AsyncSession = Depends(get_db),
    q: str = Query(..., min_length=2, description="검색어 (2자 이상)"),
    sort: SortBy = Query(SortBy.popular),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=MAX_PAGE_SIZE),
) -> ProductListOut:
    """제품명 부분일치 검색.

    ILIKE '%q%'는 idx_products_name_trgm(gin_trgm_ops)이 받는다.
    앞뒤 와일드카드라도 trigram 인덱스는 동작한다 — B-tree와 다른 점이다.

    LIKE 메타문자를 이스케이프한다. '50%' 같은 검색어가 와일드카드로
    해석되면 엉뚱한 결과가 나온다.
    """
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    stmt = (
        select(Product)
        .where(Product.status == "active")
        .where(Product.name.ilike(f"%{escaped}%", escape="\\"))
    )
    return await _paginate(db, _apply_sort(stmt, sort), page, size)


@router.get("/{product_id}", response_model=ProductDetailOut, summary="제품 상세")
async def get_product(
    product_id: int = Path(..., ge=1),
    db: AsyncSession = Depends(get_db),
) -> ProductDetailOut:
    """제품 1건과 전성분을 표기 순서대로 반환한다."""
    product = await db.scalar(
        select(Product)
        .where(Product.id == product_id)
        .options(selectinload(Product.brand), selectinload(Product.category))
    )
    if product is None:
        raise HTTPException(status_code=404, detail="제품을 찾을 수 없습니다")

    rows = await db.execute(
        select(Ingredient.id, Ingredient.name_ko, Ingredient.name_en,
               ProductIngredient.position)
        .join(ProductIngredient, ProductIngredient.ingredient_id == Ingredient.id)
        .where(ProductIngredient.product_id == product_id)
        .order_by(ProductIngredient.position)
    )

    base = _to_out(product)
    return ProductDetailOut(
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
