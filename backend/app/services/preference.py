"""내 성분 취향 — 쓸수록 나를 배우는, 설명 가능한 개인 모델 (퍼스널 AI 3단계).

무엇을 배우나
-------------
내가 **좋아한 제품**(후기 4~5점·재구매·찜·화장대에 둔 것)의 성분에는 +, **별로였던 제품**(후기 1~2점)의 성분에는 −를 쌓아
성분별 선호 벡터를 만든다. 신경망이 아니라 이미 쓰는 성분 표현(IDF × 역할 가중, `services/similarity.py`와 같은 척도)
위의 가중합이라서 **"왜 이 제품이 나에게 맞아 보이는지"를 성분 이름으로 설명**할 수 있다("내가 좋아한 ○○와 같은 나이아신아마이드").

무엇을 하지 않나
----------------
- 신호가 모자라면(`MIN_SIGNALS`) **켜지 않는다**(콜드 스타트). 피부타입 궁합(`skin_fit`)이 그 자리를 계속 맡고, 화면은 "후기를 쓰거나
  찜하면 취향이 쌓여요"라고 말한다. 적은 데이터로 취향이 있는 척하지 않는다.
- 취향 점수는 **홈 추천 점수에 소폭만(`BLEND`) 섞는다.** 피부타입에 맞지 않는 제품(하드 제외)을 취향이 끌어올리지는 못한다 —
  후보 풀은 기존 규칙이 만든 것이고, 취향은 그 안의 순서만 바꾼다.

이 모듈의 계산(`build_profile`·`score`·`explain`)은 DB를 모르는 순수 함수라 단위 테스트한다. DB에서 신호·성분을 읽는
함수는 아래쪽(`load_signals`·`idf_table`)에 따로 있다.
"""
from __future__ import annotations

import math
import time
import uuid
from dataclasses import dataclass, field

from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.personal import ClosetItem, Like, Order, OrderItem, Review
from app.models.product import Product, ProductIngredient
from app.services.similarity import ROLE_WEIGHT, UNLABELED_WEIGHT

# 신호 한 건의 세기(−1 ~ +1). 같은 제품의 신호는 합치고 [-1, 1]로 자른다.
REVIEW_WEIGHT = {5: 1.0, 4: 0.6, 3: 0.0, 2: -0.6, 1: -1.0}
REPEAT_WEIGHT = 0.8        # 서로 다른 주문에서 2번 이상 산 제품
LIKE_WEIGHT = 0.4
CLOSET_WEIGHT = 0.3

# 취향이 켜지려면 신호가 있는 서로 다른 제품이 이만큼(그중 좋아한 제품이 1개 이상) 필요하다
MIN_SIGNALS = 3
# 별로였던 제품과 닮은 정도를 얼마나 깎을지
NEG_PENALTY = 0.7
# 홈 추천 점수에 섞는 비중
BLEND = 0.2
# 설명에 보여 줄 성분 개수
EXPLAIN_TOP = 3


@dataclass(frozen=True)
class Signal:
    product_id: int
    weight: float                      # −1 ~ +1
    sources: tuple[str, ...] = ()      # review / repeat / like / closet


@dataclass
class PreferenceProfile:
    """성분 id → 가중. pos·neg 모두 L2 정규화돼 있다."""

    pos: dict[int, float] = field(default_factory=dict)
    neg: dict[int, float] = field(default_factory=dict)
    # 성분 → 그 성분이 들어 있어 좋아했거나 별로였던 제품 id들(설명용)
    pos_products: dict[int, list[int]] = field(default_factory=dict)
    neg_products: dict[int, list[int]] = field(default_factory=dict)
    signal_count: int = 0
    active: bool = False


# ── 순수 계산 ─────────────────────────────────────────────────────────────


