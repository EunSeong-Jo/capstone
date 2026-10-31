"""챗봇 폴백 — LLM 키가 막혔을 때 DB로만 답한다.

모델을 쓰지 않는다. 질문 유형을 규칙(키워드)으로 가르고, 이미 있는 데이터(성분 설명·기능 라벨·
제품 RAG·유사도·피부 궁합)를 정해진 문장 틀에 채운다. 그래서 환각이 없고 비용은 평소 챗봇의
RAG 조회 수준이다. 데이터에 없으면 없다고 말한다.

형식은 챗봇 프롬프트(api/chat.py)와 같다: `**굵게**`만 쓰고 제품은 `1️⃣ **제품명**` 목록.
"""
from __future__ import annotations

import hashlib

import structlog
from sqlalchemy import Integer, func, literal, or_, select
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cache_get, cache_set, get_cache_version
from app.models.product import (
    Brand,
    Ingredient,
    IngredientDescription,
    IngredientFunction,
    Product,
    ProductIngredient,
)
from app.models.recommendation import ProductSkinFit, Similarity
from app.services import personal_context, rag
from app.services.similarity import FUNC_NAMES
from app.services.skin_type import apply_exclusions, load_rule

log = structlog.get_logger()

CACHE_TTL = 60 * 60
# 같은 문장이 되풀이될 때 분류·검색(DB 쿼리 여러 개)까지 건너뛰는 짧은 캐시. 키가 불어나지 않게 TTL을 짧게 둔다.
MSG_CACHE_TTL = 60 * 10
_NUM = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"]
NOTICE = "지금은 AI 답변이 어려워 저장된 정보로 안내해 드려요."
_FLAG_TEXT = {"I": "자극 소지", "F": "향료", "L": "건조 알코올"}

_RECOMMEND = ("추천", "골라", "뭐가 좋", "뭐 쓰", "괜찮은")
_ALTERNATIVE = ("대체", "싼", "저렴", "비슷", "가성비", "갈아타")
# "내 ○○"처럼 사용자 본인의 데이터를 묻는 말. 개인 요약이 있을 때만 쓴다.
_MINE = ("내 화장대", "화장대에", "화장대 ", "내가 쓰는", "쓰는 제품", "내 제품", "내 피부", "내 상태", "나한테", "내 정보", "내 예산")
# "내 ○○" 질문 중에서도 내 요약을 보여 달라는 말(내 화장대에 뭐 있어·내 피부 상태·부족한 게 뭐야 …). 이런 말이 없으면 제품 질문
# ("닥터지 크림 내 피부에 맞아?")이라 일반 폴백이 그 제품으로 답한다 — 제품명을 말했는데 내 요약만 쏟아내면 엉뚱한 답이다.
_MINE_ASK = ("뭐 있", "뭐가 있", "알려", "보여", "상태", "구성", "정보", "예산", "부족", "요약", "정리")
# 화장대 제품을 가리키는 종류 단어(질문에 있으면 화장대에서 그 종류의 제품을 찾는다)
_KIND_WORDS = ("토너", "세럼", "에센스", "앰플", "크림", "로션", "선크림", "선스틱", "마스크", "클렌징", "클렌저", "폼", "오일", "밤", "패드", "미스트")

GUIDE = (
    "아래처럼 물어보시면 답해 드릴 수 있어요.\n"
    "1️⃣ 나이아신아마이드가 뭐야?\n"
    "2️⃣ 진정 성분이 뭐야?\n"
    "3️⃣ 토너 추천해줘\n"
    "4️⃣ (제품명) 성분 알려줘\n"
    "5️⃣ (제품명)보다 싼 대체품 있어?"
)

# ── 모델 없이 답하는 고정 문장: 인사·감사·앱 사용 안내. 프롬프트의 [앱 사용 안내](api/chat.py)와 같은 사실이다.
_GREET = ("안녕", "반가워", "하이", "hello", "hi ")
_THANKS = ("고마워", "고맙", "감사", "땡큐")
_GREET_REPLY = "안녕하세요! 화장품과 성분, 내 피부에 맞는 제품이 궁금하시면 편하게 물어보세요."
_THANKS_REPLY = "도움이 됐다니 다행이에요. 궁금한 게 있으면 언제든 물어보세요."

