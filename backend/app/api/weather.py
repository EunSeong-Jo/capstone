"""날씨 API (홈 화면 대시보드).

    GET /api/v1/weather   현재 날씨 (서울 고정)

MVP라 위치는 서울 좌표로 고정한다. 사용자 위치·주소 데이터가 아직 없어
개인화할 수 없다 — 프로필/주소 기능이 생기면 위경도를 요청 파라미터로 뺀다.

무효화 전략이 products.py와 다른 이유: 날씨는 우리가 갱신을 트리거하는
데이터가 아니라 시간에 따라 그냥 바뀌는 외부 데이터라, 버전 기반 무효화가
의미가 없다. TTL만으로 충분하다.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

import httpx
import structlog
from fastapi import APIRouter, HTTPException, Response

from app.config import settings
from app.core.cache import cache_get, cache_set
from app.schemas.weather import WeatherOut

router = APIRouter(prefix="/api/v1/weather", tags=["weather"])
log = structlog.get_logger()

SEOUL_LAT, SEOUL_LON = 37.5665, 126.9780
SEOUL_TZ = ZoneInfo("Asia/Seoul")
CACHE_TTL = 600  # 10분 — 날씨는 자주 안 바뀌고, 무료 API 호출 한도(60회/분)도 아낀다
CACHE_KEY = "weather:seoul:v1"
# 스냅숏 자체의 캐시. /weather는 최종 응답을, care_tip은 스냅숏을 쓰므로 따로 둔다.
SNAPSHOT_KEY = "weather:snapshot:v1"

# OpenWeatherMap 'weather[0].main' → 우리 WeatherCondition.
# 맵에 없는 값(Mist/Fog/Haze/Squall 등 저빈도 대기 현상)은 cloudy로 뭉갠다.
_CONDITION_MAP = {
    "Clear": "sunny",
    "Clouds": "cloudy",
    "Rain": "rainy",
    "Drizzle": "rainy",
    "Thunderstorm": "rainy",
    "Snow": "snowy",
}
_WINDY_THRESHOLD_MS = 8.0  # 초속 8m ≈ 시속 29km. 비·눈보다는 덜 급하다고 보고 그 둘엔 덮어쓰지 않는다

_SEASON_BY_MONTH = {
    3: ("spring", "봄"), 4: ("spring", "봄"), 5: ("spring", "봄"),
    6: ("summer", "여름"), 7: ("summer", "여름"), 8: ("summer", "여름"),
    9: ("autumn", "가을"), 10: ("autumn", "가을"), 11: ("autumn", "가을"),
    12: ("winter", "겨울"), 1: ("winter", "겨울"), 2: ("winter", "겨울"),
}


def _map_condition(main: str, wind_speed: float) -> str:
    base = _CONDITION_MAP.get(main, "cloudy")
    if base in ("sunny", "cloudy") and wind_speed >= _WINDY_THRESHOLD_MS:
        return "windy"
    return base


@dataclass
class WeatherSnapshot:
    """OpenWeatherMap 원본 응답에서 뽑아낸 값 모음.

    이 엔드포인트(WeatherOut 응답)뿐 아니라 care_tip.py의 AI 프롬프트도
    이 스냅샷을 그대로 재사용한다 — 같은 외부 API를 두 곳에서 각자 다르게
    파싱하지 않기 위해서다.
    """

    condition: str
    condition_label: str
    icon: str
    temperature: int
    feels_like: int
    temp_min: int
    temp_max: int
    humidity: int | None
    clouds: int
    season: str
    season_label: str


async def fetch_weather_snapshot() -> WeatherSnapshot:
    """OpenWeatherMap Current Weather API를 직접 호출한다.

    캐싱은 여기서 하지 않는다 — 호출부는 캐시를 거치는
    `get_weather_snapshot()`을 쓴다. 그래서 이 함수는 "캐시가 비어 있을
    때만" 불린다.
    """
    if not settings.OPENWEATHER_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="날씨 API 키가 설정되지 않았습니다 (OPENWEATHER_API_KEY).",
        )

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                "https://api.openweathermap.org/data/2.5/weather",
                params={
                    "lat": SEOUL_LAT,
                    "lon": SEOUL_LON,
                    "appid": settings.OPENWEATHER_API_KEY,
                    "units": "metric",
                    "lang": "kr",
                },
            )
    except httpx.HTTPError as exc:
        log.warning("openweather_unreachable", error=str(exc)[:200])
        raise HTTPException(status_code=502, detail="날씨 정보를 가져오지 못했습니다.") from exc

    if resp.status_code != 200:
        log.warning("openweather_failed", status=resp.status_code, body=resp.text[:200])
        raise HTTPException(status_code=502, detail="날씨 정보를 가져오지 못했습니다.")

    data = resp.json()
    main = data["weather"][0]["main"]
    wind_speed = data.get("wind", {}).get("speed", 0.0)
    # 서버가 어느 시간대에서 돌든(Docker는 보통 UTC) 계절·날짜 캐시 키는
    # 항상 서울 기준으로 굴러야 한다 — 서비스가 서울 고정이라서다.
    season, season_label = _SEASON_BY_MONTH[datetime.now(SEOUL_TZ).month]
    m = data["main"]

    return WeatherSnapshot(
        condition=_map_condition(main, wind_speed),
        condition_label=data["weather"][0]["description"],
        icon=data["weather"][0]["icon"],
        temperature=round(m["temp"]),
        feels_like=round(m["feels_like"]),
        temp_min=round(m["temp_min"]),
        temp_max=round(m["temp_max"]),
        humidity=m.get("humidity"),
        clouds=data.get("clouds", {}).get("all", 0),
        season=season,
        season_label=season_label,
    )


async def get_weather_snapshot() -> WeatherSnapshot:
    """캐시를 거치는 스냅숏. 비었을 때만 OpenWeather를 부른다.

    care_tip은 캐시 키에 날씨(condition)가 들어가서, 자기 캐시를 보기 전에
    스냅숏부터 알아야 한다. 예전에는 그 때문에 케어 문구를 열 때마다
    OpenWeather를 직접 불렀다(캐시가 맞아도 0.3초, 무료 호출 한도 소모).
    """
    cached = await cache_get(SNAPSHOT_KEY)
    if cached is not None:
        try:
            return WeatherSnapshot(**json.loads(cached))
        except (TypeError, ValueError):
            pass  # 필드가 바뀐 옛 캐시는 버리고 새로 받는다
    snap = await fetch_weather_snapshot()
    await cache_set(SNAPSHOT_KEY, json.dumps(asdict(snap), ensure_ascii=False), CACHE_TTL)
    return snap


# ── 오늘 하루 예보 ───────────────────────────────────────────
# 현재 날씨(`/weather`)의 min/max는 관측소의 지금 값이라 '오늘의 최저·최고'가 아니다. 케어 문구는
# "지금"이 아니라 **오늘 하루에 일어날 일**(비·눈·강풍·일교차…)을 보고 써야 하므로 3시간 간격
# 예보(`/forecast`, 무료)에서 오늘 구간을 모아 요약한다.

OUTLOOK_KEY = "weather:outlook:v1"
OUTLOOK_TTL = 1800  # 30분 — 하루 단위 요약이라 현재 날씨보다 느슨해도 된다
_RAINY = {"Rain", "Drizzle", "Thunderstorm"}
_POP_RAIN = 0.6            # 강수확률이 이 이상이면 비로 본다
_GUST_MS = 12.0            # 돌풍 기준(초속)
_RANGE_DEG = 10            # 일교차 기준
_HOT, _COLD = 30, 0        # 더위·추위 기준(최고·최저)
_DRY_HUMIDITY = 35         # 건조 기준(평균 습도)


@dataclass
class DayOutlook:
    """오늘 하루 예보 요약. `events`는 케어 문구가 중심으로 삼을 특이 날씨(없으면 빈 목록)."""

    temp_min: int
    temp_max: int
    pop_max: int                # 강수확률 최대(%)
    humidity_avg: int | None
    events: list[str]


def _hour_label(h: int) -> str:
    h %= 24
    if h == 0:
        return "자정"
    return f"오전 {h}시" if h < 12 else f"오후 {h - 12 or 12}시"


def _window(hours: list[int]) -> str:
    """예보 칸(3시간)의 시작 시각들 → '오후 3시~오후 6시'."""
    return f"{_hour_label(min(hours))}~{_hour_label(max(hours) + 3)}"


def summarize_day(entries: list[dict], today) -> DayOutlook | None:
    """3시간 예보 목록 → 오늘 하루 요약.

    오늘 칸이 너무 적으면(늦은 밤에 부른 경우) 앞으로 24시간을 쓴다.
    """
    def local(e: dict) -> datetime:
        return datetime.fromtimestamp(e["dt"], SEOUL_TZ)

    day = [e for e in entries if local(e).date() == today]
    if len(day) < 3:
        day = entries[:8]
    if not day:
        return None

    temps = [e["main"]["temp"] for e in day]
    t_min, t_max = round(min(temps)), round(max(temps))
    pop = max(float(e.get("pop", 0.0)) for e in day)
    hums = [e["main"]["humidity"] for e in day if "humidity" in e["main"]]
    hum = round(sum(hums) / len(hums)) if hums else None

    def hours_of(pred) -> list[int]:
        return [local(e).hour for e in day if pred(e)]

    events: list[str] = []
    snow = hours_of(lambda e: e["weather"][0]["main"] == "Snow")
    rain = hours_of(lambda e: e["weather"][0]["main"] in _RAINY or float(e.get("pop", 0.0)) >= _POP_RAIN)
    if snow:
        events.append(f"눈({_window(snow)})")
    if rain and not snow:
        events.append(f"비({_window(rain)}, 강수확률 {round(pop * 100)}%)")
    wind = hours_of(
        lambda e: e.get("wind", {}).get("speed", 0.0) >= _WINDY_THRESHOLD_MS
        or e.get("wind", {}).get("gust", 0.0) >= _GUST_MS
    )
    if wind:
        events.append(f"강풍({_window(wind)})")
    if t_max >= _HOT:
        events.append(f"더위(최고 {t_max}도)")
    if t_min <= _COLD:
        events.append(f"추위(최저 {t_min}도)")
    if t_max - t_min >= _RANGE_DEG:
        events.append(f"일교차 {t_max - t_min}도(최저 {t_min}~최고 {t_max}도)")
    if hum is not None and hum <= _DRY_HUMIDITY:
        events.append(f"건조(습도 {hum}%)")

    return DayOutlook(
        temp_min=t_min, temp_max=t_max, pop_max=round(pop * 100), humidity_avg=hum, events=events,
    )


async def get_day_outlook() -> DayOutlook | None:
    """오늘 하루 예보 요약(캐시). **실패하면 None** — 예보가 없어도 케어 문구는 현재 날씨로 만든다."""
    cached = await cache_get(OUTLOOK_KEY)
    if cached is not None:
        try:
            return DayOutlook(**json.loads(cached))
        except (TypeError, ValueError):
            pass
    if not settings.OPENWEATHER_API_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                "https://api.openweathermap.org/data/2.5/forecast",
                params={
                    "lat": SEOUL_LAT, "lon": SEOUL_LON, "appid": settings.OPENWEATHER_API_KEY,
                    "units": "metric", "lang": "kr", "cnt": 16,
                },
            )
        if resp.status_code != 200:
            log.warning("openweather_forecast_failed", status=resp.status_code, body=resp.text[:200])
            return None
        outlook = summarize_day(resp.json().get("list", []), datetime.now(SEOUL_TZ).date())
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        log.warning("openweather_forecast_unreachable", error=str(exc)[:200])
        return None
    if outlook is not None:
        await cache_set(OUTLOOK_KEY, json.dumps(asdict(outlook), ensure_ascii=False), OUTLOOK_TTL)
    return outlook


@router.get("", response_model=WeatherOut, summary="현재 날씨 (서울 고정)")
async def get_weather(response: Response) -> WeatherOut | Response:
    cached = await cache_get(CACHE_KEY)
    if cached is not None:
        return Response(
            content=cached, media_type="application/json",
            headers={"Cache-Control": "public, max-age=300", "X-Cache": "HIT"},
        )

    snap = await get_weather_snapshot()
    result = WeatherOut(
        condition=snap.condition,
        condition_label=snap.condition_label,
        icon=snap.icon,
        temperature=snap.temperature,
        season=snap.season,
        season_label=snap.season_label,
        humidity=snap.humidity,
    )

    await cache_set(CACHE_KEY, result.model_dump_json(by_alias=True), CACHE_TTL)
    response.headers["Cache-Control"] = "public, max-age=300"
    response.headers["X-Cache"] = "MISS"
    return result
