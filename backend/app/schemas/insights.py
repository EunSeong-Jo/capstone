"""피부 변화 리포트·오늘의 브리핑 응답 (퍼스널 AI 4단계)."""
from __future__ import annotations

from datetime import datetime

from app.schemas.product import _CamelModel


class ChangeOut(_CamelModel):
    key: str
    name: str
    before: int
    after: int
    delta: int
    trend: str                       # up / down / flat


class AddedProductOut(_CamelModel):
    id: int
    name: str
    added_at: datetime


class LinkOut(_CamelModel):
    concern: str
    trend: str
    product_id: int
    product_name: str
    added_at: datetime
    function: str


class TimelinePoint(_CamelModel):
    at: datetime
    average: int


class SkinReportOut(_CamelModel):
    enough: bool
    message: str
    before_at: datetime | None = None
    after_at: datetime | None = None
    days: int = 0
    overall: float | None = None
    changes: list[ChangeOut] = []
    added: list[AddedProductOut] = []
    notes: list[str] = []
    links: list[LinkOut] = []
    timeline: list[TimelinePoint] = []


class BriefingPick(_CamelModel):
    id: int
    name: str
    brand: str
    function: str
    why: str


class BriefingWeather(_CamelModel):
    label: str | None = None
    temperature: int | None = None
    humidity: int | None = None


class BriefingOut(_CamelModel):
    date: str                        # 서울 기준 YYYY-MM-DD
    headline: str
    reasons: list[str] = []
    tips: list[str] = []
    pick: BriefingPick | None = None
    missing: str | None = None
    weather: BriefingWeather | None = None