# (키워드, 답). 위에서부터 처음 맞는 것. 키워드는 질문에 그대로 들어 있어야 한다.
_FAQ: tuple[tuple[tuple[str, ...], str], ...] = (
    (
        ("포인트", "적립"),
        "포인트는 주문 금액의 1%와 후기 작성 100P가 쌓여요. 주문을 취소하거나 반품하면 적립이 회수돼요.\n"
        "내역은 마이페이지 > 포인트에서 볼 수 있어요.",
    ),
    (
        ("배송", "택배", "주문 취소", "주문취소", "반품", "환불", "주문내역", "주문 내역"),
        "배송 일정은 제가 알 수 없어요. 주문 상태와 배송 추적은 마이페이지 > 주문내역에서, "
        "취소·반품·환불은 마이페이지 > 취소/반품/환불 내역에서 확인하실 수 있어요.",
    ),
    (
        ("피부타입 진단", "피부 타입 진단", "진단은", "진단 어떻게", "진단하는", "진단 받"),
        "피부타입 진단은 두 가지 방법이 있어요.\n"
        "· 문답 진단: 질문에 답하면 8가지 피부타입 중 하나로 알려 줘요. 입력창 옆 + 메뉴의 '피부타입 진단하기'나 마이페이지 > 피부타입 재진단에서 시작해요.\n"
        "· 얼굴 사진 분석: 마이페이지 > AI 피부관리에서 사진을 찍어 분석해요.",
    ),
    (
        ("뭐하는 앱", "무슨 앱", "어떤 앱", "앱 소개", "사용법", "어떻게 써", "어떻게 쓰"),
        "Swappy는 쓰던 화장품과 성분이 비슷하면서 더 저렴하거나 내 피부에 더 잘 맞는 대체품을 찾아 주는 앱이에요.\n"
        "· 성분 분석: 제품의 핵심 성분과 주의 성분을 보여 줘요\n"
        "· 대체품 찾기·성분 비교: 쓰던 제품과 다른 제품을 견줘 볼 수 있어요\n"
        "· 내 피부 궁합: 피부타입 진단 결과로 제품이 맞는지 알려 줘요\n"
        "· 얼굴 사진 분석과 챗봇",
    ),
)
# 화장대 등록 방법은 "화장대"와 "등록/추가"가 함께 있는 말이다(내 화장대에 뭐 있어? 같은 말은 개인 요약 경로가 받는다).
_CLOSET_HOWTO = (
    "화장대에 제품을 등록하는 방법이에요.\n"
    "· 입력창 옆 + 메뉴의 '내 화장품 등록하기'에서 제품명을 입력하거나 제품 앞면을 찍어요\n"
    "· 제품 상세 화면의 '내 피부와의 궁합' 오른쪽 '+ 화장대에 추가'를 눌러요\n"
    "· 화장대 탭의 '제품 추가'에서 스캔하거나 이름으로 찾아 추가해요"
)
_SENSITIVE_WORDS = ("민감", "예민")
_SENSITIVE_ASK = ("안 좋", "나쁜", "피해", "조심", "자극", "주의")
_SENSITIVE_REPLY = (
    "피부가 예민할 때 조심하면 좋은 성분이에요.\n"
    "· 향료: 자극과 알레르기 반응이 생기기 쉬워요\n"
    "· 건조 알코올(알코올 데나트 등): 피부 수분을 빼앗을 수 있어요\n"
    "· 고농도 산·레티놀: 각질을 녹이거나 주름을 개선하는 대신 따가울 수 있어요\n"
    "제품별 주의 성분은 제품 상세의 성분 분석에서 확인할 수 있어요."
)
# 효과로 묻는 성분 질문("진정 성분이 뭐야?")의 단어 → 기능 코드
_FUNC_WORDS = {
    "보습": "H", "건조": "H", "수분": "H",
    "장벽": "B",
    "진정": "S", "붉은기": "S", "홍조": "S", "민감": "S",
    "미백": "W", "톤업": "W", "잡티": "W",
    "주름": "A", "탄력": "A",
    "항산화": "O",
    "피지": "P", "모공": "P", "여드름": "P", "트러블": "P",
    "각질": "E",
    "자외선": "U", "선크림": "U",
}


