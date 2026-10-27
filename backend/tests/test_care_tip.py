"""오늘의 케어 문구 API 계약 테스트.

실제 LLM·OpenWeatherMap 호출은 외부 의존성이라 테스트에서 하지 않는다.
여기서는 입력 검증과, 날씨 조회가 실패했을 때(키 없음) 500으로 새지
않고 그 원인(503)이 그대로 올라오는지만 확인한다.
"""
from __future__ import annotations

import json
from dataclasses import asdict

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_unknown_skin_type_returns_400(client: AsyncClient) -> None:
    res = await client.get("/api/v1/care-tip", params={"skinType": "no_such_type"})
    assert res.status_code == 400


async def test_missing_weather_api_key_propagates_503(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """날씨 조회(fetch_weather_snapshot)가 실패하면 케어 문구도 만들 수 없다.

    LLM을 부르기도 전에(캐시 키를 만들려면 오늘 날씨 condition이 필요) 막혀야
    한다 — 불필요한 LLM 호출(비용)을 막는 것도 이 테스트의 목적이다.
    """
    async def _cache_miss(_key: str) -> None:
        return None

    # 날씨 스냅숏은 Redis에 캐시된다. 다른 실행이 채워 뒀으면 키 없는 경로까지
    # 가지 못하므로 캐시를 비운 것처럼 만든다(test_weather.py와 같은 이유).
    monkeypatch.setattr("app.api.weather.cache_get", _cache_miss)
    monkeypatch.setattr("app.api.care_tip.cache_get", _cache_miss)      # 오늘 문구가 이미 있으면 날씨를 안 본다
    monkeypatch.setattr("app.api.weather.settings.OPENWEATHER_API_KEY", "")
    res = await client.get("/api/v1/care-tip", params={"skinType": "ondalsam"})
    assert res.status_code == 503


async def test_cached_snapshot_skips_openweather(monkeypatch: pytest.MonkeyPatch) -> None:
    """스냅숏이 캐시에 있으면 OpenWeather를 부르지 않는다.

    예전에는 케어 문구를 열 때마다 캐시를 보기도 전에 OpenWeather를 불렀다.
    """
    from app.api import weather

    snap = weather.WeatherSnapshot(
        condition="sunny", condition_label="맑음", icon="01d", temperature=20,
        feels_like=20, temp_min=15, temp_max=24, humidity=40, clouds=0,
        season="autumn", season_label="가을",
    )

    async def _hit(key: str) -> str | None:
        return json.dumps(asdict(snap)) if key == weather.SNAPSHOT_KEY else None

    async def _must_not_fetch() -> None:
        raise AssertionError("캐시가 있는데 OpenWeather를 불렀다")

    monkeypatch.setattr("app.api.weather.cache_get", _hit)
    monkeypatch.setattr("app.api.weather.fetch_weather_snapshot", _must_not_fetch)
    assert await weather.get_weather_snapshot() == snap


async def test_tip_is_fixed_for_the_day_regardless_of_weather(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """오늘 문구가 캐시에 있으면 날씨가 어떻든(조회가 실패해도) 같은 문구를 낸다."""
    from app.api import care_tip

    stored = json.dumps({"tip": "오늘의 고정 문구예요 ✨"}, ensure_ascii=False)

    async def _hit(key: str) -> str | None:
        return stored if key == care_tip._cache_key("ondalsam") else None

    async def _must_not_ask_weather():
        raise AssertionError("문구가 캐시에 있는데 날씨를 조회했다")

    monkeypatch.setattr("app.api.care_tip.cache_get", _hit)
    monkeypatch.setattr("app.api.care_tip.get_weather_snapshot", _must_not_ask_weather)
    res = await client.get("/api/v1/care-tip", params={"skinType": "ondalsam"})
    assert res.status_code == 200 and res.json()["tip"] == "오늘의 고정 문구예요 ✨"
    assert res.headers["x-cache"] == "HIT"


# ── 오늘 하루 예보 요약 ─────────────────────────────────────────

def _slot(hour: int, temp: float, main: str = "Clouds", pop: float = 0.0, wind: float = 2.0, hum: int = 60) -> dict:
    from datetime import datetime

    from app.api.weather import SEOUL_TZ

    dt = int(datetime(2026, 10, 23, hour, tzinfo=SEOUL_TZ).timestamp())
    return {"dt": dt, "main": {"temp": temp, "humidity": hum}, "weather": [{"main": main}], "pop": pop, "wind": {"speed": wind}}


async def test_outlook_picks_rain_with_time_window_and_range() -> None:
    from datetime import date

    from app.api.weather import summarize_day

    day = [
        _slot(9, 12), _slot(12, 17), _slot(15, 21, "Rain", 0.8), _slot(18, 19, "Rain", 0.9), _slot(21, 15),
    ]
    out = summarize_day(day, date(2026, 10, 23))
    assert out is not None
    assert (out.temp_min, out.temp_max, out.pop_max) == (12, 21, 90)
    assert any(e.startswith("비(오후 3시~오후 9시") for e in out.events)
    assert not any(e.startswith("일교차") for e in out.events)        # 9도 < 기준


async def test_outlook_flags_wind_range_and_dry_but_prefers_snow_over_rain() -> None:
    from datetime import date

    from app.api.weather import summarize_day

    day = [_slot(6, 2, hum=30), _slot(9, 5, wind=9, hum=30), _slot(12, 13, "Snow", 0.7, hum=30), _slot(15, 12, hum=30)]
    out = summarize_day(day, date(2026, 10, 23))
    assert out is not None
    kinds = [e.split("(")[0].split(" ")[0] for e in out.events]
    assert "눈" in kinds and "비" not in kinds
    assert "강풍" in kinds and "일교차" in kinds and "건조" in kinds


async def test_outlook_without_events_and_with_late_night_fallback() -> None:
    from datetime import date

    from app.api.weather import summarize_day

    calm = [_slot(9, 15), _slot(12, 18), _slot(15, 19)]
    assert summarize_day(calm, date(2026, 10, 23)).events == []         # type: ignore[union-attr]
    # 오늘 칸이 3개 미만이면(늦은 밤) 앞으로 24시간을 본다
    late = [_slot(21, 10)] + [_slot(h, 10, "Rain", 0.9) for h in (0, 3, 6)]
    out = summarize_day(late, date(2026, 10, 23))
    assert out is not None and any(e.startswith("비") for e in out.events)
    assert summarize_day([], date(2026, 10, 23)) is None
