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
from app.models.product import Product
from app.models.recommendation import Similarity
from app.schemas.similarity import SimilarListOut, SimilarProductOut
from app.services.skin_type import apply_exclusions, load_rule

router = APIRouter(prefix="/api/v1/products", tags=["recommendations"])

MAX_LIMIT = 20  # 배치가 제품당 20개만 적재한다. 더 달라고 해도 줄 게 없다.
# 유사도는 배치가 새로 돌기 전까지 바뀌지 않는다. 배치·적재 스크립트가
# products:cache_version을 올리면 키가 바뀌어 저절로 새로 계산된다.
CACHE_TTL = 60 * 60 * 24


class Method(str, Enum):
    """배치가 적재하는 세 방식. Enum이라 잘못된 값은 FastAPI가 422로 막는다."""

    tfidf = "tfidf"
    jaccard = "jaccard"
    rbo = "rbo"


@router.get(
    "/{product_id}/similar",
    response_model=SimilarListOut,
    summary="성분이 비슷한 제품",
)
async def list_similar(
    response: Response,
    product_id: int = Path(..., ge=1),
    method: Method = Query(
        Method.tfidf,
        description="tfidf=IDF 가중 코사인(기본) · jaccard=단순 교집합 · rbo=표기 순서 반영",
    ),
    limit: int = Query(10, ge=1, le=MAX_LIMIT),
    skin_type: str | None = Query(
        None, alias="skinType",
        description="피부타입 ID. 기피 성분이 든 대체품을 뺀다",
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
    key = f"similar:v{version}:{product_id}:{method.value}:{limit}:{skin_type or 'any'}"
    cached = await cache_get(key)
    if cached is not None:
        response.headers["X-Cache"] = "HIT"
        return SimilarListOut.model_validate_json(cached)

    # 제품이 실제로 없는 것과 유사도가 아직 없는 것을 구분한다.
    # 404는 캐시하지 않는다 — 없는 id로 키를 채울 이유가 없다.
    exists = await db.scalar(select(Product.id).where(Product.id == product_id))
    if exists is None:
        raise HTTPException(status_code=404, detail="제품을 찾을 수 없습니다")

    rule = await load_rule(db, skin_type)
    stmt = (
        select(Similarity.score, Similarity.shared_ingredients, Product)
        .join(Product, Product.id == Similarity.similar_id)
        .where(
            Similarity.product_id == product_id,
            Similarity.method == method.value,
            # 배치가 단일제품만 계산하므로 similar_id도 전부 single이다.
            # 논리적으로는 중복이지만, 분류 규칙을 바꾸고 재계산하기 전까지
            # 남는 옛 행이 추천에 새어 나오지 않도록 하는 안전망이다.
            Product.composition == "single",
        )
        .options(joinedload(Product.brand), joinedload(Product.category))
        .order_by(Similarity.score.desc(), Product.id)
        .limit(limit)
    )
    rows = await db.execute(apply_exclusions(stmt, rule))

    items = [
        SimilarProductOut(
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
            score=score,
            shared_ingredients=shared or [],
        )
        for score, shared, p in rows.all()
    ]

    out = SimilarListOut(seed_id=product_id, method=method.value, items=items)
    await cache_set(key, out.model_dump_json(by_alias=True), CACHE_TTL)
    response.headers["X-Cache"] = "MISS"
    return out
