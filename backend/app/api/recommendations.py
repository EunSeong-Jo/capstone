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

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.db.session import get_db
from app.models.product import Product
from app.models.recommendation import Similarity
from app.schemas.similarity import SimilarListOut, SimilarProductOut

router = APIRouter(prefix="/api/v1/products", tags=["recommendations"])

MAX_LIMIT = 20  # 배치가 제품당 20개만 적재한다. 더 달라고 해도 줄 게 없다.


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
    product_id: int = Path(..., ge=1),
    method: Method = Query(
        Method.tfidf,
        description="tfidf=IDF 가중 코사인(기본) · jaccard=단순 교집합 · rbo=표기 순서 반영",
    ),
    limit: int = Query(10, ge=1, le=MAX_LIMIT),
    db: AsyncSession = Depends(get_db),
) -> SimilarListOut:
    """유사도 높은 순으로 최대 20개.

    캐싱을 붙이지 않았다. `core/cache.py`의 버전 키 방식을 쓰려면 배치
    실행과 무효화 시점을 맞춰야 하는데, 지금은 데이터가 부분 적재라
    이르다. 조회 자체는 idx_similarities_lookup 하나로 끝난다.
    """
    # 제품이 실제로 없는 것과 유사도가 아직 없는 것을 구분한다.
    exists = await db.scalar(select(Product.id).where(Product.id == product_id))
    if exists is None:
        raise HTTPException(status_code=404, detail="제품을 찾을 수 없습니다")

    rows = await db.execute(
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

    items = [
        SimilarProductOut(
            id=p.id,
            name=p.name,
            brand=p.brand.name if p.brand else "",
            category=p.category.code if p.category else "",
            price=p.price or 0,
            image_url=p.image_url,
            rating=float(p.rating) if p.rating is not None else None,
            review_count=p.review_count,
            composition=p.composition,
            score=score,
            shared_ingredients=shared or [],
        )
        for score, shared, p in rows.all()
    ]

    return SimilarListOut(seed_id=product_id, method=method.value, items=items)
