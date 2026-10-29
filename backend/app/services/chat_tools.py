"""챗봇 도구 — 모델이 우리 계산 엔진을 불러 쓰게 한다 (퍼스널 AI 2단계).

원칙
----
- **사실은 도구 결과에서만 나온다.** 제품·가격·점수·유사도는 기존 서비스가 계산하고, 모델은 그 결과를 문장으로 옮긴다.
- **읽기만 실행한다.** 장바구니·화장대 담기는 `propose_*`가 *제안*만 반환하고(`Actions`에 쌓임), 실제 담기는
  사용자가 화면의 [담기] 버튼을 눌러 기존 API(`POST /me/cart`·`/me/closet`)를 부를 때 일어난다.
- 도구 결과는 카드로 화면에 함께 내려가도록 `ToolContext.cards`에도 모은다(모델이 말한 제품을 눌러 볼 수 있게).
- 도구 인자는 모델이 만든 값이라 믿지 않는다: 숫자는 범위로 자르고, 제품은 id가 실제로 있는지 확인한다.

이 모듈은 DB 세션과 사용자 맥락(`ToolContext`)만 받는다. 라우터(`api/chat.py`)가 만들어 넘긴다.
"""
from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field

import structlog
from fastapi import HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.product import Product
from app.models.recommendation import ProductSkinFit
from app.schemas.budget_guide import MAX_BUDGET, BudgetGuideIn
from app.services import personal_context, rag
from app.services.skin_fit import PREFER

log = structlog.get_logger()

MAX_RESULTS = 5
MAX_CARDS = 8


@dataclass
class ToolContext:
    db: AsyncSession
    skin_type: str | None
    snapshot: personal_context.PersonalSnapshot | None
    user_id: uuid.UUID | None = None
    # 응답에 실어 보낼 제품 카드(중복 제거)와 "담을까요?" 제안
    cards: list[dict] = field(default_factory=list)
    actions: list[dict] = field(default_factory=list)

    def add_card(self, card: dict) -> None:
        if len(self.cards) < MAX_CARDS and all(c["id"] != card["id"] for c in self.cards):
            self.cards.append(card)

    def add_action(self, action: dict) -> None:
        if all((a["type"], a["productId"]) != (action["type"], action["productId"]) for a in self.actions):
            self.actions.append(action)


# ── 도구 정의 (모델에게 보이는 이름·설명·스키마) ───────────────────────────────

_PID = {"type": "integer", "description": "제품 id. find_products·내 화장대 목록의 #id에서 얻는다"}

