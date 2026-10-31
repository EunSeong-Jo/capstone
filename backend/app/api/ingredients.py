"""성분 사전 API (검색 > 성분검색 > 성분 사전).

    GET /api/v1/ingredients/categories   분류(보습·진정… / 알레르기·자극…)와 성분 수
    GET /api/v1/ingredients              분류·이름·id로 성분 목록

데이터는 새로 만들지 않는다 — 이미 있는 성분 마스터(`ingredients`)·기능 라벨
(`ingredient_functions`)·설명(`ingredient_descriptions`)을 묶어 보여 줄 뿐이다.

사전에 올리는 성분
    제품에 실제로 쓰이는 성분 중 **설명이 있거나 기능 라벨이 있는 것**(오염 라벨 j 제외).
    라벨도 설명도 없는 성분은 "준비 중"만 보여 줄 수 있어 목록에는 올리지 않는다.
    다만 이름으로 직접 찾으면(`q`) 라벨 없는 성분도 나온다 — 찾는 사람이 있으니 답은 줘야 한다.

분류는 `ingredient_functions`의 값 그대로다(`docs/db-schema.md`). 새로 지은 기준이 아니라서
전성분 칩·궁합 카드와 어긋나지 않는다. 확신도 1(검수 대상)인 라벨은 분류 근거에서 뺀다.
"""
from __future__ import annotations

from dataclasses import dataclass

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.products import _INGREDIENT_COLLOQUIAL
from app.core.cache import cache_get, cache_set, get_cache_version
from app.db.session import get_db
from app.models.product import (
    Ingredient,
    IngredientAlias,
    IngredientDescription,
    IngredientFunction,
    Product,
    ProductIngredient,
)
from app.schemas.ingredient_dict import (
    IngredientCategoryListOut,
    IngredientCategoryOut,
    IngredientDictItemOut,
    IngredientDictListOut,
)
from app.services.skin_fit import build_flags, classify_ingredient

router = APIRouter(prefix="/api/v1/ingredients", tags=["ingredients"])

MAX_SIZE = 50
MAX_IDS = 100
CACHE_TTL = 3600
MIN_CONFIDENCE = 2   # 확신도 1은 분류 근거로 쓰지 않는다


@dataclass(frozen=True)
class Category:
    id: str
    label: str
    emoji: str
    group: str
    blurb: str
    kind: str   # 'func' | 'flag' | 'allergen'
    code: str = ""


CATEGORIES: tuple[Category, ...] = (
    Category("moisture", "보습", "💧", "function", "수분을 채우고 잡아 줘요", "func", "H"),
    Category("barrier", "장벽", "🧱", "function", "피부 보호막을 튼튼하게 해요", "func", "B"),
    Category("soothing", "진정", "🌿", "function", "붉고 예민한 피부를 달래요", "func", "S"),
    Category("whitening", "미백", "✨", "function", "칙칙함과 잡티를 케어해요", "func", "W"),
    Category("antiwrinkle", "주름·탄력", "🌀", "function", "탄력을 가꾸고 주름을 완화해요", "func", "A"),
    Category("antioxidant", "항산화", "🍊", "function", "산화 스트레스로부터 지켜요", "func", "O"),
    Category("sebum", "피지·모공", "🫧", "function", "번들거림과 모공을 관리해요", "func", "P"),
    Category("exfoliation", "각질", "🧽", "function", "묵은 각질을 정돈해요", "func", "E"),
    Category("uv", "자외선 차단", "🛡️", "function", "자외선을 막아 줘요", "func", "U"),
    Category("allergen", "알레르기 유발 주의", "💥", "caution", "식약처가 표시를 의무화한 착향제 성분이에요", "allergen"),
    Category("irritant", "자극 소지", "⚠️", "caution", "민감한 피부에는 자극이 될 수 있어요", "flag", "I"),
    Category("fragrance", "향료", "🌸", "caution", "향을 내는 성분이에요", "flag", "F"),
    Category("alcohol", "건조 알코올", "🍶", "caution", "피부를 건조하게 할 수 있는 알코올이에요", "flag", "L"),
)
_BY_ID = {c.id: c for c in CATEGORIES}


def _in_category(c: Category):
    """분류 조건. 라벨 테이블(IngredientFunction)이 조인돼 있어야 한다."""
    F = IngredientFunction
    if c.kind == "allergen":
        return F.allergen_listed.is_(True)
    base = and_(F.role != "j", F.confidence >= MIN_CONFIDENCE)
    if c.kind == "func":
        return and_(base, F.functions.any(c.code))
    return and_(base, F.flags.any(c.code))


def _usage():
    """성분 → 그 성분이 든 판매 중 제품 수."""
    return (
        select(
            ProductIngredient.ingredient_id.label("ingredient_id"),
            func.count(func.distinct(ProductIngredient.product_id)).label("n"),
        )
        .join(Product, Product.id == ProductIngredient.product_id)
        .where(Product.status == "active")
        .group_by(ProductIngredient.ingredient_id)
        .subquery()
    )


def _joined(usage):
    """성분 + 사용 제품 수 + 라벨 + 설명. 제품에 안 쓰이는 성분은 INNER JOIN으로 빠진다."""
    return (
        select(
            Ingredient,
            IngredientFunction,
            IngredientDescription,
            usage.c.n,
        )
        .join(usage, usage.c.ingredient_id == Ingredient.id)
        .outerjoin(IngredientFunction, IngredientFunction.ingredient_id == Ingredient.id)
        .outerjoin(IngredientDescription, IngredientDescription.ingredient_id == Ingredient.id)
    )