def _static_reply(text: str) -> str | None:
    """인사·감사·앱 사용 안내·민감성 주의 성분 같이 모델 없이 고정 문장으로 답할 수 있는 말. 아니면 None."""
    compact = text.strip().lower()
    if len(compact) <= 14 and _has(compact, _THANKS):
        return _THANKS_REPLY
    if len(compact) <= 14 and _has(compact, _GREET):
        return _GREET_REPLY
    for words, answer in _FAQ:
        if _has(text, words):
            return answer
    if "화장대" in text and _has(text, ("등록", "추가")):
        return _CLOSET_HOWTO
    if _has(text, _SENSITIVE_WORDS) and _has(text, _SENSITIVE_ASK) and "성분" in text:
        return _SENSITIVE_REPLY
    return None


def _function_code(text: str) -> str | None:
    """"진정 성분이 뭐야?", "건조할 때 좋은 성분"처럼 효과로 성분을 묻는 말의 기능 코드."""
    if "성분" not in text:
        return None
    for word, code in _FUNC_WORDS.items():
        if word in text:
            return code
    return None


async def _function_body(db: AsyncSession, code: str) -> str:
    """그 기능을 가진 대표 성분(활성·확신도 보통 이상, 자주 쓰이는 순)을 설명과 함께 보여 준다."""
    rows = (
        await db.execute(
            select(Ingredient.name_ko, IngredientDescription.description, func.count(ProductIngredient.product_id).label("n"))
            .join(IngredientFunction, IngredientFunction.ingredient_id == Ingredient.id)
            .join(IngredientDescription, IngredientDescription.ingredient_id == Ingredient.id)
            .join(ProductIngredient, ProductIngredient.ingredient_id == Ingredient.id)
            .where(
                IngredientFunction.functions.contains([code]),
                IngredientFunction.role == "a",
                IngredientFunction.confidence >= 2,
                func.length(Ingredient.name_ko) >= 3,
            )
            .group_by(Ingredient.id, Ingredient.name_ko, IngredientDescription.description)
            .order_by(func.count(ProductIngredient.product_id).desc())
            .limit(4)
        )
    ).all()
    label = FUNC_NAMES.get(code, "")
    if not rows:
        return f"{label} 성분 정보를 찾지 못했어요. 성분 이름을 알려 주시면 설명해 드릴게요."
    lines = [f"**{label}**에 도움을 준다고 알려진 대표 성분이에요."]
    for name, desc, _n in rows:
        first = (desc or "").split(". ")[0].strip()
        lines.append(f"· {name}: {first[:80]}" if first else f"· {name}")
    lines.append("궁금한 성분 이름을 물어보면 더 자세히 알려 드려요. 일반적으로 알려진 내용이에요.")
    return "\n".join(lines)


async def fallback_reply(
    db: AsyncSession,
    message: str,
    skin_type: str | None,
    snapshot: personal_context.PersonalSnapshot | None = None,
) -> str:
    """질문에 맞는 DB 기반 답변. 항상 문자열을 돌려준다(예외는 호출부가 503으로 처리).

    `snapshot`(로그인한 사용자의 개인 요약)이 있고 질문이 "내 화장대·내 피부"를 묻는 말이면 그 사람 데이터로 답한다.
    이 답은 사람마다 다르므로 **질문 문장 단위 캐시를 쓰지 않는다**(다른 사람에게 새어 나가면 안 된다).
    """
    text = message.strip()
    personal = snapshot is not None and not snapshot.is_empty and _has(text, _MINE) and _has(text, _MINE_ASK)
    version = await get_cache_version()
    msg_key = f"chatfb:v{version}:msg:{hashlib.sha1(text.encode()).hexdigest()[:20]}:{skin_type or '-'}"
    if not personal:
        hit = await cache_get(msg_key)
        if hit is not None:
            return hit

    reply = await _compose(db, text, skin_type, version, snapshot if personal else None)
    if not personal:
        await cache_set(msg_key, reply, MSG_CACHE_TTL)
    return reply


