"""프로필 기반 메인 추천 (Task 14).

    GET /api/v1/recommendations/main   홈 큐레이션
    GET /api/v1/recommendations/set    피부타입 맞춤 세트

지금까지 이 계산은 **프론트에서** 일어났다 — `useRecommendations.ts`가 제품
40개를 받아 제품명에 키워드가 들어 있는지로 점수를 매겼다. 두 가지가 문제였다.

  1. 40개 안에서만 골랐다. 카탈로그 2,489개(단일제품) 중 1.6%다.
  2. 근거가 제품명 문자열이었다. 성분을 보지 않았다.

여기서는 `ingredient_tags`를 쓴다. 제품 3,974/4,013에 태그가 붙은 성분이
하나 이상 있어 실제로 갈린다.

점수 (Task 14.3 설계 그대로)
----------------------------
    매칭 성분 0.4 + 별점 0.3 + log(리뷰수) 0.2 + 브랜드 다양성 0.1

앞의 셋은 SQL에서 계산하고, 브랜드 다양성만 파이썬에서 후처리한다 —
"이미 뽑은 목록에 같은 브랜드가 몇 개 있는지"는 행 단위로 볼 수 없다.
"""
from __future__ import annotations

import hashlib

from fastapi import APIRouter, Depends, Query, Response
from pydantic import TypeAdapter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.api.products import _to_out
from app.core.cache import cache_get, cache_set, get_cache_version
from app.config import settings
from app.core.deps import get_optional_user
from app.db.session import get_db
from app.models.product import Product
from app.models.user import User
from app.schemas.budget_guide import BudgetGuideIn, BudgetGuideOut
from app.schemas.product import ProductListOut, ProductOut
from app.services.analysis_scope import analyzed
from app.services.option_scope import listable
from app.services import preference
from app.services.budget_guide import build_guide
from app.services.product_score import W_BRAND, product_score
from app.services.skin_type import apply_exclusions, load_rule

router = APIRouter(prefix="/api/v1/recommendations", tags=["recommendations"])

# 한 브랜드가 목록을 채우지 않도록 하는 감점 폭. 같은 브랜드가 n번째로
# 등장하면 (1 - n * 이 값)을 곱한다.
BRAND_PENALTY = 0.35

CACHE_TTL = 60 * 60 * 24  # 24h. 카탈로그가 자주 바뀌지 않는다.
# 예산 가이드는 요청마다 조합(예산·선호·보유품)이 달라 적중률이 낮다. 짧게 둔다.
BUDGET_CACHE_TTL = 60 * 60
# 응답 모양·문구가 바뀌면 올린다. 올리지 않으면 1시간 동안 예전 응답이 캐시에서 나온다.
BUDGET_FORMAT = 3
_SET_ADAPTER = TypeAdapter(list[ProductOut])

# 세트를 구성할 카테고리 순서. DB에 있는 4종 중 얼굴 루틴 순서다.
SET_CATEGORIES = ("스킨케어", "선케어", "마스크팩", "클렌징")


def _diversify(rows: list[tuple[Product, float]], limit: int) -> list[Product]:
    """브랜드 다양성 후처리.

    점수가 높아도 같은 브랜드가 연달아 나오면 감점한다. 한 브랜드 제품이
    목록을 덮으면 "추천"이 아니라 "그 브랜드 매대"가 된다.
    """
    seen: dict[int, int] = {}
    adjusted = []
    for product, score in rows:
        brand_id = product.brand_id or 0
        appeared = seen.get(brand_id, 0)
        penalty = max(0.0, 1.0 - appeared * BRAND_PENALTY)
        adjusted.append((product, score * (1 - W_BRAND) + W_BRAND * penalty))
        seen[brand_id] = appeared + 1

    adjusted.sort(key=lambda x: x[1], reverse=True)
    return [p for p, _ in adjusted[:limit]]


