"""오늘의 케어 문구 API 계약 테스트.

실제 LLM·OpenWeatherMap 호출은 외부 의존성이라 테스트에서 하지 않는다.
여기서는 입력 검증과, 날씨 조회가 실패했을 때(키 없음) 500으로 새지
않고 그 원인(503)이 그대로 올라오는지만 확인한다.
"""
from __future__ import annotations

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
    monkeypatch.setattr("app.api.weather.settings.OPENWEATHER_API_KEY", "")
    res = await client.get("/api/v1/care-tip", params={"skinType": "ondalsam"})
    assert res.status_code == 503
