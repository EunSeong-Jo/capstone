"""날씨 API 계약 테스트.

실제 OpenWeatherMap 호출은 외부 의존성이라 테스트에서 하지 않는다.
여기서는 "키가 없을 때 외부 호출 없이 502/500이 아니라 명확한 503을
낸다"는 계약만 검증한다 — 프론트(useWeather)가 이 실패를 잡아 목업으로
폴백하므로, 최소한 500으로 새서 예상 밖의 오류 처리를 타면 안 된다.
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_weather_without_api_key_returns_503(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("app.api.weather.settings.OPENWEATHER_API_KEY", "")
    res = await client.get("/api/v1/weather")
    assert res.status_code == 503
    assert "OPENWEATHER_API_KEY" in res.json()["detail"]