TOOLS: list[dict] = [
    {
        "name": "find_products",
        "description": "제품명·브랜드·성분 키워드로 제품을 찾는다. 로그인 사용자는 내 피부 궁합이 높은 순. 제품 id를 얻을 때 쓴다.",
        "parameters": {"type": "object", "properties": {"query": {"type": "string", "description": "검색어(예: 토너, 나이아신아마이드, 에스트라 크림)"}}, "required": ["query"]},
    },
    {
        "name": "find_alternatives",
        "description": "한 제품과 성분이 비슷한 대체품을 찾는다(내 피부에 맞는 것 우선). 쓰던 제품보다 싼 대체품인지 알려 준다.",
        "parameters": {"type": "object", "properties": {"product_id": _PID, "cheaper_only": {"type": "boolean", "description": "true면 쓰던 제품보다 싼 것만"}}, "required": ["product_id"]},
    },
    {
        "name": "check_skin_fit",
        "description": "한 제품이 내 피부타입에 맞는지(궁합 점수와 이유)를 본다.",
        "parameters": {"type": "object", "properties": {"product_id": _PID}, "required": ["product_id"]},
    },
    {
        "name": "build_routine",
        "description": "예산 안에서 토너·에센스·크림·선크림 루틴 조합(알뜰·균형·여유)을 짠다. 화장대에 이미 있는 제품은 뺀다.",
        "parameters": {
            "type": "object",
            "properties": {
                "budget_min": {"type": "integer", "description": "최소 예산(원). 모르면 0"},
                "budget_max": {"type": "integer", "description": "최대 예산(원)"},
                "fragrance_free": {"type": "boolean", "description": "무향 제품만"},
                "alcohol_free": {"type": "boolean", "description": "무알코올 제품만"},
            },
            "required": ["budget_max"],
        },
    },
    {
        "name": "recommend_for_me",
        "description": "내 성분 취향(후기·찜·재구매·화장대에서 배운 것)과 피부타입을 함께 반영해 제품을 추천한다. '나한테 맞는 거 추천해줘'에 쓴다. 취향이 아직 없으면 피부타입 기준으로 고른다.",
        "parameters": {"type": "object", "properties": {"category": {"type": "string", "enum": ["스킨케어", "선케어", "마스크팩", "클렌징"], "description": "원하는 종류. 비우면 전체"}}},
    },
    {
        "name": "get_skin_report",
        "description": "내 최근 사진 분석의 변화(좋아진 항목·신경 쓸 항목)와 그 사이 화장대에 더한 제품을 본다. '피부가 좋아졌어?', '지난번이랑 비교해 줘'에 쓴다. 변화의 원인을 단정하지 말고 '영향이 있었을 수 있어요' 정도로 말한다.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "get_today_briefing",
        "description": "오늘 날씨와 내 약한 피부 항목, 내 화장대를 보고 오늘 먼저 쓸 제품을 알려 주는 개인 브리핑. '오늘 뭐 바르면 좋아?', '오늘 피부 관리 어떻게 해?'에 쓴다.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "propose_add_to_cart",
        "description": "제품을 장바구니에 담자고 *제안*한다. 실제로 담기지 않고, 사용자가 화면에서 [담기]를 눌러야 담긴다. 사용자가 담아 달라고 했을 때만 쓴다.",
        "parameters": {"type": "object", "properties": {"product_id": _PID}, "required": ["product_id"]},
    },
    {
        "name": "propose_add_to_closet",
        "description": "제품을 내 화장대에 담자고 *제안*한다. 실제로 담기지 않고, 사용자가 [담기]를 눌러야 담긴다. 사용자가 쓰는 제품이라고 알려 줬을 때만 쓴다.",
        "parameters": {"type": "object", "properties": {"product_id": _PID}, "required": ["product_id"]},
    },
]


# ── 변환 헬퍼 ─────────────────────────────────────────────────────────────


def _card(p: Product, fit: int | None = None) -> dict:
    return {
        "id": p.id,
        "name": p.display_name or p.name,
        "brand": p.brand.name if p.brand else "",
        "category": (p.category.label or p.category.code) if p.category else "",
        "price": int(p.price or 0),
        "imageUrl": p.image_url,
        "rating": float(p.rating) if p.rating is not None else None,
        "fitScore": fit,
    }


def _clamp(value, lo: int, hi: int, default: int) -> int:
    try:
        n = int(value)
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, n))


def _as_bool(value) -> bool:
    return value is True or (isinstance(value, str) and value.strip().lower() in ("true", "1", "yes"))


async def _product(ctx: ToolContext, product_id) -> Product | None:
    try:
        pid = int(product_id)
    except (TypeError, ValueError):
        return None
    return await ctx.db.scalar(
        select(Product).where(Product.id == pid).options(joinedload(Product.brand), joinedload(Product.category))
    )


async def _fit_scores(ctx: ToolContext, ids: list[int]) -> dict[int, int | None]:
    if not ctx.skin_type or ctx.skin_type not in PREFER or not ids:
        return {}
    rows = await ctx.db.execute(
        select(ProductSkinFit.product_id, ProductSkinFit.score).where(
            ProductSkinFit.skin_type == ctx.skin_type, ProductSkinFit.product_id.in_(ids)
        )
    )
    return {pid: score for pid, score in rows.all()}


# ── 도구 구현 ─────────────────────────────────────────────────────────────


