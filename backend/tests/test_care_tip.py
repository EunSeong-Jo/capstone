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
