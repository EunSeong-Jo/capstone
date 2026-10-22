"""예산 구매 가이드 엔진 (Task 15, PRD 시나리오 C).

예산 범위 [min, max] 안에서 토너 · 에센스 · 크림 · 선크림 루틴 조합을 1~3안 낸다.

1. 후보: 단계마다 상위 20개. 점수는 홈 추천과 같은 식(`services/product_score.py`
   — 피부타입 매칭·별점·리뷰)이고, 피부타입 기피 성분과 선호 조건(무향·무알코올)
   제품은 뺀다. 화장대에 이미 있는 제품도 뺀다.
2. 조합: 단계마다 하나씩, 합계가 max를 넘지 않는 조합을 **전부** 본다.
   명세(tasks.json)는 빔서치였지만 후보 20개 × 4단계면 최대 16만 조합이라
   다 봐도 0.1초대다. 빔서치는 근사라 최선을 놓칠 수 있다 — 단계가 늘어
   조합 수가 폭발할 때 바꾸면 된다(`search_combinations`만 바꾸면 된다).
3. 1~3안: [min, max]를 세 구간(알뜰·균형·여유)으로 나눠 구간마다 점수가 가장
   높은 조합. 명세의 "예산 80%·60%·40% 사용"을 범위 예산에 맞게 옮긴 것이다.
4. 예산이 모자라 네 단계를 못 사면 빈 결과가 아니라, 뒤쪽 단계부터 빼 가며
   살 수 있는 만큼의 루틴을 낸다(바르는 순서가 우선순위). 뺀 단계는
   `missing_steps`, 전체 루틴 최저 합계는 `min_possible_total`로 알린다.

3·4번 서브태스크(엔진·탐색)는 DB를 모르는 순수 함수로 두어 단위 테스트한다.
"""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.product import Category, Product
from app.schemas.budget_guide import (
    BudgetGuideIn,
    BudgetGuideOut,
    GuideCombinationOut,
    GuideItemOut,
)
from app.services.product_score import product_score
from app.services.similarity import FUNC_NAMES
from app.services.skin_fit import PREFER
from app.services.routine_steps import ROUTINE, STEP_BY_CODE, step_expr
from app.services.skin_type import (
    SKIN_TYPE_LABELS,
    SkinRule,
    apply_exclusions,
    has_fact,
    load_rule,
    matched_count,
)

CANDIDATES_PER_STEP = 20
# 예산이 모자랄 때 더하는 단계별 최저가 후보 수. 점수 상위 20개가 모두 비싸면
# 살 수 있는 조합(가장 싼 토너·에센스·크림 19,500원)을 놓친다(2026-10 실측).
CHEAP_PER_STEP = 10
BAND_LABELS = ("알뜰", "균형", "여유")
# 안이 하나뿐일 때의 이름. '여유'만 덩그러니 있으면 다른 안이 왜 없는지 알 수 없다.
SINGLE_LABEL = "추천 조합"
# 앞 안과 겹치는 제품 하나당 감점. 조합 점수(제품 점수 평균)는 상위권끼리
# 0.01 안팎으로 붙어 있어서, 감점이 없으면 세 안이 제품 세 개를 공유하고
# 토너 하나만 바뀌었다(2026-10 실측). 가격대별로 다른 선택지를 주려는 것이다.
OVERLAP_PENALTY = 0.03


@dataclass(frozen=True, slots=True)
class Candidate:
    product_id: int
    step: str
    price: int
    score: float
    matched: int
    rating: float | None


@dataclass(frozen=True, slots=True)
class Combination:
    items: tuple[Candidate, ...]
    total: int
    score: float  # 제품 점수 평균


# ── 순수 함수 ────────────────────────────────────────────────


def search_combinations(steps: list[list[Candidate]], budget_max: int) -> list[Combination]:
    """단계마다 하나씩 골라 합계가 budget_max 이하인 조합 전부.

    가격 오름차순으로 훑으면서, 남은 단계의 최저가 합을 더해도 예산을 넘는
    가지는 일찍 자른다. 한 단계라도 후보가 없으면 조합이 없다.
    """
    if not steps or any(not s for s in steps):
        return []
    ordered = [sorted(s, key=lambda c: c.price) for s in steps]
    # cheapest_rest[i] = i번째 단계부터 끝까지 최저가 합
    cheapest_rest = [0] * (len(ordered) + 1)
    for i in range(len(ordered) - 1, -1, -1):
        cheapest_rest[i] = cheapest_rest[i + 1] + ordered[i][0].price

    out: list[Combination] = []
    picked: list[Candidate] = []

    def walk(i: int, total: int, score_sum: float) -> None:
        if i == len(ordered):
            out.append(Combination(tuple(picked), total, score_sum / len(picked)))
            return
        for c in ordered[i]:
            if total + c.price + cheapest_rest[i + 1] > budget_max:
                break  # 가격 오름차순이라 뒤는 전부 넘는다
            picked.append(c)
            walk(i + 1, total + c.price, score_sum + c.score)
            picked.pop()

    walk(0, 0, 0.0)
    return out