async def _compose(
    db: AsyncSession,
    text: str,
    skin_type: str | None,
    version: int,
    snapshot: personal_context.PersonalSnapshot | None = None,
) -> str:
    if snapshot is not None:
        # "내 화장대 크림보다 싼 거"처럼 화장대 제품을 가리키며 대체품을 묻는 말은 그 제품의 대체품으로 답한다.
        entry = _closet_match(text, snapshot) if _has(text, _ALTERNATIVE) else None
        if entry is not None:
            seed = {"id": entry.id, "name": entry.name, "price": entry.price or 0}
            if seed["price"]:
                return f"{NOTICE}\n\n{await _alternative_body(db, seed)}"
        return f"{NOTICE}\n\n{mine_body(snapshot)}"

    static = _static_reply(text)
    if static is not None:
        return static

    ing = await _match_ingredients(db, text)
    code = None if ing else _function_code(text)
    if code is not None:
        return await _function_body(db, code)
    brand = await _match_brand(db, text) if _wants_products(text, ing) else None
    if brand is not None:
        # 질문에 브랜드가 있으면 그 브랜드 안에서만 찾는다 — 전체 평점순 top5에 밀려 엉뚱한 브랜드가 나오지 않게.
        products, named = await _brand_products(db, text, brand, skin_type)
    else:
        products = await rag.search_products(db, text, skin_type) if _wants_products(text, ing) else []
        named = _named_products(text, products)

    if ing:
        kind, ids = "ing", [i.id for i in ing]
    elif named and _has(text, _ALTERNATIVE):
        kind, ids = "alt", [named[0]["id"]]
    elif _has(text, _RECOMMEND):
        kind, ids = "rec", [p["id"] for p in products]
    elif named:
        kind, ids = "prod", [named[0]["id"]]
    else:
        if brand is not None:
            return f"{NOTICE}\n\n**{brand}**에서 질문과 맞는 제품을 찾지 못했어요. 제품명을 조금 더 정확히 알려 주세요."
        return f"{NOTICE}\n\n{GUIDE}"

    key = f"chatfb:v{version}:{kind}:{','.join(map(str, ids))}:{skin_type or '-'}"
    cached = await cache_get(key)
    if cached is not None:
        return cached

    if kind == "ing":
        body = await _ingredient_body(db, ing, skin_type)
    elif kind == "alt":
        body = await _alternative_body(db, named[0])
    elif kind == "rec":
        body = await _recommend_body(db, products, skin_type)
    else:
        body = _product_body(named[0])
    reply = f"{NOTICE}\n\n{body}"
    await cache_set(key, reply, CACHE_TTL)
    return reply


def _closet_match(text: str, snapshot: personal_context.PersonalSnapshot):
    """질문이 가리키는 화장대 제품.

    1) 제품명(브랜드·상품명 단어)이 질문에 들어 있으면 그 제품, 2) 아니면 질문의 종류 단어(크림·토너…)가 제품명에 있는 첫 제품.
    종류 단어는 흔해서 제품명 매칭에서는 뺀다(안 그러면 "토너" 한 단어로 아무 토너나 잡힌다).
    """
    for e in snapshot.closet:
        if any(len(t) >= 3 and t not in _KIND_WORDS and t in text for t in e.name.split()):
            return e
    kinds = [k for k in _KIND_WORDS if k in text]
    for e in snapshot.closet:
        if any(k in e.name for k in kinds):
            return e
    return None


def mine_body(s: personal_context.PersonalSnapshot) -> str:
    """"내 화장대·내 피부" 질문에 모델 없이 내 요약을 그대로 보여 준다. 없는 정보는 없다고 말한다."""
    lines: list[str] = []
    if s.skin_label:
        lines.append(f"**피부타입**: {s.skin_label}")
    if s.weak_concerns:
        items = ", ".join(f"{n} {sc}점" for n, sc in s.weak_concerns)
        lines.append(f"**신경 쓸 부분**(최근 AI 사진 분석): {items}")
    if s.avoid:
        lines.append(f"**피해야 할 성분**: {', '.join(s.avoid)}")
    if s.budget:
        lines.append(f"**예산**: {personal_context._won(s.budget[0])} ~ {personal_context._won(s.budget[1])}")
    if s.my_ingredients:
        lines.append(f"**마이 성분**: {', '.join(s.my_ingredients)}")
    if s.closet:
        lines.append(f"\n**내 화장대** ({s.closet_total}개)")
        for i, e in enumerate(s.closet[: len(_NUM)]):
            price = f" | {e.price:,}원" if e.price else ""
            funcs = f"\n주요 기능: {'·'.join(e.functions)}" if e.functions else ""
            lines.append(f"\n{_NUM[i]} **{e.name}**\n{e.brand} | {e.category}{price}{funcs}")
        lines.append('\n💡 "(제품명)보다 싼 대체품 있어?"라고 물어보면 비슷한 성분의 더 싼 제품을 찾아 드려요.')
    else:
        lines.append("\n화장대에 등록한 제품이 아직 없어요. 쓰는 제품을 등록하면 대체품을 찾아 드려요.")
    return "\n".join(lines)