async def find_products(ctx: ToolContext, args: dict) -> dict:
    query = str(args.get("query") or "").strip()[:60]
    if not query:
        return {"error": "검색어가 필요해요"}
    items = await rag.search_products(ctx.db, query, ctx.skin_type, top_k=MAX_RESULTS, prefer_fit=ctx.snapshot is not None)
    ids = [i["id"] for i in items]
    if ids:
        products = (
            await ctx.db.scalars(
                select(Product).where(Product.id.in_(ids)).options(joinedload(Product.brand), joinedload(Product.category))
            )
        ).unique().all()
        by_id = {p.id: p for p in products}
        fits = await _fit_scores(ctx, ids)
        for i in ids:
            if i in by_id:
                ctx.add_card(_card(by_id[i], fits.get(i)))
    return {
        "products": [
            {"id": i["id"], "name": i["name"], "brand": i["brand"], "price": i["price"], "category": i["category"],
             "ingredients": i["ingredients"], "rating": i["rating"]}
            for i in items
        ]
    }


async def find_alternatives(ctx: ToolContext, args: dict) -> dict:
    # 순환 import를 피하려고 지금 가져온다(api 계층이 services를 읽는다)
    from app.api import recommendations as reco

    seed = await _product(ctx, args.get("product_id"))
    if seed is None:
        return {"error": "그 제품을 찾을 수 없어요"}
    cheaper_only = _as_bool(args.get("cheaper_only"))
    try:
        out = await reco.list_similar(
            response=Response(), product_id=seed.id, method=reco.Method.hybrid, limit=10,
            skin_type=ctx.skin_type if ctx.skin_type in PREFER else None,
            fit_for=ctx.skin_type if ctx.skin_type in PREFER else None, db=ctx.db,
        )
    except HTTPException:
        return {"error": "그 제품을 찾을 수 없어요"}
    price = int(seed.price or 0)
    rows = []
    for it in out.items:
        if cheaper_only and it.price >= price:
            continue
        rows.append(it)
        if len(rows) >= MAX_RESULTS:
            break
    ids = [r.id for r in rows]
    if ids:
        products = (
            await ctx.db.scalars(
                select(Product).where(Product.id.in_(ids)).options(joinedload(Product.brand), joinedload(Product.category))
            )
        ).unique().all()
        by_id = {p.id: p for p in products}
        for r in rows:
            if r.id in by_id:
                ctx.add_card(_card(by_id[r.id], r.skin_fit_score))
    return {
        "seed": {"id": seed.id, "name": seed.display_name or seed.name, "price": price},
        "alternatives": [
            {
                "id": r.id, "name": r.name, "brand": r.brand, "price": r.price,
                "price_difference": r.price - price,        # 음수면 쓰던 제품보다 쌈
                "ingredient_similarity_percent": round(r.score * 100),
                "shared_functions": r.shared_functions, "shared_ingredients": r.shared_ingredients[:4],
                "skin_fit_score": r.skin_fit_score, "skin_fit_verdict": r.skin_match,
            }
            for r in rows
        ],
    }


async def check_skin_fit(ctx: ToolContext, args: dict) -> dict:
    from app.api import skin_fit as sf

    if not ctx.skin_type or ctx.skin_type not in PREFER:
        return {"error": "아직 피부타입 진단 결과가 없어서 궁합을 볼 수 없어요. 진단을 먼저 해 보도록 안내해 주세요"}
    p = await _product(ctx, args.get("product_id"))
    if p is None:
        return {"error": "그 제품을 찾을 수 없어요"}
    try:
        fit = await sf.read_skin_fit(response=Response(), product_id=p.id, skin_type=ctx.skin_type, db=ctx.db)
    except HTTPException:
        return {"error": "그 제품을 찾을 수 없어요"}
    ctx.add_card(_card(p, fit.score))
    return {
        "product": {"id": p.id, "name": p.display_name or p.name},
        "verdict": fit.verdict, "score": fit.score,
        "reasons": [r.text for r in fit.reasons[:4]],
    }


