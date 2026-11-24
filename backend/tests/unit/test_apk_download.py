"""로그인 화면 '앱 설치하기'(/swappy.apk) — APK는 GitHub Releases에 있고, 서버는 그쪽으로 넘겨 준다.

이미 배포된 링크와 QR 코드가 `/swappy.apk`를 가리키므로 이 경로는 사라지면 안 된다.
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.config import settings


@pytest.mark.asyncio(loop_scope="session")
async def test_apk_path_redirects_to_the_release_asset(client: AsyncClient):
    res = await client.get("/swappy.apk", follow_redirects=False)
    assert res.status_code == 302
    assert res.headers["location"] == settings.APK_DOWNLOAD_URL
    assert settings.APK_DOWNLOAD_URL.endswith("/releases/download/assets/swappy.apk")