def _has(text: str, words: tuple[str, ...]) -> bool:
    return any(w in text for w in words)


def _wants_products(text: str, ing: list) -> bool:
    # 성분 설명만 묻는 질문에는 제품 검색이 필요 없다(평점 상위 폴백이 끼어드는 것도 막는다).
    return not ing or _has(text, _RECOMMEND)


def _named_products(text: str, products: list[dict]) -> list[dict]:
    """검색 결과 중 질문에 제품명·브랜드가 실제로 들어 있는 것 — 평점 상위 폴백과 구분한다."""
    tokens = [t for t in text.split() if len(t) >= 2]
    out = []
    for p in products:
        hay = f"{p['brand']} {p['name']}"
        if any(t in hay for t in tokens):
            out.append(p)
    return out


# 제품을 가리키지 않는 질문 단어 — 브랜드 안에서 제품명을 찾을 때 뺀다.
_STOP = ("성분", "알려", "추천", "대체", "비슷", "저렴", "가성비", "있어", "보다", "제품", "뭐야", "알고", "싼")


def _name_tokens(text: str, brand: str) -> list[str]:
    cleaned = text.replace(brand, " ")
    for w in _STOP:
        cleaned = cleaned.replace(w, " ")  # "세럼보다" → "세럼"
    return [t for t in cleaned.split() if len(t) >= 2]


async def _match_brand(db: AsyncSession, text: str) -> str | None:
    """질문에 이름이 들어 있는 브랜드(가장 긴 것). 없으면 None."""
    return await db.scalar(
        select(Brand.name)
        .where(func.length(Brand.name) >= 2, literal(text).like(func.concat("%", Brand.name, "%")))
        .order_by(func.length(Brand.name).desc())
        .limit(1)
    )


async def _brand_products(
    db: AsyncSession, text: str, brand: str, skin_type: str | None
) -> tuple[list[dict], list[dict]]:
    """(브랜드의 후보 제품, 질문의 제품명 단어가 이름에 든 제품). 후보는 이름 일치가 있으면 그것, 없으면 평점순."""
    toks = _name_tokens(text, brand)
    rule = await load_rule(db, skin_type)
    base = (
        select(Product)
        .join(Brand, Brand.id == Product.brand_id)
        .where(Brand.name == brand, Product.status == "active", Product.composition == "single", rag.listable())
        .options(joinedload(Product.brand), joinedload(Product.category))
    )
    order = (Product.rating.desc().nullslast(), Product.review_count.desc().nullslast())
    base = apply_exclusions(base, rule)
    named_rows = []
    if toks:
        hits = sum(((Product.name.ilike(f"%{rag._escape_like(t)}%")).cast(Integer) for t in toks))
        named_rows = (await db.execute(base.where(or_(*[Product.name.ilike(f"%{rag._escape_like(t)}%") for t in toks])).order_by(hits.desc(), *order).limit(5))).unique().scalars().all()
    top = named_rows or (await db.execute(base.order_by(*order).limit(5))).unique().scalars().all()
    rows = [await rag._to_dict(db, p, []) for p in top]
    return rows, (rows if named_rows else [])


async def _match_ingredients(db: AsyncSession, text: str) -> list[Ingredient]:
    """질문에 이름이 들어 있는 성분(설명이 있는 것만). 긴 이름이 우선, 최대 2개."""
    names = [text]
    for common, standards in rag._INGREDIENT_SYNONYMS.items():
        if common in text.lower().replace(" ", ""):
            names.extend(standards)
    msg = literal(" ".join(names))
    rows = (
        await db.execute(
            select(Ingredient)
            .join(IngredientDescription, IngredientDescription.ingredient_id == Ingredient.id)
            .where(func.length(Ingredient.name_ko) >= 3, msg.like(func.concat("%", Ingredient.name_ko, "%")))
            .order_by(func.length(Ingredient.name_ko).desc())
            .limit(6)
        )
    ).scalars().all()
    # 더 긴 이름 안에 든 짧은 이름("글리세린" ⊂ "폴리글리세린")은 뺀다.
    picked: list[Ingredient] = []
    for r in rows:
        if not any(r.name_ko in p.name_ko for p in picked):
            picked.append(r)
    return picked[:2]


