"""내 성분 취향 (퍼스널 AI 3단계).

    GET /api/v1/me/preferences   내가 좋아하는·피하는 성분과 그 근거 제품

화면이 "왜 이 제품이 나에게 맞아 보이는지"를 설명하는 데 쓴다. 취향이 아직 켜지지 않았으면(신호 부족) `active=false`와
"후기를 쓰거나 찜하면 취향이 쌓여요" 안내만 준다 — 적은 데이터로 취향이 있는 척하지 않는다(`services/preference.py`).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.product import Product
from app.models.user import User
from app.schemas.preference import EvidenceProduct, PreferenceIngredientOut, PreferenceOut
from app.services import preference

router = APIRouter(prefix="/api/v1/me", tags=["preferences"])

SHOW = 6            # 성분 개수
EVIDENCE = 3        # 성분마다 근거 제품 개수


@router.get("/preferences", response_model=PreferenceOut, summary="내 성분 취향")
async def read_preferences(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> PreferenceOut:
    raw = await preference.load_signals(db, user.id)
    sources = preference.signal_summary(raw)
    profile, names, _labels, _idf = await preference.load_profile(db, user.id)

    if not profile.active:
        need = max(preference.MIN_SIGNALS - profile.signal_count, 0)
        hint = (
            f"후기를 쓰거나 마음에 드는 제품을 찜하면 취향이 쌓여요. {need}개만 더 있으면 시작해요."
            if need
            else "좋아한 제품(후기 4~5점·찜·재구매)이 하나는 있어야 취향을 알 수 있어요."
        )
        return PreferenceOut(
            active=False, signal_count=profile.signal_count, min_signals=preference.MIN_SIGNALS,
            sources=sources, liked=[], disliked=[], message=hint,
        )

    pids = {p for owners in (*profile.pos_products.values(), *profile.neg_products.values()) for p in owners}
    product_rows = (await db.execute(select(Product.id, Product.display_name, Product.name).where(Product.id.in_(pids)))).all()
    product_names = {pid: display or name for pid, display, name in product_rows}

    def rows(weights: dict[int, float], owners: dict[int, list[int]]) -> list[PreferenceIngredientOut]:
        top = preference.top_ingredients(weights, SHOW)
        peak = top[0][1] if top else 1.0
        return [
            PreferenceIngredientOut(
                ingredient_id=ing,
                name=names.get(ing, str(ing)),
                weight=max(1, round(100 * w / peak)),
                products=[EvidenceProduct(id=p, name=product_names.get(p, "")) for p in owners.get(ing, [])[:EVIDENCE] if p in product_names],
            )
            for ing, w in top
        ]

    return PreferenceOut(
        active=True, signal_count=profile.signal_count, min_signals=preference.MIN_SIGNALS, sources=sources,
        liked=rows(profile.pos, profile.pos_products), disliked=rows(profile.neg, profile.neg_products),
        message="내가 좋아한 제품들의 성분을 모아 만든 취향이에요. 후기·찜·재구매가 늘수록 정확해져요.",
    )
