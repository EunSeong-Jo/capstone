"""날씨 API (홈 화면 대시보드).

    GET /api/v1/weather   현재 날씨 (서울 고정)

MVP라 위치는 서울 좌표로 고정한다. 사용자 위치·주소 데이터가 아직 없어
개인화할 수 없다 — 프로필/주소 기능이 생기면 위경도를 요청 파라미터로 뺀다.

무효화 전략이 products.py와 다른 이유: 날씨는 우리가 갱신을 트리거하는
데이터가 아니라 시간에 따라 그냥 바뀌는 외부 데이터라, 버전 기반 무효화가
의미가 없다. TTL만으로 충분하다.
"""
from __future__ import annotations

from dataclasses import dataclass
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

    캐싱은 여기서 하지 않는다 — 호출부(엔드포인트)마다 캐싱 전략이 다르기
    때문이다(이 엔드포인트는 최종 응답 JSON을 10분 캐싱하고, care_tip.py는
    날짜 단위 캐시로 호출 빈도 자체를 억제한다). 그래서 이 함수는
    "캐시가 비어 있을 때만" 불린다.
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


@router.get("", response_model=WeatherOut, summary="현재 날씨 (서울 고정)")
async def get_weather(response: Response) -> WeatherOut | Response:
    cached = await cache_get(CACHE_KEY)
    if cached is not None:
        return Response(
            content=cached, media_type="application/json",
            headers={"Cache-Control": "public, max-age=300", "X-Cache": "HIT"},
        )

    snap = await fetch_weather_snapshot()
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
