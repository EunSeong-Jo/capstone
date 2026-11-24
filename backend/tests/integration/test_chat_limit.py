"""챗봇 비회원 호출 제한 (`POST /api/v1/chat`).

이 파일은 **DB·Redis가 필요한 쪽**(tests/integration)이다. DB 없이 도는 테스트는 `tests/unit/test_chat_limit.py`에 있다.

LLM·RAG·날씨는 대신 넣는다 — 여기서는 제한 계약만 본다.
횟수는 실제 Redis에 센다. 테스트마다 다른 IP(X-Forwarded-For)를 써서 서로,
그리고 실제 사용자 카운터와 섞이지 않게 한다.
"""
from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import delete

from app.config import settings
from app.db.session import AsyncSessionLocal
from app.models.user import User

pytestmark = pytest.mark.asyncio(loop_scope="session")

URL = "/api/v1/chat"
BODY = {"message": "토너 추천해 줘", "history": []}


@pytest.fixture(autouse=True)
def _fake_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _reply(_messages: list[dict], _system: str, *args, **kwargs) -> str:
        return "답변"

    async def _products(*_args, **_kwargs) -> list[dict]:
        return []

    async def _weather() -> str:
        return "날씨 정보 없음"

    monkeypatch.setattr("app.api.chat.llm.chat_completion", _reply)
    monkeypatch.setattr("app.api.chat.rag.search_products", _products)
    monkeypatch.setattr("app.api.chat._get_weather_context", _weather)
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)


def _ip() -> dict:
    """테스트마다 새 IP — 실제 카운터와 섞이지 않는다."""
    return {"X-Forwarded-For": f"pytest-{uuid.uuid4().hex[:12]}"}


@pytest_asyncio.fixture(loop_scope="session")
async def auth(client: AsyncClient):
    email = f"pytest-{uuid.uuid4().hex[:12]}@example.com"
    res = await client.post(
        "/api/v1/auth/signup", json={"email": email, "password": "pytest-pass-1234", "nickname": "테스트"}
    )
    assert res.status_code == 201, res.text
    yield {"Authorization": f"Bearer {res.json()['accessToken']}"}
    async with AsyncSessionLocal() as db:
        await db.execute(delete(User).where(User.email == email))
        await db.commit()


async def test_guest_is_blocked_after_daily_limit(client: AsyncClient) -> None:
    headers = _ip()
    for _ in range(settings.GUEST_CHAT_DAILY_LIMIT):
        res = await client.post(URL, json=BODY, headers=headers)
        assert res.status_code == 200, res.text
    res = await client.post(URL, json=BODY, headers=headers)
    assert res.status_code == 401
    assert "로그인" in res.json()["detail"]


async def test_logged_in_user_is_not_limited(client: AsyncClient, auth: dict) -> None:
    headers = {**_ip(), **auth}
    for _ in range(settings.GUEST_CHAT_DAILY_LIMIT + 2):
        res = await client.post(URL, json=BODY, headers=headers)
        assert res.status_code == 200, res.text