async def _pool(
    db: AsyncSession,
    skin_type: str | None,
    limit: int,
    category: str | None = None,
) -> list[tuple[Product, float]]:
    """기본 점수(피부타입 궁합·별점·리뷰) 순 후보 `limit × 4`개. 다양성 후처리·취향 반영 전."""
    rule = await load_rule(db, skin_type)
    score = product_score(rule).label("score")

    stmt = (
        select(Product, score)
        # 홈이 먼저 골라 보여 주는 목록이라 성분 분석이 끝난 제품만 낸다(눌렀을 때 "분석 전"이 나오지 않게)
        .where(Product.composition == "single", Product.price.is_not(None), analyzed(), listable())
        .options(joinedload(Product.brand), joinedload(Product.category))
        .order_by(score.desc(), Product.id)
        # 다양성 후처리가 순서를 바꾸므로 넉넉히 받아 온다.
        .limit(limit * 4)
    )
    if category:
        # has()만 쓴다. join까지 걸면 joinedload(Product.category)와 겹쳐
        # 같은 테이블이 두 번 붙는다.
        stmt = stmt.where(Product.category.has(code=category))
    stmt = apply_exclusions(stmt, rule)
    return [(p, float(s)) for p, s in (await db.execute(stmt)).all()]


async def _pick(
    db: AsyncSession,
    skin_type: str | None,
    limit: int,
    category: str | None = None,
) -> list[Product]:
    return _diversify(await _pool(db, skin_type, limit, category), limit)


# 취향 반영은 후보 풀을 넓혀(기본 점수 상위 limit × 이 값) 그 안의 순서를 바꾼다. 풀 밖 제품을 끌어올리지는 않는다.
PERSONAL_POOL_FACTOR = 10
PERSONAL_CACHE_TTL = 60 * 5


def _reason_text(names: list[str]) -> str | None:
    return f"내가 좋아한 {'·'.join(names)} 성분이 들어 있어요" if names else None