def search_partial(
    steps: list[list[Candidate]], budget_max: int
) -> tuple[int, list[Combination]]:
    """(담은 단계 수, 조합). 네 단계를 못 사면 **뒤쪽 단계부터** 빼 가며 찾는다.

    예산이 모자란다고 아무것도 안 보여 주면 쓸모가 없다. 바르는 순서가 곧
    우선순위라 토너 → 에센스 → 크림 → 선크림 순으로 남긴다. 토너 하나도 못
    사면 (0, [])이다.
    """
    for k in range(len(steps), 0, -1):
        combos = search_combinations(steps[:k], budget_max)
        if combos:
            return k, combos
    return 0, []


def select_options(
    combos: list[Combination], budget_min: int, budget_max: int
) -> list[tuple[str, Combination, bool]]:
    """(라벨, 조합, 범위보다 저렴한가) 1~3개.

    구간은 [min, max]가 아니라 **[살 수 있는 가장 싼 조합 합계, max]**를 셋으로
    나눈다. min부터 나누면 가장 싼 조합이 이미 위쪽 칸에 있을 때(예산 1~2만원에
    최저 19,500원) 아래 칸들이 비어 '여유' 하나만 나왔다. 구간이 min 아래로
    내려가지는 않는다.

    범위 안 조합이 없으면 max 이하에서 가장 좋은 조합 하나를 '범위보다 저렴'으로 낸다.
    안이 하나뿐이면 이름을 '추천 조합'으로 바꾼다.
    """
    if not combos:
        return []
    best = lambda cs: max(cs, key=lambda c: (c.score, -c.total))  # noqa: E731

    in_range = [c for c in combos if c.total >= budget_min]
    if not in_range:
        return [(SINGLE_LABEL, best(combos), True)]

    floor = min(c.total for c in in_range)
    width = (budget_max - floor) / len(BAND_LABELS)
    picked: list[tuple[str, Combination, bool]] = []
    seen: set[tuple[int, ...]] = set()
    used: set[int] = set()  # 앞 안들에 이미 나온 제품
    for i, label in enumerate(BAND_LABELS):
        lo = floor + width * i
        hi = floor + width * (i + 1)
        last = i == len(BAND_LABELS) - 1
        band = [c for c in in_range if lo <= c.total and (c.total <= hi if last else c.total < hi)]
        band = [c for c in band if tuple(sorted(x.product_id for x in c.items)) not in seen]
        if not band:
            continue
        choice = max(
            band,
            key=lambda c: (
                c.score - OVERLAP_PENALTY * sum(1 for x in c.items if x.product_id in used),
                -c.total,
            ),
        )
        seen.add(tuple(sorted(c.product_id for c in choice.items)))
        used.update(c.product_id for c in choice.items)
        picked.append((label, choice, False))
    if len(picked) == 1:
        return [(SINGLE_LABEL, picked[0][1], False)]
    return picked


def build_reason(combo: Combination, skin_label: str | None, tag_label: str | None) -> str:
    """추천 사유(템플릿). LLM을 쓰지 않는다 — 근거가 된 숫자만 말한다.

    평균 별점·남는 예산은 넣지 않는다. 화면이 안(탭)마다 따로 보여 준다
    (`averageRating`, `remaining`) — 문장에 또 쓰면 같은 숫자가 두 번 나온다.
    """
    matched = sum(1 for c in combo.items if c.matched > 0)
    if skin_label and tag_label and matched:
        where = "모든 제품에" if matched == len(combo.items) else f"{matched}개 제품에"
        return f"{skin_label} 타입에 맞는 {tag_label} 성분이 {where} 들어 있어요"
    if skin_label:
        return f"{skin_label} 타입이 피해야 할 성분이 든 제품은 뺐어요"
    return "별점과 리뷰가 많은 제품으로 골랐어요"


# ── DB ───────────────────────────────────────────────────────


def _filtered(stmt, rule: SkinRule | None, req: BudgetGuideIn):
    """판매 중 단일제품 + 피부타입 기피 + 선호 조건 + 보유품 제외."""
    stmt = stmt.where(
        Product.status == "active",
        Product.composition == "single",
        Product.price > 0,
    )
    stmt = apply_exclusions(stmt, rule)
    # '무향'·'무알코올' 선호: 타입과 무관한 사실(product_skin_fit.has_fragrance·has_drying_alcohol)로 거른다
    if req.fragrance_free:
        stmt = stmt.where(~exists(has_fact(fragrance=True)))
    if req.alcohol_free:
        stmt = stmt.where(~exists(has_fact(alcohol=True)))
    if req.exclude_product_ids:
        stmt = stmt.where(Product.id.not_in(req.exclude_product_ids))
    return stmt


