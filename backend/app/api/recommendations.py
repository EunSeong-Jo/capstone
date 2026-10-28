"""대체품 조회 API (Task 3).

    GET /api/v1/products/{id}/similar   성분이 비슷한 제품

`api/products.py`와 prefix가 같지만 파일을 나눴다. 그쪽은 캐싱·페이지네이션
공통 로직이 이미 촘촘해서, 성격이 다른 추천 계통을 얹으면 읽기 어려워진다.
경로는 겹치지 않는다 — `/{id}/similar`는 세그먼트가 하나 더 많아 기존
`/{product_id}`가 가로채지 않는다.

similarities는 배치(scripts/compute_similarities.py)가 채운다. 아직 일부
카테고리만 적재돼 있어 **비어 있으면 빈 배열에 200**을 낸다. 404가 아니다 —
제품은 존재하고 계산이 아직 안 됐을 뿐이며, 프론트는 그 경우 '준비 중'
자리표시자를 그대로 두면 된다.
"""
from __future__ import annotations

from enum import Enum

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.cache import cache_get, cache_set, get_cache_version
from app.db.session import get_db
from app.models.product import Ingredient, IngredientFunction, Product, ProductIngredient
from app.models.recommendation import ProductSkinFit, Similarity
from app.schemas.similarity import SimilarListOut, SimilarProductOut
from app.services.similarity import form_compatible, shared_functions
from app.services.skin_fit import PREFER, build_flags
from app.services.skin_type import apply_exclusions, load_rule

router = APIRouter(prefix="/api/v1/products", tags=["recommendations"])

MAX_LIMIT = 20  # 배치가 제품당 20개만 적재한다. 더 달라고 해도 줄 게 없다.
# 유사도는 배치가 새로 돌기 전까지 바뀌지 않는다. 배치·적재 스크립트가
# products:cache_version을 올리면 키가 바뀌어 저절로 새로 계산된다.
CACHE_TTL = 60 * 60 * 24


class Method(str, Enum):
    """배치가 적재하는 방식. Enum이라 잘못된 값은 FastAPI가 422로 막는다."""

    hybrid = "hybrid"
    tfidf = "tfidf"


@router.get(
    "/{product_id}/similar",
    response_model=SimilarListOut,
    summary="성분이 비슷한 제품",
)
async def list_similar(
    response: Response,
    product_id: int = Path(..., ge=1),
    method: Method = Query(
        Method.hybrid,
        description=(
            "hybrid=성분 역할 가중 + 기능 프로필(기본, 적재 전이면 tfidf로 대신함) · "
            "tfidf=IDF 가중 코사인"
        ),
    ),
    limit: int = Query(10, ge=1, le=MAX_LIMIT),
    skin_type: str | None = Query(
        None, alias="skinType",
        description="피부타입 ID. 기피 성분이 든 대체품을 뺀다",
    ),
    fit_for: str | None = Query(
        None, alias="fitFor",
        description="피부타입 ID. 주면 각 항목에 skinMatch(궁합 판정)를 붙인다. 걸러내지는 않는다",
    ),
    db: AsyncSession = Depends(get_db),
) -> SimilarListOut:
    """유사도 높은 순으로 최대 20개.

    skinType을 주면 `skin_type_rules`의 exclude_tags에 걸리는 대체품을 뺀다.
    성분이 비슷하다고 다 권할 수 있는 건 아니다 — 민감성 사용자에게
    착향제가 든 제품을 대체품으로 내밀면 유사도가 높을수록 더 나쁘다.

    Redis에 24시간 캐시한다. 결과는 제품·방식·피부타입으로만 정해지고
    계정과 무관해서, 한 번 계산하면 모든 사용자가 같이 쓴다. 홈의 교체
    제안이 화장대 제품마다 이 API를 부르는데 한 번에 1~2초씩 걸렸다(Neon
    왕복 여러 번). 무효화는 `products:cache_version` — 유사도 배치
    (`scripts/compute_similarities.py`)와 제품 적재가 올린다.
    """
    version = await get_cache_version()
    key = f"similar:v{version}:form4:{product_id}:{method.value}:{limit}:{skin_type or 'any'}:{fit_for or '-'}"
    cached = await cache_get(key)
    if cached is not None:
        response.headers["X-Cache"] = "HIT"
        return SimilarListOut.model_validate_json(cached)

    # 제품이 실제로 없는 것과 유사도가 아직 없는 것을 구분한다.
    # 404는 캐시하지 않는다 — 없는 id로 키를 채울 이유가 없다.
    seed = await db.scalar(select(Product).where(Product.id == product_id))
    if seed is None:
        raise HTTPException(status_code=404, detail="제품을 찾을 수 없습니다")
    seed_name = seed.display_name or seed.name

    rule = await load_rule(db, skin_type)
    used = method.value
    rows_all = await _fetch(db, product_id, used, rule)
    if not rows_all and method is Method.hybrid:
        # hybrid가 아직 적재되지 않은 환경(배치 전)에서는 기존 방식으로 대신한다.
        used = Method.tfidf.value
        rows_all = await _fetch(db, product_id, used, rule)

    # 제형이 다른 제품(토너 ↔ 세럼, 크림 ↔ 미스트)은 대체품이 못 된다. 적재된 20개 전부에서 거른 뒤 limit만 남긴다.
    rows_all = [r for r in rows_all if form_compatible(seed_name, r[2].display_name or r[2].name)][:limit]

    funcs: dict[int, list[str]] = {}
    seed_fit_score: int | None = None
    fits: dict[int, tuple[str, int | None]] = {}
    if rows_all and used == Method.hybrid.value:
        item_ids = [p.id for _, _, p in rows_all]
        docs, labels, names, _pos = await load_labeled_docs(db, [product_id, *item_ids])
        seed_doc = docs.get(product_id, [])
        funcs = {i: shared_functions(seed_doc, docs.get(i, []), labels) for i in item_ids}
    if fit_for in PREFER and rows_all:
        seed_fit_score = await db.scalar(
            select(ProductSkinFit.score).where(
                ProductSkinFit.skin_type == fit_for, ProductSkinFit.product_id == product_id
            )
        )
        # 목록 정렬·배지·카드와 같은 사전 계산 결과(product_skin_fit)를 읽는다
        fits = {
            pid: (verdict, score)
            for pid, verdict, score in (
                await db.execute(
                    select(
                        ProductSkinFit.product_id, ProductSkinFit.verdict, ProductSkinFit.score
                    ).where(
                        ProductSkinFit.skin_type == fit_for,
                        ProductSkinFit.product_id.in_([p.id for _, _, p in rows_all]),
                    )
                )
            ).all()
        }

    items = [
        SimilarProductOut(
            id=p.id,
            name=p.display_name or p.name,
            brand=p.brand.name if p.brand else "",
            category=p.category.code if p.category else "",
            price=p.price or 0,
            image_url=p.image_url,
            rating=float(p.rating) if p.rating is not None else None,
            review_count=p.registered_review_count,
            composition=p.composition,
            unit_price=float(p.unit_price) if p.unit_price is not None else None,
            unit_label=p.unit_label,
            score=score,
            shared_ingredients=shared or [],
            shared_functions=funcs.get(p.id, []),
            skin_match=fits[p.id][0] if p.id in fits else None,
            skin_fit_score=fits[p.id][1] if p.id in fits else None,
        )
        for score, shared, p in rows_all
    ]

    out = SimilarListOut(
        seed_id=product_id, method=used, seed_skin_fit_score=seed_fit_score,
        seed_unit_price=float(seed.unit_price) if seed.unit_price is not None else None,
        seed_unit_label=seed.unit_label,
        items=items,
    )
    await cache_set(key, out.model_dump_json(by_alias=True), CACHE_TTL)
    response.headers["X-Cache"] = "MISS"
    return out