async def _ingredient_body(db: AsyncSession, ings: list[Ingredient], skin_type: str | None) -> str:
    parts = []
    for ing in ings:
        desc = await db.scalar(
            select(IngredientDescription.description).where(IngredientDescription.ingredient_id == ing.id)
        )
        fn = (
            await db.execute(
                select(IngredientFunction.functions, IngredientFunction.flags, IngredientFunction.allergen_listed, IngredientFunction.confidence)
                .where(IngredientFunction.ingredient_id == ing.id)
            )
        ).first()
        lines = [f"**{ing.name_ko}**", desc or "설명 정보가 없어요."]
        if fn and (fn.confidence or 0) >= 2:
            roles = [FUNC_NAMES[c] for c in "".join(fn.functions or []) if c in FUNC_NAMES]
            if roles:
                lines.append(f"주요 역할: {', '.join(roles)}")
        if fn:
            flags = [_FLAG_TEXT[c] for c in "".join(fn.flags or []) if c in _FLAG_TEXT]
            if fn.allergen_listed:
                flags.append("알레르기 유발 착향제 고시 성분")
            if flags:
                lines.append(f"주의: {', '.join(flags)}")
        parts.append("\n".join(lines))
    # 이 성분이 든 제품 몇 개
    inc = await rag.search_products(db, ings[0].name_ko, skin_type, top_k=3)
    inc = [p for p in inc if any(ings[0].name_ko in x for x in p["ingredients"])]
    if inc:
        parts.append("이 성분이 든 제품이에요.\n" + _product_list(inc))
    parts.append("제품별 실제 효과는 다를 수 있어요.")
    return "\n\n".join(parts)


def _product_list(products: list[dict], fits: dict[int, int | None] | None = None) -> str:
    out = []
    for i, p in enumerate(products[: len(_NUM)]):
        lines = [f"{_NUM[i]} **{p['name']}**", f"{p['brand']} | {p['price']:,}원"]
        if p["ingredients"]:
            lines.append(f"주요성분: {', '.join(p['ingredients'])}")
        if fits and fits.get(p["id"]) is not None:
            lines.append(f"내 피부 궁합: {fits[p['id']]}점")
        out.append("\n".join(lines))
    return "\n\n".join(out)


async def _recommend_body(db: AsyncSession, products: list[dict], skin_type: str | None) -> str:
    if not products:
        return "조건에 맞는 제품을 찾지 못했어요. 현재 데이터에 없는 정보예요."
    fits: dict[int, int | None] = {}
    if skin_type:
        rows = await db.execute(
            select(ProductSkinFit.product_id, ProductSkinFit.score).where(
                ProductSkinFit.skin_type == skin_type, ProductSkinFit.product_id.in_([p["id"] for p in products])
            )
        )
        fits = {pid: score for pid, score in rows.all()}
    head = f"{rag.skin_type_label(skin_type)} 피부 기준으로 골랐어요." if skin_type else "평점이 높은 제품이에요."
    return f"{head}\n\n{_product_list(products, fits)}"


def _product_body(p: dict) -> str:
    return "검색어와 가장 가까운 제품이에요.\n\n" + _product_list([p])


async def _alternative_body(db: AsyncSession, seed: dict) -> str:
    from app.models.product import Product
    from sqlalchemy.orm import joinedload

    rows = (
        await db.execute(
            select(Similarity.score, Product)
            .join(Product, Product.id == Similarity.similar_id)
            .where(
                Similarity.product_id == seed["id"],
                Similarity.method == "hybrid",
                Product.composition == "single",
                Product.price < seed["price"],
            )
            .options(joinedload(Product.brand))
            .order_by(Similarity.score.desc())
            .limit(3)
        )
    ).all()
    if not rows:
        return f"**{seed['name']}**보다 싸면서 성분이 비슷한 제품을 찾지 못했어요."
    lines = [f"**{seed['name']}** ({seed['price']:,}원)보다 싼 비슷한 제품이에요."]
    for i, (score, p) in enumerate(rows):
        saved = seed["price"] - (p.price or 0)
        lines.append(
            f"\n{_NUM[i]} **{p.display_name or p.name}**\n"
            f"{p.brand.name if p.brand else ''} | {(p.price or 0):,}원 ({saved:,}원 절약)\n"
            f"성분 유사도: {round(float(score) * 100)}%"
        )
    return "\n".join(lines)
