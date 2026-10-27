"""제품 ↔ 피부 궁합 (Task 14).

    GET /api/v1/products/{id}/skin-fit?skinType=samak

피부타입은 쿼리로 받는다. 비회원도 진단 결과를 로컬에 갖고 있고, 결과가 계정과 무관하게
(제품 × 피부타입 × 5축)으로만 정해져 모든 사용자가 캐시를 같이 쓸 수 있다.
판정은 피부타입만으로 정한다(진단 5축 보정은 쓰지 않는다 — 목록 정렬·배지·카드가 같은 값을 보게 하려는 것이다).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.recommendations import load_labeled_docs
from app.core.cache import cache_get, cache_set, get_cache_version
from app.db.session import get_db
from app.models.product import Product
from app.models.recommendation import ProductSkinFit
from app.schemas.skin_fit import (
    FitBriefOut,
    FitIngredientOut,
    FitReasonOut,
    SkinFitBatchOut,
    SkinFitOut,
)
from app.services.skin_fit import PREFER, evaluate

router = APIRouter(prefix="/api/v1/products", tags=["skin-fit"])

CACHE_TTL = 60 * 60 * 24


@router.get("/{product_id}/skin-fit", response_model=SkinFitOut, summary="내 피부와의 궁합")
async def read_skin_fit(
    response: Response,
    product_id: int = Path(..., ge=1),
    skin_type: str = Query(..., alias="skinType", description="피부타입 ID (8종)"),
    db: AsyncSession = Depends(get_db),
) -> SkinFitOut:
    if skin_type not in PREFER:
        raise HTTPException(status_code=422, detail="알 수 없는 피부타입입니다")
    version = await get_cache_version()
    key = f"skinfit:v{version}:{product_id}:{skin_type}"
    cached = await cache_get(key)
    if cached is not None:
        response.headers["X-Cache"] = "HIT"
        return SkinFitOut.model_validate_json(cached)

    exists = await db.scalar(select(Product.id).where(Product.id == product_id))
    if exists is None:
        raise HTTPException(status_code=404, detail="제품을 찾을 수 없습니다")

    docs, labels, names, positions = await load_labeled_docs(db, [product_id])
    fit = evaluate(docs.get(product_id, []), labels, names, skin_type, None, positions.get(product_id))
    out = SkinFitOut(
        product_id=product_id, skin_type=skin_type, verdict=fit.verdict, score=fit.score,
        reasons=[
            FitReasonOut(
                kind=r.kind, text=r.text,
                ingredients=[FitIngredientOut(position=p, name=n) for p, n in r.ingredients],
            )
            for r in fit.reasons
        ],
    )
    await cache_set(key, out.model_dump_json(by_alias=True), CACHE_TTL)
    response.headers["X-Cache"] = "MISS"
    return out


MAX_BATCH = 60

batch_router = APIRouter(prefix="/api/v1", tags=["skin-fit"])


@batch_router.get("/skin-fit", response_model=SkinFitBatchOut, summary="여러 제품의 궁합 요약")
async def read_skin_fit_batch(
    response: Response,
    ids: str = Query(..., description="제품 id를 쉼표로 (최대 60개)"),
    skin_type: str = Query(..., alias="skinType", description="피부타입 ID (8종)"),
    db: AsyncSession = Depends(get_db),
) -> SkinFitBatchOut:
    """상품 목록 카드의 '궁합' 배지용. 이유 문구 없이 판정과 점수만 준다.

    카드가 한꺼번에 묻는 용도라 id를 모아 한 번에 받는다. 없는 제품은 결과에서 빠진다.
    """
    if skin_type not in PREFER:
        raise HTTPException(status_code=422, detail="알 수 없는 피부타입입니다")
    try:
        want = sorted({int(x) for x in ids.split(",") if x.strip()})
    except ValueError:
        raise HTTPException(status_code=422, detail="ids는 숫자를 쉼표로 이어 주세요") from None
    if not want or len(want) > MAX_BATCH:
        raise HTTPException(status_code=422, detail=f"ids는 1~{MAX_BATCH}개여야 합니다")

    version = await get_cache_version()
    key = f"skinfitb:v{version}:{skin_type}:{','.join(map(str, want))}"
    cached = await cache_get(key)
    if cached is not None:
        response.headers["X-Cache"] = "HIT"
        return SkinFitBatchOut.model_validate_json(cached)

    existing = set((await db.scalars(select(Product.id).where(Product.id.in_(want)))).all())
    items = []
    rows = {
        r.product_id: r
        for r in (
            await db.scalars(
                select(ProductSkinFit).where(
                    ProductSkinFit.product_id.in_(existing), ProductSkinFit.skin_type == skin_type
                )
            )
        ).all()
    }
    for pid in want:
        if pid not in existing:
            continue
        row = rows.get(pid)
        items.append(
            FitBriefOut(
                product_id=pid,
                verdict=row.verdict if row else "unknown",
                score=row.score if row else None,
            )
        )
    out = SkinFitBatchOut(skin_type=skin_type, items=items)
    await cache_set(key, out.model_dump_json(by_alias=True), CACHE_TTL)
    response.headers["X-Cache"] = "MISS"
    return out