async def _fetch(db: AsyncSession, product_id: int, method: str, rule):
    # 제형 필터를 거치면 줄어드니 적재된 후보를 전부 읽는다(MAX_LIMIT).
    stmt = (
        select(Similarity.score, Similarity.shared_ingredients, Product)
        .join(Product, Product.id == Similarity.similar_id)
        .where(
            Similarity.product_id == product_id,
            Similarity.method == method,
            # 배치가 단일제품만 계산하므로 similar_id도 전부 single이다.
            # 논리적으로는 중복이지만, 분류 규칙을 바꾸고 재계산하기 전까지
            # 남는 옛 행이 추천에 새어 나오지 않도록 하는 안전망이다.
            Product.composition == "single",
        )
        .options(joinedload(Product.brand), joinedload(Product.category))
        .order_by(Similarity.score.desc(), Product.id)
        .limit(MAX_LIMIT)
    )
    rows = await db.execute(apply_exclusions(stmt, rule))
    return rows.all()


async def load_labeled_docs(
    db: AsyncSession, product_ids: list[int]
) -> tuple[dict[int, list[int]], dict[int, tuple], dict[int, str], dict[int, list[int]]]:
    """제품별 성분 목록(표기 순서)·성분 라벨·이름·표기 순서 번호. 라벨이 있는 성분만 담는다.

    라벨의 flags에는 `skin_fit.build_flags`가 내부 마커(A 고시 목록, G 일반 향료)를 덧붙여 둔다.
    """
    res = await db.execute(
        select(
            ProductIngredient.product_id,
            ProductIngredient.ingredient_id,
            ProductIngredient.position,
            IngredientFunction.functions,
            IngredientFunction.role,
            IngredientFunction.flags,
            IngredientFunction.confidence,
            IngredientFunction.allergen_listed,
            Ingredient.name_ko,
            Ingredient.norm_name,
        )
        .join(
            IngredientFunction,
            IngredientFunction.ingredient_id == ProductIngredient.ingredient_id,
        )
        .join(Ingredient, Ingredient.id == ProductIngredient.ingredient_id)
        .where(ProductIngredient.product_id.in_(product_ids))
        .order_by(ProductIngredient.product_id, ProductIngredient.position)
    )
    docs: dict[int, list[int]] = {}
    positions: dict[int, list[int]] = {}
    labels: dict[int, tuple] = {}
    names: dict[int, str] = {}
    for pid, ing, pos, funcs, role, flags, conf, listed, name, norm in res.all():
        docs.setdefault(pid, []).append(ing)
        positions.setdefault(pid, []).append(pos)
        labels[ing] = ("".join(funcs or []), role, build_flags("".join(flags or []), listed, norm), conf)
        names[ing] = name
    return docs, labels, names, positions
