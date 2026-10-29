"""피부 변화 리포트·오늘의 브리핑 (퍼스널 AI 4단계).

    GET /api/v1/me/skin-report   최근 두 번의 사진 분석 비교 + 그 사이 화장대 변화
    GET /api/v1/me/briefing      오늘 날씨 × 내 약한 항목 × 내 화장대 → 오늘 먼저 쓸 제품

둘 다 **로그인 사용자 본인의 기록**을 읽어 계산한다(저장하지 않는다 — 알림·경험치와 같은 원칙). 브리핑은 날씨가 한 시간 안에 크게
바뀌지 않는다고 보고 사용자·서울 날짜·날씨 구간별로 1시간 캐시한다.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime

import structlog
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.weather import SEOUL_TZ, get_day_outlook, get_weather_snapshot
from app.core.cache import cache_get, cache_set
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.insights import BriefingOut, SkinReportOut
from app.services import briefing as briefing_service
from app.services import personal_context, skin_report

router = APIRouter(prefix="/api/v1/me", tags=["insights"])
log = structlog.get_logger()

BRIEFING_TTL = 60 * 60
# 문장 규칙이 바뀌면 올린다(올리지 않으면 1시간 동안 예전 문장이 캐시에서 나온다)
BRIEFING_FORMAT = 3


def report_out(r: skin_report.SkinReport) -> SkinReportOut:
    return SkinReportOut(
        enough=r.enough, message=r.message, before_at=r.before_at, after_at=r.after_at, days=r.days, overall=r.overall,
        changes=[{"key": c.key, "name": c.name, "before": c.before, "after": c.after, "delta": c.delta, "trend": c.trend} for c in r.changes],
        added=[{"id": a.id, "name": a.name, "added_at": a.added_at} for a in r.added],
        notes=r.notes,
        timeline=[{"at": at, "average": avg} for at, avg in r.timeline],
        first_at=r.first_at, first_overall=r.first_overall, first_notes=r.first_notes,
        first_changes=[{"key": c.key, "name": c.name, "before": c.before, "after": c.after, "delta": c.delta, "trend": c.trend} for c in r.first_changes],
    )


@router.get("/skin-report", response_model=SkinReportOut, summary="피부 변화 리포트")
async def read_skin_report(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> SkinReportOut:
    return report_out(await skin_report.build_report(db, user.id))


async def _weather() -> dict:
    """현재 날씨와 오늘 예보. 못 가져와도 빈 값으로 — 브리핑은 날씨 없이도 나온다."""
    try:
        snap = await get_weather_snapshot()
    except Exception as exc:  # noqa: BLE001 — 키 없음(503)·장애
        log.info("briefing_weather_unavailable", error=str(exc)[:120])
        return {"has": False}
    try:
        outlook = await get_day_outlook()
    except Exception:  # noqa: BLE001
        outlook = None
    return {
        "has": True, "temp": snap.temperature, "humidity": snap.humidity, "label": snap.condition_label,
        "condition": snap.condition, "season": snap.season, "events": list(outlook.events) if outlook else [],
    }


async def build_briefing_out(db: AsyncSession, user_id, my_ingredients: list[str] | None = None) -> BriefingOut:
    w = await _weather()
    today = datetime.now(SEOUL_TZ).date().isoformat()
    snap = await personal_context.build_snapshot(db, user_id, my_ingredients or [])
    sig = hashlib.md5(json.dumps(
        [w.get("condition"), (w.get("temp") or 0) // 3, (w.get("humidity") or 0) // 10, w.get("events"),
         [e.id for e in snap.closet], snap.weak_concerns, snap.skin_type], ensure_ascii=False, default=str).encode()).hexdigest()[:12]
    key = f"briefing:f{BRIEFING_FORMAT}:{user_id}:{today}:{sig}"
    cached = await cache_get(key)
    if cached:
        try:
            return BriefingOut.model_validate_json(cached)
        except ValueError:
            pass
    b = briefing_service.compose(
        snap, temp=w.get("temp"), humidity=w.get("humidity"), label=w.get("label"), events=w.get("events"),
        condition=w.get("condition"), season=w.get("season"), has_weather=w["has"],
    )
    out = BriefingOut(
        date=today, headline=b.headline, reasons=b.reasons, tips=b.tips, pick=b.pick, missing=b.missing, weather=b.weather,
    )
    await cache_set(key, out.model_dump_json(by_alias=True), BRIEFING_TTL)
    return out


@router.get("/briefing", response_model=BriefingOut, summary="오늘의 개인 브리핑")
async def read_briefing(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> BriefingOut:
    return await build_briefing_out(db, user.id)
