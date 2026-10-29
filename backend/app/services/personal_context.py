"""개인 컨텍스트 — 챗봇이 "나"를 알게 하는 프로필 요약.

로그인한 사용자의 서버 데이터(피부타입, 최근 사진 분석, 예산, 화장대)와 기기에 있는 마이 성분을 모아
LLM 프롬프트에 넣을 한 덩어리 텍스트로 만든다. LLM이 막혔을 때의 규칙 기반 폴백도 같은 요약을 쓴다
(`services/chat_fallback.py`).

원칙
----
- **요약만 보낸다.** 이메일·얼굴 사진·원본 점수 JSON은 넣지 않는다. 사진 분석은 "신경 쓸 항목" 몇 개만.
- **사실은 계산에서 온다.** 제품의 주요 기능은 `product_analysis.function_strengths`(성분 라벨 기반)이고,
  LLM이 지어내지 않는다. 화장대에 없는 제품을 있다고 말하지 않도록 프롬프트가 목록을 한정한다.
- **길이 상한.** 프롬프트가 끝없이 길어지지 않게 글자 수로 자른다(약 600토큰). 넘치면 화장대 뒤쪽부터 뺀다.
- 비회원은 요약이 없다(`build_snapshot`을 부르지 않는다).

DB를 읽는 부분(`build_snapshot`)과 문장을 만드는 부분(`render`·`weak_concerns` 등)을 나눠, 뒤쪽은 DB 없이 단위 테스트한다.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.personal import ClosetItem
from app.models.product import Product
from app.models.skin_photo import SkinAnalysis
from app.models.user import Profile
from app.services.product_analysis import (
    CONCERN_FOCUS_BELOW,
    CONCERN_SPEC,
    function_strengths,
)
from app.services.similarity import FUNC_NAMES
from app.services.skin_fit import AVOID
from app.services.skin_type import SKIN_TYPE_LABELS

MAX_CLOSET = 12
MAX_MY_INGREDIENTS = 20
MAX_WEAK_CONCERNS = 4
# 약 600토큰. 한글은 글자당 1~1.5토큰이라 보수적으로 잡는다.
MAX_CHARS = 1400
# 제품의 "주요 기능"으로 말할 최소 강도(0~100)와 개수
FUNC_MIN_VALUE = 25
FUNC_TOP = 2

_AVOID_NAME = {"F": "향료", "L": "건조 알코올", "I": "자극 소지 성분"}
# 기피 플래그의 감점이 이 이상인 타입만 "피해야 할 성분"으로 말한다(3점짜리까지 나열하면 모두 피해야 하는 것처럼 보인다)
_AVOID_MIN_WEIGHT = 5


@dataclass(frozen=True)
class ClosetEntry:
    id: int
    name: str
    brand: str
    category: str
    price: int | None
    functions: tuple[str, ...] = ()


@dataclass(frozen=True)
class PersonalSnapshot:
    skin_type: str | None = None
    budget: tuple[int, int] | None = None
    # 최근 사진 분석에서 신경 쓸 항목 [(이름, 점수)] — 점수는 높을수록 건강하다
    weak_concerns: tuple[tuple[str, int], ...] = ()
    analysis_date: str | None = None            # 'YYYY-MM-DD' (서울 날짜가 아니라 기록 시각의 날짜)
    closet: tuple[ClosetEntry, ...] = ()
    closet_total: int = 0
    my_ingredients: tuple[str, ...] = ()
    avoid: tuple[str, ...] = field(default=())

    @property
    def skin_label(self) -> str | None:
        return SKIN_TYPE_LABELS.get(self.skin_type or "")

    @property
    def is_empty(self) -> bool:
        return not (self.skin_type or self.closet or self.weak_concerns or self.my_ingredients or self.budget)


# ── 순수 함수 (DB를 모른다) ───────────────────────────────────────────────


def weak_concerns(concerns: dict[str, int], limit: int = MAX_WEAK_CONCERNS) -> tuple[tuple[str, int], ...]:
    """사진 분석 항목 점수(높을수록 건강)에서 신경 쓸 항목(`CONCERN_FOCUS_BELOW` 미만)을 낮은 순으로.

    화장품 성분으로 바뀌기 어려운 항목(`need`가 빈 항목: 주름·처짐 등)은 뺀다 — 챗봇이 못 고칠 걸 고민거리로 말하지 않는다.
    """
    rows = []
    for key, score in concerns.items():
        spec = CONCERN_SPEC.get(key)
        if spec is None or not spec[2]:
            continue
        if score < CONCERN_FOCUS_BELOW:
            rows.append((spec[0], score))
    rows.sort(key=lambda r: r[1])
    return tuple(rows[:limit])


def avoid_labels(skin_type: str | None) -> tuple[str, ...]:
    """이 피부타입이 피해야 할 성분 종류. 감점이 큰 것만."""
    weights = AVOID.get(skin_type or "", {})
    flags = sorted((f for f, w in weights.items() if w >= _AVOID_MIN_WEIGHT), key=lambda f: -weights[f])
    return tuple(_AVOID_NAME[f] for f in flags if f in _AVOID_NAME)


def top_function_names(strengths: dict[str, dict]) -> tuple[str, ...]:
    """제품이 가장 잘하는 기능 이름 최대 `FUNC_TOP`개."""
    ranked = sorted(
        ((f, s["value"]) for f, s in strengths.items() if s["value"] >= FUNC_MIN_VALUE and f in FUNC_NAMES),
        key=lambda r: -r[1],
    )
    return tuple(FUNC_NAMES[f] for f, _ in ranked[:FUNC_TOP])


def clean_ingredients(names: list[str] | tuple[str, ...]) -> tuple[str, ...]:
    """기기에서 온 마이 성분: 공백 정리·중복 제거·개수와 길이 상한. 프롬프트에 들어가는 사용자 입력이라 짧게 자른다."""
    out: list[str] = []
    for n in names:
        s = " ".join(str(n).split())[:30]
        if s and s not in out:
            out.append(s)
        if len(out) >= MAX_MY_INGREDIENTS:
            break
    return tuple(out)


def _won(n: int) -> str:
    return f"{n // 10_000}만원" if n % 10_000 == 0 else f"{n:,}원"


def _closet_line(e: ClosetEntry) -> str:
    price = f", {e.price:,}원" if e.price else ""
    funcs = f" — {'·'.join(e.functions)}" if e.functions else ""
    return f"  · #{e.id} {e.name} ({e.category}{price}){funcs}"


def render(s: PersonalSnapshot) -> str:
    """프롬프트에 넣을 텍스트. 정보가 하나도 없으면 빈 문자열. `MAX_CHARS`를 넘으면 화장대 뒤쪽 제품부터 뺀다."""
    if s.is_empty:
        return ""
    head: list[str] = []
    if s.skin_label:
        head.append(f"- 피부타입: {s.skin_label}")
    if s.budget:
        head.append(f"- 화장대 예산: {_won(s.budget[0])} ~ {_won(s.budget[1])}")
    if s.weak_concerns:
        when = f"({s.analysis_date} 기준) " if s.analysis_date else ""
        items = ", ".join(f"{n} {sc}점" for n, sc in s.weak_concerns)
        head.append(f"- 최근 AI 사진 분석 {when}신경 쓸 부분: {items} (100점 만점, 낮을수록 신경 써야 함)")
    if s.avoid:
        head.append(f"- 피해야 할 성분: {', '.join(s.avoid)}")
    if s.my_ingredients:
        head.append(f"- 내가 관심 있는 성분(마이 성분): {', '.join(s.my_ingredients)}")

    lines = list(head)
    closet = list(s.closet)
    while True:
        body = list(lines)
        if closet:
            more = s.closet_total - len(closet)
            suffix = f", 그 밖에 {more}개 더" if more > 0 else ""
            body.append(f"- 내 화장대 ({s.closet_total}개{suffix}):")
            body.extend(_closet_line(e) for e in closet)
        else:
            body.append("- 내 화장대: 아직 등록한 제품이 없음")
        text = "\n".join(body)
        if len(text) <= MAX_CHARS or not closet:
            return text[:MAX_CHARS] if len(text) > MAX_CHARS else text
        closet.pop()


# ── DB 조회 ───────────────────────────────────────────────────────────────


def _concerns_of(metrics: dict | None) -> dict[str, int]:
    """`skin_analyses.metrics['concerns']` = {key: {'ui': 점수, ...}} → {key: 점수}."""
    out: dict[str, int] = {}
    for key, v in ((metrics or {}).get("concerns") or {}).items():
        ui = v.get("ui") if isinstance(v, dict) else None
        if isinstance(ui, (int, float)):
            out[key] = int(round(ui))
    return out


async def build_snapshot(
    db: AsyncSession,
    user_id: uuid.UUID,
    my_ingredients: list[str] | tuple[str, ...] = (),
) -> PersonalSnapshot:
    """로그인 사용자의 개인 요약. 읽기만 한다(쿼리 4개 안팎)."""
    # 순환 import를 피하려고 함수 안에서 가져온다(api.recommendations는 services를 읽는다).
    from app.api.recommendations import load_labeled_docs

    profile = await db.get(Profile, user_id)
    skin_type = profile.skin_type if profile else None
    budget = (
        (profile.budget_min, profile.budget_max)
        if profile and profile.budget_min is not None and profile.budget_max is not None
        else None
    )

    analysis = await db.scalar(
        select(SkinAnalysis).where(SkinAnalysis.user_id == user_id).order_by(SkinAnalysis.created_at.desc()).limit(1)
    )
    concerns = weak_concerns(_concerns_of(analysis.metrics)) if analysis else ()
    analysis_date = analysis.created_at.date().isoformat() if analysis else None

    in_closet = ClosetItem.user_id == user_id, ClosetItem.status != "removed"
    total = await db.scalar(select(func.count()).select_from(ClosetItem).where(*in_closet)) or 0
    products = (
        (
            await db.scalars(
                select(Product)
                .join(ClosetItem, ClosetItem.product_id == Product.id)
                .where(*in_closet)
                .order_by(ClosetItem.id.desc())
                .limit(MAX_CLOSET)
                .options(joinedload(Product.brand), joinedload(Product.category))
            )
        )
        .unique()
        .all()
    )

    entries: list[ClosetEntry] = []
    if products:
        docs, labels, _names, positions = await load_labeled_docs(db, [p.id for p in products])
        for p in products:
            funcs = top_function_names(function_strengths(docs.get(p.id, []), labels, positions.get(p.id)))
            entries.append(
                ClosetEntry(
                    id=p.id,
                    name=p.display_name or p.name,
                    brand=p.brand.name if p.brand else "",
                    category=(p.category.label or p.category.code) if p.category else "",
                    price=p.price,
                    functions=funcs,
                )
            )

    return PersonalSnapshot(
        skin_type=skin_type,
        budget=budget,
        weak_concerns=concerns,
        analysis_date=analysis_date,
        closet=tuple(entries),
        closet_total=int(total),
        my_ingredients=clean_ingredients(my_ingredients),
        avoid=avoid_labels(skin_type),
    )
