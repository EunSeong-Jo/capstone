"""피부 변화 리포트 — 사진 분석 기록의 변화를 내 화장대 변화와 함께 읽는다 (퍼스널 AI 4단계).

사진 분석(`skin_analyses`)은 쌓이기만 하고 해석되지 않았다. 이 모듈은 가장 최근 분석을 직전 분석과 견줘 **무엇이 좋아졌고 무엇이
나빠졌는지** 말하고, 그 사이에 내가 화장대에 **무엇을 더했는지**를 곁들인다.

정직하게 말하기
---------------
- **원인을 단정하지 않는다.** 두 분석 사이에 화장품을 더했다는 *사실*과 그 제품이 그 항목을 돕는 성분을 가졌다는 *사실*을 나란히 보여 줄 뿐,
  "그래서 좋아졌다"고 말하지 않는다("영향이 있었을 수 있어요 — 날씨·수면 등 다른 요인도 있어요").
- 점수는 높을수록 좋다(업체 기준, `services/product_analysis.py`의 사진 분석 항목). 변화 **±`TREND_MIN`점 미만은 '비슷해요'**로 말한다 —
  촬영 조건만 달라도 몇 점은 흔들린다.
- 비교할 분석이 2건 미만이면 비교하지 않고 "한 번 더 촬영하면 변화를 알려 드려요"라고 말한다.
- 사진 분석 항목 중 화장품 성분으로 바뀌기 어려운 것(눈가 구조 등)은 변화 목록에서 뺀다.

계산(`compare`·`narrative`)은 DB를 모르는 순수 함수라 단위 테스트한다. DB를 읽는 부분은 `build_report`다.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.personal import ClosetItem
from app.models.product import Product
from app.models.skin_photo import SkinAnalysis
from app.services.product_analysis import CONCERN_SPEC, function_strengths, josa
from app.services.similarity import FUNC_NAMES

# 이 점수 이상 달라야 '좋아졌다/나빠졌다'로 말한다
TREND_MIN = 3
# 화장대에 더한 제품이 항목을 돕는다고 볼 최소 기능 강도(0~100, `function_strengths`)
HELP_MIN = 30
MAX_ADDED = 6
MAX_LINKED = 2


@dataclass(frozen=True)
class Change:
    key: str
    name: str
    before: int
    after: int
    delta: int
    trend: str          # up(좋아짐) / down(나빠짐) / flat(비슷)


@dataclass(frozen=True)
class AddedProduct:
    id: int
    name: str
    added_at: datetime
    strengths: dict[str, int] = field(default_factory=dict)       # 기능 코드 → 0~100


@dataclass(frozen=True)
class Link:
    """변화가 있던 항목과, 그 기간에 화장대에 더한 제품 중 그 항목을 돕는 기능이 강한 제품(사실만 나란히 — 원인 단정 아님)."""
    concern: str
    trend: str
    product_id: int
    product_name: str
    added_at: datetime
    function: str


@dataclass
class SkinReport:
    enough: bool                                   # 비교할 분석이 2건 이상인가
    message: str
    before_at: datetime | None = None
    after_at: datetime | None = None
    days: int = 0
    changes: list[Change] = field(default_factory=list)
    overall: float | None = None                   # 비교 항목 평균 변화(점)
    added: list[AddedProduct] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    links: list[Link] = field(default_factory=list)
    timeline: list[tuple[datetime, int]] = field(default_factory=list)   # (분석 시각, 비교 항목 평균 점수)


# ── 순수 계산 ─────────────────────────────────────────────────────────────


def _improvable(key: str) -> bool:
    """화장품 성분으로 바뀔 수 있는 항목인가(눈가 구조 등은 제외)."""
    spec = CONCERN_SPEC.get(key)
    return bool(spec and spec[2])


def compare(before: dict[str, int], after: dict[str, int]) -> list[Change]:
    """두 분석에 모두 있는, 바뀔 수 있는 항목의 변화. 변화가 큰 순(같으면 이름순)."""
    out: list[Change] = []
    for key in before.keys() & after.keys():
        if not _improvable(key):
            continue
        delta = after[key] - before[key]
        trend = "up" if delta >= TREND_MIN else "down" if delta <= -TREND_MIN else "flat"
        out.append(Change(key, CONCERN_SPEC[key][0], before[key], after[key], delta, trend))
    return sorted(out, key=lambda c: (-abs(c.delta), c.name))


def average(concerns: dict[str, int]) -> int | None:
    """바뀔 수 있는 항목의 평균 점수. 항목이 없으면 None."""
    vals = [v for k, v in concerns.items() if _improvable(k)]
    return round(sum(vals) / len(vals)) if vals else None


def helps(change: Change, product: AddedProduct) -> str | None:
    """이 제품이 그 항목을 돕는 기능을 충분히 가졌으면 그 기능 이름. 아니면 None."""
    best: tuple[int, str] | None = None
    for f in CONCERN_SPEC[change.key][2]:
        v = product.strengths.get(f, 0)
        if v >= HELP_MIN and (best is None or v > best[0]):
            best = (v, FUNC_NAMES.get(f, f))
    return best[1] if best else None


def _date(d: datetime) -> str:
    return f"{d.month}월 {d.day}일"


def link_products(changes: list[Change], added: list[AddedProduct]) -> list[Link]:
    """변화가 있던 항목마다, 그 사이에 더한 제품 중 그 항목을 돕는 성분이 강한 것 하나(최대 `MAX_LINKED`개)."""
    out: list[Link] = []
    for c in [c for c in changes if c.trend == "up"] + [c for c in changes if c.trend == "down"]:
        if len(out) >= MAX_LINKED:
            break
        hit = [(p, f) for p in added if (f := helps(c, p))]
        if hit:
            p, f = hit[0]
            out.append(Link(c.name, c.trend, p.id, p.name, p.added_at, f))
    return out


def narrative(changes: list[Change], added: list[AddedProduct], before_at: datetime, after_at: datetime) -> list[str]:
    """변화를 사실 문장으로. 원인을 단정하지 않는다."""
    days = max((after_at.date() - before_at.date()).days, 0)
    span = f"{_date(before_at)} → {_date(after_at)}" + (f"({days}일)" if days else "(같은 날)")
    ups = [c for c in changes if c.trend == "up"]
    downs = [c for c in changes if c.trend == "down"]
    notes = [f"{span} 사이의 변화예요."]
    if ups:
        notes.append("좋아진 항목: " + ", ".join(f"{c.name} {c.before}→{c.after}(+{c.delta})" for c in ups[:4]))
    if downs:
        notes.append("신경 쓸 항목: " + ", ".join(f"{c.name} {c.before}→{c.after}({c.delta})" for c in downs[:4]))
    if not ups and not downs:
        notes.append("눈에 띄는 변화는 없어요. 비슷하게 유지되고 있어요.")

    for ln in link_products(changes, added):
        verb = "좋아진" if ln.trend == "up" else "떨어진"
        notes.append(
            f"{josa(ln.concern, '이가')} {verb} 기간에 {ln.function} 성분이 강한 '{ln.product_name}'{josa(ln.product_name, '을를')[len(ln.product_name):]} "
            f"{_date(ln.added_at)}에 화장대에 더했어요. 영향이 있었을 수 있어요(날씨·수면·촬영 조건 같은 다른 요인도 있어요)."
        )
    return notes


# ── DB 조회 ───────────────────────────────────────────────────────────────


def _concerns_of(metrics: dict | None) -> dict[str, int]:
    out: dict[str, int] = {}
    for key, v in ((metrics or {}).get("concerns") or {}).items():
        ui = v.get("ui") if isinstance(v, dict) else None
        if isinstance(ui, (int, float)):
            out[key] = int(round(ui))
    return out


async def build_report(
    db: AsyncSession, user_id: uuid.UUID, from_id: uuid.UUID | None = None, to_id: uuid.UUID | None = None
) -> SkinReport:
    """기본은 최근 분석과 **바로 이전** 분석의 비교. `from_id`·`to_id`를 주면 그 두 분석(본인 것)만 견준다."""
    if from_id is not None and to_id is not None:
        return await _build_between(db, user_id, from_id, to_id)
    rows = list(
        (
            await db.scalars(
                select(SkinAnalysis).where(SkinAnalysis.user_id == user_id).order_by(SkinAnalysis.created_at.desc()).limit(12)
            )
        ).all()
    )
    if len(rows) < 2:
        return SkinReport(
            enough=False,
            message="사진 분석이 한 번뿐이라 아직 비교할 수 없어요. 한 번 더 촬영하면 변화를 알려 드려요." if rows
            else "아직 사진 분석 기록이 없어요. AI 피부관리에서 촬영하면 변화를 알려 드려요.",
        )

    latest = rows[0]
    # 직전 분석: 바로 이전에 찍은 분석
    prev = rows[1]
    changes = compare(_concerns_of(prev.metrics), _concerns_of(latest.metrics))
    if not changes:
        return SkinReport(enough=False, message="두 분석에 함께 있는 항목이 없어 비교할 수 없어요.")

    added = await _added_between(db, user_id, prev.created_at, latest.created_at)
    timeline = _timeline_of(rows)

    report = SkinReport(
        enough=True,
        message="최근 사진 분석을 견줘 봤어요.",
        before_at=prev.created_at,
        after_at=latest.created_at,
        days=max((latest.created_at.date() - prev.created_at.date()).days, 0),
        changes=changes,
        overall=round(sum(c.delta for c in changes) / len(changes), 1),
        added=added,
        notes=narrative(changes, added, prev.created_at, latest.created_at),
        links=link_products(changes, added),
        timeline=timeline,
    )
    return report


def _timeline_of(rows: list[SkinAnalysis]) -> list[tuple[datetime, int]]:
    """(분석 시각, 바뀔 수 있는 항목의 평균 점수) 오래된 것부터."""
    out: list[tuple[datetime, int]] = []
    for r in reversed(rows):
        avg = average(_concerns_of(r.metrics))
        if avg is not None:
            out.append((r.created_at, avg))
    return out


async def _timeline(db: AsyncSession, user_id: uuid.UUID) -> list[tuple[datetime, int]]:
    rows = (
        await db.scalars(select(SkinAnalysis).where(SkinAnalysis.user_id == user_id).order_by(SkinAnalysis.created_at.desc()).limit(12))
    ).all()
    return _timeline_of(list(rows))


async def _build_between(db: AsyncSession, user_id: uuid.UUID, a_id: uuid.UUID, b_id: uuid.UUID) -> SkinReport:
    if a_id == b_id:
        return SkinReport(enough=False, message="서로 다른 두 분석을 골라 주세요.")
    rows = list(
        (await db.scalars(select(SkinAnalysis).where(SkinAnalysis.user_id == user_id, SkinAnalysis.id.in_([a_id, b_id])))).all()
    )
    if len(rows) != 2:
        return SkinReport(enough=False, message="고른 분석을 찾을 수 없어요.")
    before, after = sorted(rows, key=lambda r: r.created_at)
    changes = compare(_concerns_of(before.metrics), _concerns_of(after.metrics))
    if not changes:
        return SkinReport(enough=False, message="두 분석에 함께 있는 항목이 없어 비교할 수 없어요.")
    added = await _added_between(db, user_id, before.created_at, after.created_at)
    return SkinReport(
        enough=True,
        message="고른 두 분석을 견줘 봤어요.",
        before_at=before.created_at,
        after_at=after.created_at,
        days=max((after.created_at.date() - before.created_at.date()).days, 0),
        changes=changes,
        overall=round(sum(c.delta for c in changes) / len(changes), 1),
        added=added,
        notes=narrative(changes, added, before.created_at, after.created_at),
        links=link_products(changes, added),
        timeline=await _timeline(db, user_id),
    )


async def _added_between(db: AsyncSession, user_id: uuid.UUID, start: datetime, end: datetime) -> list[AddedProduct]:
    """두 시각 사이에 화장대에 더한 제품(지금도 화장대에 있는 것)과 각 제품의 기능 강도."""
    # 순환 import를 피하려고 지금 가져온다(api 계층이 services를 읽는다)
    from app.api.recommendations import load_labeled_docs

    products = (
        await db.execute(
            select(Product, ClosetItem.added_at)
            .join(ClosetItem, ClosetItem.product_id == Product.id)
            .where(
                ClosetItem.user_id == user_id,
                ClosetItem.status != "removed",
                ClosetItem.added_at > start,
                ClosetItem.added_at <= end,
            )
            .order_by(ClosetItem.added_at.desc())
            .limit(MAX_ADDED)
        )
    ).all()
    if not products:
        return []
    docs, labels, _names, positions = await load_labeled_docs(db, [p.id for p, _ in products])
    out: list[AddedProduct] = []
    for p, at in products:
        strengths = function_strengths(docs.get(p.id, []), labels, positions.get(p.id))
        out.append(AddedProduct(p.id, p.display_name or p.name, at, {f: v["value"] for f, v in strengths.items()}))
    return out