def _in_dictionary():
    """사전에 올리는 성분: 설명이 있거나, 오염이 아닌 기능 라벨이 있다."""
    return or_(
        IngredientDescription.ingredient_id.is_not(None),
        and_(IngredientFunction.ingredient_id.is_not(None), IngredientFunction.role != "j"),
    )


def _item(ing: Ingredient, fn: IngredientFunction | None, desc: IngredientDescription | None, n: int) -> IngredientDictItemOut:
    label = (
        (
            "".join(fn.functions or []),
            fn.role,
            build_flags("".join(fn.flags or []), bool(fn.allergen_listed), ing.norm_name),
            fn.confidence,
        )
        if fn is not None
        else None
    )
    return IngredientDictItemOut(
        id=ing.id,
        name=ing.name_ko,
        name_en=ing.name_en,
        functions=list(fn.functions or []) if fn else [],
        role=fn.role if fn else None,
        flags=list(fn.flags or []) if fn else [],
        confidence=fn.confidence if fn else None,
        is_allergen=bool(fn.allergen_listed) if fn else False,
        grade=classify_ingredient(label, None),
        description=desc.description if desc else None,
        keywords=list(desc.keywords or []) if desc else [],
        description_source=desc.source if desc else None,
        product_count=int(n or 0),
    )


@router.get("/categories", response_model=IngredientCategoryListOut, summary="성분 사전 분류")
async def list_categories(
    response: Response, db: AsyncSession = Depends(get_db)
) -> IngredientCategoryListOut | Response:
    """분류별 성분 수. 제품 적재가 끝나야 바뀌므로 products 캐시 버전을 따른다."""
    key = f"ingdict:v{await get_cache_version()}:categories"
    cached = await cache_get(key)
    if cached is not None:
        return Response(content=cached, media_type="application/json", headers={"X-Cache": "HIT"})

    usage = _usage()
    counts = [
        func.count(func.distinct(Ingredient.id)).filter(_in_category(c)).label(c.id) for c in CATEGORIES
    ]
    row = (
        await db.execute(
            select(*counts)
            .select_from(Ingredient)
            .join(usage, usage.c.ingredient_id == Ingredient.id)
            .join(IngredientFunction, IngredientFunction.ingredient_id == Ingredient.id)
        )
    ).one()
    out = IngredientCategoryListOut(
        items=[
            IngredientCategoryOut(
                id=c.id, label=c.label, emoji=c.emoji, group=c.group, blurb=c.blurb, count=int(getattr(row, c.id))
            )
            for c in CATEGORIES
        ]
    )
    await cache_set(key, out.model_dump_json(by_alias=True), CACHE_TTL)
    response.headers["X-Cache"] = "MISS"
    return out


@router.get("", response_model=IngredientDictListOut, summary="성분 사전 목록")
async def list_ingredients(
    response: Response,
    db: AsyncSession = Depends(get_db),
    category: str | None = Query(None, description="분류 id (`/categories`)"),
    q: str | None = Query(None, min_length=1, max_length=50, description="성분 이름(한글·INCI·구명칭 부분일치)"),
    ids: str | None = Query(None, description="성분 id를 쉼표로(최대 100). 주면 다른 조건은 무시한다 — 마이 성분용"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=MAX_SIZE),
) -> IngredientDictListOut | Response:
    """설명이 있는 성분이 먼저, 그다음 많이 쓰이는 순(제품 수), 이름순.

    `ids`는 `category`·`q`보다 우선한다. 사전에 올리지 않는 성분(라벨·설명 없음)도 id로는 준다.
    """
    id_list: list[int] | None = None
    if ids is not None:
        try:
            id_list = [int(x) for x in ids.split(",") if x.strip()][:MAX_IDS]
        except ValueError:
            id_list = []
    cat = _BY_ID.get(category) if category else None
    if category and cat is None:
        return IngredientDictListOut(items=[], total=0, page=page, size=size)

    term = None
    if q and id_list is None:
        term = _INGREDIENT_COLLOQUIAL.get(q.strip(), q.strip())

    key = f"ingdict:v{await get_cache_version()}:list:{category or '-'}:{term or '-'}:{','.join(map(str, id_list)) if id_list is not None else '-'}:{page}:{size}"
    cached = await cache_get(key)
    if cached is not None:
        return Response(content=cached, media_type="application/json", headers={"X-Cache": "HIT"})

    usage = _usage()
    stmt = _joined(usage)
    if id_list is not None:
        stmt = stmt.where(Ingredient.id.in_(id_list or [0]))
    else:
        if cat is not None:
            stmt = stmt.where(_in_category(cat))
        else:
            if term is None:
                stmt = stmt.where(_in_dictionary())
        if term is not None:
            esc = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            pat = f"%{esc}%"
            alias_hit = select(IngredientAlias.ingredient_id).where(IngredientAlias.alias.ilike(pat, escape="\\"))
            stmt = stmt.where(
                or_(
                    Ingredient.name_ko.ilike(pat, escape="\\"),
                    Ingredient.name_en.ilike(pat, escape="\\"),
                    Ingredient.id.in_(alias_hit),
                )
            )

    total = int(await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0)
    has_desc = case((IngredientDescription.ingredient_id.is_not(None), 0), else_=1)
    rows = (
        await db.execute(
            stmt.order_by(has_desc, usage.c.n.desc(), Ingredient.name_ko, Ingredient.id)
            .limit(size)
            .offset((page - 1) * size)
        )
    ).all()
    out = IngredientDictListOut(
        items=[_item(ing, fn, desc, n) for ing, fn, desc, n in rows], total=total, page=page, size=size
    )
    await cache_set(key, out.model_dump_json(by_alias=True), CACHE_TTL)
    response.headers["X-Cache"] = "MISS"
    return out