def combine_signals(raw: list[Signal]) -> dict[int, Signal]:
    """제품마다 신호를 합치고 [-1, 1]로 자른다. 합이 0인 제품(후기 3점 등)은 취향에 쓰지 않는다."""
    merged: dict[int, tuple[float, set[str]]] = {}
    for s in raw:
        w, src = merged.get(s.product_id, (0.0, set()))
        merged[s.product_id] = (w + s.weight, src | set(s.sources))
    return {
        pid: Signal(pid, max(-1.0, min(1.0, w)), tuple(sorted(src)))
        for pid, (w, src) in merged.items()
        if abs(w) > 1e-9
    }


def _doc_vector(doc: list[int], labels: dict[int, tuple], idf: dict[int, float]) -> dict[int, float]:
    """제품 한 개의 L2 정규화 성분 벡터. IDF × 역할 가중(`similarity.ROLE_WEIGHT`), 오염 이름(0)은 뺀다."""
    vec: dict[int, float] = {}
    for ing in set(doc):
        lab = labels.get(ing)
        role_w = ROLE_WEIGHT.get(lab[1], UNLABELED_WEIGHT) if lab is not None else UNLABELED_WEIGHT
        w = idf.get(ing, 0.0) * role_w
        if w > 0:
            vec[ing] = w
    norm = math.sqrt(sum(v * v for v in vec.values()))
    return {k: v / norm for k, v in vec.items()} if norm > 0 else {}


def _normalize(vec: dict[int, float]) -> dict[int, float]:
    norm = math.sqrt(sum(v * v for v in vec.values()))
    return {k: v / norm for k, v in vec.items()} if norm > 0 else {}


def build_profile(
    signals: dict[int, Signal],
    docs: dict[int, list[int]],
    labels: dict[int, tuple],
    idf: dict[int, float],
) -> PreferenceProfile:
    """신호가 있는 제품의 성분을 가중합해 선호 벡터를 만든다. 성분 정보가 없는 제품은 신호 개수에서도 뺀다."""
    pos: dict[int, float] = {}
    neg: dict[int, float] = {}
    pos_products: dict[int, list[int]] = {}
    neg_products: dict[int, list[int]] = {}
    usable = 0
    liked = 0
    for pid, sig in signals.items():
        vec = _doc_vector(docs.get(pid, []), labels, idf)
        if not vec:
            continue
        usable += 1
        target, owners = (pos, pos_products) if sig.weight > 0 else (neg, neg_products)
        liked += sig.weight > 0
        for ing, v in vec.items():
            target[ing] = target.get(ing, 0.0) + abs(sig.weight) * v
            owners.setdefault(ing, []).append(pid)
    profile = PreferenceProfile(
        pos=_normalize(pos), neg=_normalize(neg), pos_products=pos_products, neg_products=neg_products, signal_count=usable
    )
    profile.active = usable >= MIN_SIGNALS and liked >= 1
    return profile


def _cos(a: dict[int, float], b: dict[int, float]) -> float:
    if len(a) > len(b):
        a, b = b, a
    return sum(v * b.get(k, 0.0) for k, v in a.items())


def score(profile: PreferenceProfile, doc: list[int], labels: dict[int, tuple], idf: dict[int, float]) -> float:
    """내 취향과 이 제품의 어울림(−NEG_PENALTY ~ 1). 취향이 꺼져 있으면 0."""
    if not profile.active:
        return 0.0
    vec = _doc_vector(doc, labels, idf)
    return _cos(profile.pos, vec) - NEG_PENALTY * _cos(profile.neg, vec)


def normalize_pool(raw: dict[int, float]) -> dict[int, float]:
    """후보 풀 안에서 0~1로 맞춘다(최대값 기준, 음수는 0). 취향 점수의 절대 크기는 작아서 풀 상대값으로 섞는다."""
    top = max(raw.values(), default=0.0)
    if top <= 0:
        return {pid: 0.0 for pid in raw}
    return {pid: max(0.0, v) / top for pid, v in raw.items()}


def explain(
    profile: PreferenceProfile, doc: list[int], labels: dict[int, tuple], idf: dict[int, float], limit: int = EXPLAIN_TOP
) -> tuple[list[int], list[int]]:
    """이 제품에서 취향과 겹치는 성분 id (좋아하는 쪽, 피하는 쪽). 기여가 큰 순."""
    vec = _doc_vector(doc, labels, idf)
    likes = sorted((i for i in vec if i in profile.pos), key=lambda i: -(profile.pos[i] * vec[i]))
    dislikes = sorted((i for i in vec if i in profile.neg), key=lambda i: -(profile.neg[i] * vec[i]))
    return likes[:limit], dislikes[:limit]