async def _load_candidates(
    db: AsyncSession, rule: SkinRule | None, req: BudgetGuideIn
) -> tuple[dict[str, list[Candidate]], dict[str, list[Candidate]]]:
    """(점수 상위, 점수 상위 + 최저가) 단계별 후보. row_number()로 한 번에 받는다.

    앞의 것으로 네 단계를 찾고, 못 찾으면(예산 부족) 뒤의 것으로 부분 루틴을 찾는다.
    """
    step = step_expr()
    score = product_score(rule)
    inner = (
        select(
            Product.id.label("id"),
            step.label("step"),
            Product.price.label("price"),
            Product.rating.label("rating"),
            score.label("score"),
            matched_count(rule).label("matched"),
            func.row_number()
            .over(partition_by=step, order_by=(score.desc(), Product.id))
            .label("rn"),
            func.row_number()
            .over(partition_by=step, order_by=(Product.price, Product.id))
            .label("rn_cheap"),
        )
        .join(Category, Category.id == Product.category_id)
        .where(step.is_not(None), Product.price <= req.budget_max)
    )
    sub = _filtered(inner, rule, req).subquery()
    rows = (
        await db.execute(
            select(sub).where(
                (sub.c.rn <= CANDIDATES_PER_STEP) | (sub.c.rn_cheap <= CHEAP_PER_STEP)
            )
        )
    ).all()

    top: dict[str, list[Candidate]] = {s.code: [] for s in ROUTINE}
    wide: dict[str, list[Candidate]] = {s.code: [] for s in ROUTINE}
    for r in rows:
        cand = Candidate(
            product_id=r.id,
            step=r.step,
            price=int(r.price),
            score=float(r.score),
            matched=int(r.matched or 0),
            rating=float(r.rating) if r.rating is not None else None,
        )
        wide[r.step].append(cand)
        if r.rn <= CANDIDATES_PER_STEP:
            top[r.step].append(cand)
    return top, wide


async def _min_possible_total(db: AsyncSession, rule: SkinRule | None, req: BudgetGuideIn) -> int | None:
    """예산과 무관하게 이 루틴을 살 수 있는 최저 합계. 한 단계라도 후보가 없으면 None."""
    step = step_expr()
    stmt = (
        select(step.label("step"), func.min(Product.price))
        .join(Category, Category.id == Product.category_id)
        .where(step.is_not(None))
        .group_by(step)
    )
    mins = dict((await db.execute(_filtered(stmt, rule, req))).all())
    if any(mins.get(s.code) is None for s in ROUTINE):
        return None
    return int(sum(mins[s.code] for s in ROUTINE))


def _focus_label(rule: SkinRule | None) -> str | None:
    """이 타입이 가장 필요로 하는 기능의 이름(예: 유리구슬 → '진정·장벽'). 추천 사유 문구에 쓴다."""
    if not rule:
        return None
    top = sorted(PREFER[rule.skin_type].items(), key=lambda kv: -kv[1])
    best = [f for f, w in top if w == top[0][1]]
    return "·".join(FUNC_NAMES[f] for f in best)


async def build_guide(db: AsyncSession, req: BudgetGuideIn, skin_type: str | None) -> BudgetGuideOut:
    # 순환 import를 피한다 — products API가 이 서비스를 쓰지는 않지만 _to_out은 거기 있다.
    from app.api.products import _to_out

    rule = await load_rule(db, skin_type)
    top, wide = await _load_candidates(db, rule, req)
    combos = search_combinations([top[s.code] for s in ROUTINE], req.budget_max)
    covered = len(ROUTINE) if combos else 0
    if not combos:
        # 예산이 모자란다 — 싼 후보까지 넣어 뒤쪽 단계부터 빼 가며 찾는다.
        covered, combos = search_partial([wide[s.code] for s in ROUTINE], req.budget_max)
    options = select_options(combos, req.budget_min, req.budget_max)

    out = BudgetGuideOut(
        combinations=[],
        budget_min=req.budget_min,
        budget_max=req.budget_max,
        skin_type=skin_type,
    )
    if covered < len(ROUTINE):
        out.missing_steps = [s.label for s in ROUTINE[covered:]]
        out.min_possible_total = await _min_possible_total(db, rule, req)
    if not options:
        return out

    ids = {c.product_id for _, combo, _ in options for c in combo.items}
    products = {
        p.id: p
        for p in await db.scalars(
            select(Product)
            .where(Product.id.in_(ids))
            .options(joinedload(Product.brand), joinedload(Product.category))
        )
    }
    skin_label = SKIN_TYPE_LABELS.get(skin_type) if skin_type else None
    tag_label = _focus_label(rule)

    for label, combo, below in options:
        ratings = [c.rating for c in combo.items if c.rating is not None]
        out.combinations.append(
            GuideCombinationOut(
                label=label,
                items=[
                    GuideItemOut(
                        step=c.step,
                        step_label=STEP_BY_CODE[c.step].label,
                        product=_to_out(products[c.product_id]),
                        matched_ingredients=c.matched,
                    )
                    for c in combo.items
                ],
                total=combo.total,
                remaining=req.budget_max - combo.total,
                average_rating=round(sum(ratings) / len(ratings), 2) if ratings else None,
                reason=build_reason(combo, skin_label, tag_label),
                below_range=below,
            )
        )
    return out