async def personalized_pick(
    db: AsyncSession,
    user_id,
    skin_type: str | None,
    limit: int,
    category: str | None = None,
) -> list[tuple[Product, str | None]] | None:
    """내 취향(`services/preference.py`)을 반영한 추천 [(제품, 이유)]. 취향이 아직 켜지지 않았으면 None(기존 추천을 쓴다).

    기본 점수와 취향 점수를 `BLEND` 비율로 섞은 뒤 브랜드 다양성 후처리를 한다. 피부타입에 맞지 않아 걸러진 제품은
    후보 풀(`_pool`)에 애초에 없으므로 취향이 끌어올릴 수 없다.
    """
    from app.api.recommendations import load_labeled_docs

    profile, names, labels, idf = await preference.load_profile(db, user_id)
    if not profile.active:
        return None
    pool = await _pool(db, skin_type, limit * PERSONAL_POOL_FACTOR // 4 or limit, category)
    if not pool:
        return None
    docs, labels2, names2, _pos = await load_labeled_docs(db, [p.id for p, _ in pool])
    labels = {**labels, **labels2}
    names = {**names, **names2}
    raw = {p.id: preference.score(profile, docs.get(p.id, []), labels, idf) for p, _ in pool}
    personal = preference.normalize_pool(raw)
    blended = [(p, (1 - preference.BLEND) * s + preference.BLEND * personal[p.id]) for p, s in pool]
    picked = _diversify(blended, limit)
    out: list[tuple[Product, str | None]] = []
    for p in picked:
        likes, _dis = preference.explain(profile, docs.get(p.id, []), labels, idf)
        out.append((p, _reason_text([names[i] for i in likes if i in names][:2])))
    return out


@router.get("/main", response_model=ProductListOut, summary="홈 큐레이션")
async def main_recommendations(
    response: Response,
    skin_type: str | None = Query(default=None, alias="skinType"),
    size: int = Query(default=8, ge=1, le=40),
    user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
) -> ProductListOut:
    """로그인하면 프로필의 피부타입으로, 아니면 인기순으로.

    `skinType`을 직접 넘길 수도 있다 — 비회원이 진단만 하고 가입하지 않은
    경우가 그렇다(Soft-gate).
    """
    effective = skin_type
    if effective is None and user is not None and user.profile:
        effective = user.profile.skin_type

    # 취향이 켜진 로그인 사용자는 개인 추천(5분 캐시, 키에 취향 신호 해시를 넣어 후기·찜이 바뀌면 바로 갱신).
    if user is not None and settings.PERSONAL_AI_ENABLED:
        signals = preference.combine_signals(await preference.load_signals(db, user.id))
        sig_hash = hashlib.md5(",".join(f"{k}:{v.weight:.2f}" for k, v in sorted(signals.items())).encode()).hexdigest()[:10]
        pkey = f"reco:main:u:{user.id}:{effective or 'any'}:{size}:{sig_hash}"
        pcached = await cache_get(pkey)
        if pcached:
            response.headers["X-Cache"] = "HIT-PERSONAL"
            return ProductListOut.model_validate_json(pcached)
        mine = await personalized_pick(db, user.id, effective, size)
        if mine is not None:
            items = [_to_out(p).model_copy(update={"personal_reason": why}) for p, why in mine]
            out = ProductListOut(items=items, total=len(items), page=1, size=size)
            await cache_set(pkey, out.model_dump_json(by_alias=True), PERSONAL_CACHE_TTL)
            response.headers["X-Cache"] = "MISS-PERSONAL"
            return out

    # 캐시 키에 계정을 넣지 않는다. 같은 피부타입이면 결과가 같기 때문이고,
    # 계정별로 캐시하면 적중률이 사실상 0이 된다.
    key = f"reco:main:{effective or 'any'}:{size}"
    cached = await cache_get(key)
    if cached:
        response.headers["X-Cache"] = "HIT"
        return ProductListOut.model_validate_json(cached)

    picked = await _pick(db, effective, size)
    out = ProductListOut(
        items=[_to_out(p) for p in picked], total=len(picked), page=1, size=size
    )
    await cache_set(key, out.model_dump_json(by_alias=True), CACHE_TTL)
    response.headers["X-Cache"] = "MISS"
    return out


@router.get("/set", response_model=list[ProductOut], summary="피부타입 맞춤 세트")
async def recommendation_set(
    response: Response,
    skin_type: str | None = Query(default=None, alias="skinType"),
    user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
) -> list[ProductOut]:
    """서로 다른 카테고리에서 하나씩.

    한 카테고리에서 여러 개를 고르면 '세트'가 아니라 '토너 3종'이 된다.
    카테고리가 4개뿐이라 최대 4건이고, 해당 카테고리에 맞는 제품이 없으면
    그 자리는 비운다 — 억지로 채우지 않는다.

    `/main`처럼 피부타입별로 캐시한다. 카테고리마다 쿼리를 순서대로 돌아
    홈에 들어올 때마다 1초 넘게 걸렸다. 버전 키를 넣어 제품 적재가 끝나면
    새로 계산되게 한다.
    """
    effective = skin_type
    if effective is None and user is not None and user.profile:
        effective = user.profile.skin_type

    key = f"reco:set:v{await get_cache_version()}:{effective or 'any'}"
    cached = await cache_get(key)
    if cached:
        response.headers["X-Cache"] = "HIT"
        return _SET_ADAPTER.validate_json(cached)

    items: list[ProductOut] = []
    for category in SET_CATEGORIES:
        picked = await _pick(db, effective, 1, category=category)
        if picked:
            items.append(_to_out(picked[0]))
        if len(items) == 3:
            break
    await cache_set(key, _SET_ADAPTER.dump_json(items, by_alias=True).decode(), CACHE_TTL)
    response.headers["X-Cache"] = "MISS"
    return items


@router.post("/budget", response_model=BudgetGuideOut, summary="예산 구매 가이드")
async def budget_guide(
    body: BudgetGuideIn,
    response: Response,
    user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
) -> BudgetGuideOut:
    """예산 범위 안에서 토너·에센스·크림·선크림 루틴 1~3안 (Task 15).

    피부타입은 `/set`과 같다 — 요청에 없으면 로그인 사용자의 프로필.
    조합이 하나도 없으면(예산 부족) `combinations`가 비고 `minPossibleTotal`이
    이 루틴의 최저 합계를 알려 준다. 엔진은 `services/budget_guide.py`.

    POST인 이유: 명세의 경로·메서드를 따랐고, 보유품 id 목록이 쿼리스트링에
    담기기엔 길다. 그래도 결과는 요청 내용으로만 정해지므로 캐시한다.
    """
    effective = body.skin_type
    if effective is None and user is not None and user.profile:
        effective = user.profile.skin_type

    normalized = body.model_copy(
        update={"skin_type": effective, "exclude_product_ids": sorted(set(body.exclude_product_ids))}
    )
    digest = hashlib.sha1(normalized.model_dump_json().encode()).hexdigest()[:16]
    key = f"reco:budget:f{BUDGET_FORMAT}:v{await get_cache_version()}:{digest}"
    cached = await cache_get(key)
    if cached:
        response.headers["X-Cache"] = "HIT"
        return BudgetGuideOut.model_validate_json(cached)

    out = await build_guide(db, normalized, effective)
    await cache_set(key, out.model_dump_json(by_alias=True), BUDGET_CACHE_TTL)
    response.headers["X-Cache"] = "MISS"
    return out
