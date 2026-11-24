"""오늘의 개인 브리핑 — 날씨 × 내 약한 항목 × 내 화장대 (퍼스널 AI 4단계).

이 파일은 **DB·Redis가 필요한 쪽**(tests/integration)이다. DB 없이 도는 테스트는 `tests/unit/test_briefing.py`에 있다.
"""
from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import delete

from app.db.session import AsyncSessionLocal
from app.models.user import User

pytestmark = pytest.mark.asyncio(loop_scope="session")

AUTH = "/api/v1/auth"
ME = "/api/v1/me"
PASSWORD = "Passw0rd!pytest"


# ── API ───────────────────────────────────────────────────────────────────


@pytest_asyncio.fixture(loop_scope="session")
async def account(client: AsyncClient):
    email = f"pytest-{uuid.uuid4().hex[:12]}@example.com"
    res = await client.post(f"{AUTH}/signup", json={"email": email, "password": PASSWORD, "nickname": "브리핑"})
    assert res.status_code == 201, res.text
    yield {"headers": {"Authorization": f"Bearer {res.json()['accessToken']}"}}
    async with AsyncSessionLocal() as db:
        await db.execute(delete(User).where(User.email == email))
        await db.commit()


@pytest.fixture
def _dry_weather(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake() -> dict:
        return {"has": True, "temp": 8, "humidity": 30, "label": "맑음", "condition": "sunny", "season": "autumn", "events": ["건조(습도 30%)"]}

    monkeypatch.setattr("app.api.insights._weather", fake)


async def test_new_account_briefing_asks_to_register_closet(client: AsyncClient, account, _dry_weather: None) -> None:
    body = (await client.get(f"{ME}/briefing", **account)).json()
    assert body["date"] and body["pick"] is None and body["missing"]
    assert body["weather"] == {"label": "맑음", "temperature": 8, "humidity": 30}


async def test_briefing_works_without_weather(client: AsyncClient, account, monkeypatch: pytest.MonkeyPatch) -> None:
    async def none() -> dict:
        return {"has": False}

    monkeypatch.setattr("app.api.insights._weather", none)
    res = await client.get(f"{ME}/briefing", **account)
    assert res.status_code == 200 and res.json()["weather"] is None and res.json()["headline"]


async def test_demo_account_briefing_picks_closet_product(client: AsyncClient, _dry_weather: None) -> None:
    login = await client.post(f"{AUTH}/login", json={"email": "eunseong@swappy.app", "password": "swappy1234"})
    if login.status_code != 200:
        pytest.skip("시연 계정이 없는 DB")
    headers = {"Authorization": f"Bearer {login.json()['accessToken']}"}
    first = (await client.get(f"{ME}/briefing", headers=headers)).json()
    assert first["pick"] and first["pick"]["function"] in ("보습", "장벽", "자외선차단", "피지·모공", "각질·클렌징", "진정")
    assert any("건조" in r for r in first["reasons"])
    mine = {c["product"]["id"] for c in (await client.get(f"{ME}/closet", headers=headers)).json() if c["status"] == "owned"}
    assert first["pick"]["id"] in mine                                     # 추천한 제품은 실제로 내 화장대에 있다
    again = (await client.get(f"{ME}/briefing", headers=headers)).json()
    assert again == first                                                  # 같은 조건이면 같은 브리핑(캐시·결정적)