async def build_routine(ctx: ToolContext, args: dict) -> dict:
    from app.services.budget_guide import build_guide

    hi = _clamp(args.get("budget_max"), 0, MAX_BUDGET, 0)
    lo = _clamp(args.get("budget_min"), 0, hi, 0)
    if hi <= 0:
        return {"error": "예산(최대 금액)이 필요해요"}
    owned = [e.id for e in ctx.snapshot.closet] if ctx.snapshot else []
    req = BudgetGuideIn(
        budget_min=lo, budget_max=hi,
        skin_type=ctx.skin_type if ctx.skin_type in PREFER else None,
        fragrance_free=_as_bool(args.get("fragrance_free")), alcohol_free=_as_bool(args.get("alcohol_free")),
        exclude_product_ids=owned[:200],
    )
    out = await build_guide(ctx.db, req, req.skin_type)
    combos = []
    for c in out.combinations:
        items = []
        for it in c.items:
            pr = it.product
            items.append({"step": it.step_label, "id": pr.id, "name": pr.name, "brand": pr.brand, "price": pr.price})
            ctx.add_card({
                "id": pr.id, "name": pr.name, "brand": pr.brand, "category": it.step_label, "price": pr.price,
                "imageUrl": pr.image_url, "rating": pr.rating, "fitScore": None,
            })
        combos.append({"label": c.label, "total": c.total, "remaining": c.remaining, "items": items, "reason": c.reason})
    return {
        "budget": [lo, hi], "combinations": combos,
        "missing_steps": out.missing_steps, "min_possible_total_for_full_routine": out.min_possible_total,
    }


async def recommend_for_me(ctx: ToolContext, args: dict) -> dict:
    from app.api import recommendations_main as rm

    category = args.get("category") if args.get("category") in rm.SET_CATEGORIES else None
    skin = ctx.skin_type if ctx.skin_type in PREFER else None
    mine = await rm.personalized_pick(ctx.db, ctx.user_id, skin, 4, category) if ctx.user_id else None
    personalized = mine is not None
    if mine is None:
        mine = [(p, None) for p in await rm._pick(ctx.db, skin, 4, category)]
    fits = await _fit_scores(ctx, [p.id for p, _ in mine])
    for p, _why in mine:
        ctx.add_card(_card(p, fits.get(p.id)))
    return {
        "personalized": personalized,
        "note": None if personalized else "내 취향이 아직 쌓이지 않아(후기·찜이 적어요) 피부타입 기준으로 골랐어요",
        "products": [
            {"id": p.id, "name": p.display_name or p.name, "brand": p.brand.name if p.brand else "", "price": int(p.price or 0),
             "reason": why, "skin_fit_score": fits.get(p.id)}
            for p, why in mine
        ],
    }


async def get_skin_report(ctx: ToolContext, args: dict) -> dict:
    from app.services import skin_report

    if ctx.user_id is None:
        return {"error": "로그인이 필요해요"}
    r = await skin_report.build_report(ctx.db, ctx.user_id)
    if not r.enough:
        return {"enough": False, "message": r.message}
    return {
        "enough": True,
        "compared": [r.before_at.date().isoformat(), r.after_at.date().isoformat()],
        "changes": [{"item": c.name, "before": c.before, "after": c.after, "delta": c.delta, "trend": c.trend} for c in r.changes],
        "notes": r.notes,
        "since_first": r.first_notes,
        "caution": "점수는 높을수록 좋아요. 화장품이 원인이라고 단정하지 마세요.",
    }


async def get_today_briefing(ctx: ToolContext, args: dict) -> dict:
    from app.api.insights import build_briefing_out

    if ctx.user_id is None:
        return {"error": "로그인이 필요해요"}
    b = await build_briefing_out(ctx.db, ctx.user_id, list(ctx.snapshot.my_ingredients) if ctx.snapshot else [])
    if b.pick:
        row = next((e for e in (ctx.snapshot.closet if ctx.snapshot else ()) if e.id == b.pick.id), None)
        if row is not None:
            ctx.add_card({"id": row.id, "name": row.name, "brand": row.brand, "category": row.category, "price": row.price or 0,
                          "imageUrl": None, "rating": None, "fitScore": None})
    return b.model_dump(by_alias=False)


async def _propose(ctx: ToolContext, args: dict, kind: str, verb: str) -> dict:
    p = await _product(ctx, args.get("product_id"))
    if p is None:
        return {"error": "그 제품을 찾을 수 없어요"}
    ctx.add_card(_card(p))
    ctx.add_action({"type": kind, "productId": p.id, "label": f"{p.display_name or p.name}을(를) {verb}"})
    return {"proposed": True, "note": "아직 담기지 않았어요. 사용자가 화면의 [담기] 버튼을 눌러야 담겨요. 답변에서 '담았어요'라고 말하지 말고 '담을까요?'라고 물어보세요."}


