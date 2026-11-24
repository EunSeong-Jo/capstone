"""CORS — Capacitor 앱 웹뷰가 서버 응답을 읽을 수 있는지.

앱은 화면을 `https://localhost`(Android) / `capacitor://localhost`(iOS)에서 열고 API는
배포 서버로 부른다. 서버가 그 origin을 허용하지 않으면 요청은 가지만 응답을 앱이
읽지 못해, 화면에는 "연결할 수 없어요"로만 보인다.
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio(loop_scope="session")

PREFLIGHT = {"Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization"}


@pytest.mark.parametrize("origin", ["https://localhost", "capacitor://localhost"])
async def test_app_origins_are_allowed(client: AsyncClient, origin: str) -> None:
    res = await client.options(
        "/api/v1/products", headers={"Origin": origin, **PREFLIGHT}
    )
    assert res.status_code == 200
    assert res.headers["access-control-allow-origin"] == origin


async def test_unknown_origin_is_not_allowed(client: AsyncClient) -> None:
    """허용 목록 밖의 origin에는 허용 헤더를 주지 않는다."""
    res = await client.options(
        "/api/v1/products", headers={"Origin": "https://evil.example", **PREFLIGHT}
    )
    assert "access-control-allow-origin" not in res.headers
