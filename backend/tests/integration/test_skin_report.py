"""피부 변화 리포트 — 사진 분석 기록의 변화를 화장대 변화와 함께, 원인을 단정하지 않고 (퍼스널 AI 4단계).

이 파일은 **DB·Redis가 필요한 쪽**(tests/integration)이다. DB 없이 도는 테스트는 `tests/unit/test_skin_report.py`에 있다.
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


# ── DB·API ────────────────────────────────────────────────────────────────


@pytest_asyncio.fixture(loop_scope="session")
async def account(client: AsyncClient):
    email = f"pytest-{uuid.uuid4().hex[:12]}@example.com"
    res = await client.post(f"{AUTH}/signup", json={"email": email, "password": PASSWORD, "nickname": "리포트"})
    assert res.status_code == 201, res.text
    yield {"headers": {"Authorization": f"Bearer {res.json()['accessToken']}"}}
    async with AsyncSessionLocal() as db:
        await db.execute(delete(User).where(User.email == email))
        await db.commit()


async def test_new_account_has_no_report_and_says_how_to_get_one(client: AsyncClient, account) -> None:
    res = await client.get(f"{ME}/skin-report", **account)
    assert res.status_code == 200
    body = res.json()
    assert body["enough"] is False and body["changes"] == [] and "촬영" in body["message"]


async def test_demo_account_report_compares_and_never_claims_cause(client: AsyncClient) -> None:
    login = await client.post(f"{AUTH}/login", json={"email": "eunseong@swappy.app", "password": "swappy1234"})
    if login.status_code != 200:
        pytest.skip("시연 계정이 없는 DB")
    headers = {"Authorization": f"Bearer {login.json()['accessToken']}"}
    body = (await client.get(f"{ME}/skin-report", headers=headers)).json()
    if not body["enough"]:
        pytest.skip("시연 계정의 사진 분석이 2건 미만")
    assert body["beforeAt"] < body["afterAt"] and body["days"] >= 0
    assert body["changes"] and all({"key", "name", "before", "after", "delta", "trend"} <= set(c) for c in body["changes"])
    assert all(c["delta"] == c["after"] - c["before"] for c in body["changes"])
    assert all(c["trend"] in ("up", "down", "flat") for c in body["changes"])
    text = "\n".join(body["notes"])
    assert "영향이 있었을 수 있어요" in text or "눈에 띄는 변화" in text or "좋아진 항목" in text or "신경 쓸 항목" in text
    for banned in ("덕분", "확실히", "원인은"):
        assert banned not in text
    assert body["timeline"] and all(0 <= t["average"] <= 100 for t in body["timeline"])