async def propose_add_to_cart(ctx: ToolContext, args: dict) -> dict:
    return await _propose(ctx, args, "add_to_cart", "장바구니에 담을까요?")


async def propose_add_to_closet(ctx: ToolContext, args: dict) -> dict:
    return await _propose(ctx, args, "add_to_closet", "화장대에 담을까요?")


_HANDLERS = {
    "find_products": find_products,
    "find_alternatives": find_alternatives,
    "check_skin_fit": check_skin_fit,
    "build_routine": build_routine,
    "recommend_for_me": recommend_for_me,
    "get_skin_report": get_skin_report,
    "get_today_briefing": get_today_briefing,
    "propose_add_to_cart": propose_add_to_cart,
    "propose_add_to_closet": propose_add_to_closet,
}
TOOL_NAMES = frozenset(_HANDLERS)


def make_runner(ctx: ToolContext):
    """`llm.chat_with_tools`에 넘길 실행기. 모르는 도구는 오류 결과로 돌려준다(모델이 이름을 지어낼 수 있다)."""

    async def run(name: str, args: dict) -> dict:
        handler = _HANDLERS.get(name)
        if handler is None:
            return {"error": f"알 수 없는 도구: {name}"}
        log.info("chat_tool", tool=name)
        return await handler(ctx, args if isinstance(args, dict) else {})

    return run


# ── 폴백(모델 없이): 예산 루틴 질문 ──────────────────────────────────────────

_WON_RE = re.compile(r"(\d+(?:\.\d+)?)\s*만\s*원?|(\d{1,3}(?:,\d{3})+|\d{4,7})\s*원")
_ROUTINE_WORDS = ("루틴", "예산", "구성", "세트", "짜줘", "짜 줘")


def parse_budget(text: str) -> int | None:
    """'7만원', '5.5만원', '70,000원'에서 금액(원). 여러 개면 가장 큰 값을 최대 예산으로 본다."""
    found: list[int] = []
    for m in _WON_RE.finditer(text):
        if m.group(1):
            found.append(int(float(m.group(1)) * 10_000))
        else:
            found.append(int(m.group(2).replace(",", "")))
    found = [n for n in found if 10_000 <= n <= MAX_BUDGET]
    return max(found) if found else None


def wants_routine(text: str) -> bool:
    return parse_budget(text) is not None and any(w in text for w in _ROUTINE_WORDS)


def wants_cart(text: str) -> bool:
    return "장바구니" in text and any(w in text for w in ("담아", "넣어", "담기"))


def routine_reply(result: dict, ask_cart: bool) -> str:
    """`build_routine` 결과를 모델 없이 문장으로."""
    nums = ["1️⃣", "2️⃣", "3️⃣"]
    if result.get("error"):
        return result["error"]
    combos = result.get("combinations") or []
    lo, hi = result["budget"]
    if not combos:
        need = result.get("min_possible_total_for_full_routine")
        tail = f" 전체 루틴은 최소 {need:,}원이 필요해요." if need else ""
        return f"{hi:,}원으로는 맞는 조합을 찾지 못했어요.{tail}"
    lines = [f"**{hi:,}원** 안에서 내 피부에 맞춰 짠 루틴이에요."]
    for i, c in enumerate(combos[:3]):
        lines.append(f"\n{nums[i]} **{c['label']}안** — 합계 {c['total']:,}원")
        for it in c["items"]:
            lines.append(f"{it['step']}: {it['name']} ({it['price']:,}원)")
    if result.get("missing_steps"):
        lines.append(f"\n예산이 모자라 {', '.join(result['missing_steps'])} 단계는 뺐어요.")
    lines.append("\n아래 카드에서 마음에 드는 제품을 눌러 장바구니에 담을 수 있어요." if ask_cart else "\n마음에 드는 제품을 누르면 자세히 볼 수 있어요.")
    return "\n".join(lines)