def top_ingredients(weights: dict[int, float], limit: int = 6) -> list[tuple[int, float]]:
    return sorted(weights.items(), key=lambda kv: -kv[1])[:limit]


# ── DB 읽기 ───────────────────────────────────────────────────────────────

_IDF_TTL = 60 * 60
_idf_memo: tuple[float, dict[int, float]] | None = None


async def idf_table(db: AsyncSession) -> dict[int, float]:
    """성분 id → log(N/df). 카탈로그(단일제품)에서 한 번 세어 1시간 동안 프로세스에 둔다."""
    global _idf_memo
    now = time.monotonic()
    if _idf_memo is not None and now - _idf_memo[0] < _IDF_TTL:
        return _idf_memo[1]
    n = await db.scalar(select(func.count()).select_from(Product).where(Product.composition == "single")) or 1
    rows = await db.execute(
        select(ProductIngredient.ingredient_id, func.count(distinct(ProductIngredient.product_id)))
        .join(Product, Product.id == ProductIngredient.product_id)
        .where(Product.composition == "single")
        .group_by(ProductIngredient.ingredient_id)
    )
    table = {ing: math.log(n / max(df, 1)) for ing, df in rows.all()}
    _idf_memo = (now, table)
    return table


async def load_signals(db: AsyncSession, user_id: uuid.UUID) -> list[Signal]:
    """이 사용자의 취향 신호(후기·재구매·찜·화장대)."""
    out: list[Signal] = []
    for pid, rating in (await db.execute(select(Review.product_id, Review.rating).where(Review.user_id == user_id))).all():
        w = REVIEW_WEIGHT.get(int(rating), 0.0)
        if w:
            out.append(Signal(pid, w, ("review",)))
    repeat = await db.execute(
        select(OrderItem.product_id)
        .join(Order, Order.id == OrderItem.order_id)
        .where(Order.user_id == user_id, Order.status == "placed", OrderItem.product_id.is_not(None))
        .group_by(OrderItem.product_id)
        .having(func.count(distinct(OrderItem.order_id)) >= 2)
    )
    out += [Signal(pid, REPEAT_WEIGHT, ("repeat",)) for (pid,) in repeat.all()]
    out += [Signal(pid, LIKE_WEIGHT, ("like",)) for (pid,) in (await db.execute(select(Like.product_id).where(Like.user_id == user_id))).all()]
    closet = await db.execute(
        select(ClosetItem.product_id).where(ClosetItem.user_id == user_id, ClosetItem.status != "removed")
    )
    out += [Signal(pid, CLOSET_WEIGHT, ("closet",)) for (pid,) in closet.all()]
    return out


async def load_profile(db: AsyncSession, user_id: uuid.UUID) -> tuple[PreferenceProfile, dict[int, str], dict[int, tuple], dict[int, float]]:
    """(프로필, 성분 id→이름, 라벨, IDF). 신호 제품들의 성분만 읽는다."""
    # 순환 import를 피하려고 지금 가져온다(api 계층이 services를 읽는다)
    from app.api.recommendations import load_labeled_docs

    signals = combine_signals(await load_signals(db, user_id))
    idf = await idf_table(db)
    if not signals:
        return PreferenceProfile(), {}, {}, idf
    docs, labels, names, _pos = await load_labeled_docs(db, list(signals))
    return build_profile(signals, docs, labels, idf), names, labels, idf


def signal_summary(signals: list[Signal]) -> dict[str, int]:
    """출처별 신호 개수(화면 "후기 3 · 찜 2 …")."""
    count = {"review": 0, "repeat": 0, "like": 0, "closet": 0}
    for s in combine_signals(signals).values():
        for src in s.sources:
            count[src] = count.get(src, 0) + 1
    return count
