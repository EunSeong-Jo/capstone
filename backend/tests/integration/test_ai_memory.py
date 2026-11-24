"""AI 기억 — 동의한 사용자의 대화에서 알게 된 사실을 저장하고, 사용자가 보고·고치고·지운다 (퍼스널 AI 3단계).

이 파일은 **DB·Redis가 필요한 쪽**(tests/integration)이다. DB 없이 도는 테스트는 `tests/unit/test_ai_memory.py`에 있다.
"""
from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import delete, select

from app.config import settings
from app.db.session import AsyncSessionLocal
from app.models.personal import UserMemory
from app.models.user import User
from app.services.personal_ai import memory as mem

pytestmark = pytest.mark.asyncio(loop_scope="session")

AUTH = "/api/v1/auth"
ME = "/api/v1/me"
PASSWORD = "Passw0rd!pytest"


# ── API (새 계정) ─────────────────────────────────────────────────────────


@pytest_asyncio.fixture(loop_scope="session")
async def account(client: AsyncClient):
    email = f"pytest-{uuid.uuid4().hex[:12]}@example.com"
    res = await client.post(f"{AUTH}/signup", json={"email": email, "password": PASSWORD, "nickname": "기억"})
    assert res.status_code == 201, res.text
    yield {"headers": {"Authorization": f"Bearer {res.json()['accessToken']}"}}
    async with AsyncSessionLocal() as db:
        await db.execute(delete(User).where(User.email == email))
        await db.commit()


async def test_memory_is_off_until_the_user_agrees(client: AsyncClient, account) -> None:
    state = (await client.get(f"{ME}/ai-memory", **account)).json()
    assert state == {"enabled": False, "version": mem.CONSENT_VERSION, "agreedAt": None, "count": 0, "limit": mem.MAX_MEMORIES}
    blocked = await client.post(f"{ME}/memories", json={"text": "향료는 싫어함"}, **account)
    assert blocked.status_code == 409                                  # 동의 전에는 쌓지 않는다
    on = (await client.put(f"{ME}/ai-memory", json={"enabled": True}, **account)).json()
    assert on["enabled"] is True and on["agreedAt"]
    off = (await client.put(f"{ME}/ai-memory", json={"enabled": False}, **account)).json()
    assert off["enabled"] is False and off["agreedAt"] is None


async def test_memory_crud_and_validation(client: AsyncClient, account) -> None:
    await client.put(f"{ME}/ai-memory", json={"enabled": True}, **account)
    created = await client.post(f"{ME}/memories", json={"text": "향료가 들어간 제품은 싫어함"}, **account)
    assert created.status_code == 201
    mid = created.json()["id"]
    assert created.json()["text"] == "향료가 들어간 제품은 싫어함" and created.json()["source"] == "user" and created.json()["enabled"]
    # 같은 문장(공백·문장부호만 다름)은 중복으로 쌓이지 않는다
    await client.post(f"{ME}/memories", json={"text": " 향료가 들어간 제품은 싫어함. "}, **account)
    assert len((await client.get(f"{ME}/memories", **account)).json()) == 1
    # 위험한 내용은 거절
    assert (await client.post(f"{ME}/memories", json={"text": "내 번호는 010-1234-5678"}, **account)).status_code == 422
    # 수정·끄기
    patched = await client.patch(f"{ME}/memories/{mid}", json={"text": "향료는 피하고 싶음", "enabled": False}, **account)
    assert patched.status_code == 200 and patched.json()["text"] == "향료는 피하고 싶음" and patched.json()["enabled"] is False
    assert (await client.patch(f"{ME}/memories/{mid}", json={"text": "010-1234-5678 번호"}, **account)).status_code == 422
    # 하나·전부 지우기
    assert (await client.delete(f"{ME}/memories/{mid}", **account)).status_code == 204
    assert (await client.delete(f"{ME}/memories/{mid}", **account)).status_code == 404
    await client.post(f"{ME}/memories", json={"text": "여드름이 자주 남"}, **account)
    assert (await client.delete(f"{ME}/memories", **account)).status_code == 204
    assert (await client.get(f"{ME}/memories", **account)).json() == []


async def test_memories_are_private_to_each_user(client: AsyncClient, account) -> None:
    await client.put(f"{ME}/ai-memory", json={"enabled": True}, **account)
    mid = (await client.post(f"{ME}/memories", json={"text": "나만 아는 기억"}, **account)).json()["id"]
    email = f"pytest-{uuid.uuid4().hex[:12]}@example.com"
    other = await client.post(f"{AUTH}/signup", json={"email": email, "password": PASSWORD, "nickname": "다른이"})
    oh = {"headers": {"Authorization": f"Bearer {other.json()['accessToken']}"}}
    try:
        assert (await client.get(f"{ME}/memories", **oh)).json() == []
        assert (await client.patch(f"{ME}/memories/{mid}", json={"enabled": False}, **oh)).status_code == 404
        assert (await client.delete(f"{ME}/memories/{mid}", **oh)).status_code == 404
    finally:
        async with AsyncSessionLocal() as db:
            await db.execute(delete(User).where(User.email == email))
            await db.commit()
    assert len((await client.get(f"{ME}/memories", **account)).json()) == 1       # 다른 사람의 시도로 지워지지 않았다


async def test_cap_drops_oldest_auto_memories_first(client: AsyncClient, account) -> None:
    await client.put(f"{ME}/ai-memory", json={"enabled": True}, **account)
    uid = (await client.get(f"{AUTH}/me", **account)).json()["id"]
    async with AsyncSessionLocal() as db:
        await mem.add_memories(db, uuid.UUID(uid), [("fact", "내가 직접 쓴 중요한 기억")], source="user")
        await mem.add_memories(db, uuid.UUID(uid), [("fact", f"자동으로 쌓인 기억 번호 {i}") for i in range(mem.MAX_MEMORIES + 3)], source="auto")
        rows = (await db.scalars(select(UserMemory).where(UserMemory.user_id == uuid.UUID(uid)))).all()
    assert len(rows) == mem.MAX_MEMORIES
    assert any(r.content == "내가 직접 쓴 중요한 기억" for r in rows)          # 사용자가 쓴 것은 자동 기억보다 늦게 지워진다


# ── 챗봇 연동 ─────────────────────────────────────────────────────────────


@pytest.fixture
def _quiet_chat(monkeypatch: pytest.MonkeyPatch) -> dict:
    seen: dict = {"systems": [], "extract": []}

    async def weather() -> str:
        return "정보 없음"

    async def fake_tools(messages, system, *a, **k):
        seen["systems"].append(system)
        return "알겠어요"

    async def fake_extract(user_id, message, reply, history):
        seen["extract"].append(message)

    monkeypatch.setattr("app.api.chat._get_weather_context", weather)
    monkeypatch.setattr("app.api.chat.llm.chat_with_tools", fake_tools)
    monkeypatch.setattr("app.api.chat.memory_service.extract_and_store", fake_extract)

    async def no_llm(*a, **k):
        raise mem.llm.LLMUnavailable("test")

    monkeypatch.setattr("app.services.personal_ai.memory.llm.chat_completion", no_llm)   # 명시 저장은 AI가 막히면 규칙으로 대신한다
    return seen


async def test_chat_saves_explicit_memory_only_after_consent_and_tells_the_user(
    client: AsyncClient, account, _quiet_chat: dict
) -> None:
    said = {"message": "향료 들어간 건 싫어, 기억해"}
    off = await client.post("/api/v1/chat", json=said, **account)
    assert off.status_code == 200 and "📌" not in off.json()["reply"]
    assert (await client.get(f"{ME}/memories", **account)).json() == []          # 동의 전에는 저장하지 않는다

    await client.put(f"{ME}/ai-memory", json={"enabled": True}, **account)
    on = await client.post("/api/v1/chat", json=said, **account)
    assert "📌 기억해 둘게요: 향료 들어간 건 싫어" in on.json()["reply"] and "AI 기억" in on.json()["reply"]
    saved = (await client.get(f"{ME}/memories", **account)).json()
    assert [m["text"] for m in saved] == ["향료 들어간 건 싫어"] and saved[0]["source"] == "explicit"

    # 다음 대화의 프롬프트에 들어간다
    await client.post("/api/v1/chat", json={"message": "토너 추천해줘"}, **account)
    assert "향료 들어간 건 싫어" in _quiet_chat["systems"][-1]


async def test_disabled_memory_is_not_in_prompt_and_off_consent_hides_all(client: AsyncClient, account, _quiet_chat: dict) -> None:
    await client.put(f"{ME}/ai-memory", json={"enabled": True}, **account)
    mid = (await client.post(f"{ME}/memories", json={"text": "건조한 피부라 보습이 중요함"}, **account)).json()["id"]
    await client.post("/api/v1/chat", json={"message": "안녕"}, **account)
    assert "건조한 피부라 보습이 중요함" in _quiet_chat["systems"][-1]
    await client.patch(f"{ME}/memories/{mid}", json={"enabled": False}, **account)
    await client.post("/api/v1/chat", json={"message": "안녕"}, **account)
    assert "건조한 피부라 보습이 중요함" not in _quiet_chat["systems"][-1]          # 끈 기억은 프롬프트에 안 들어간다
    await client.patch(f"{ME}/memories/{mid}", json={"enabled": True}, **account)
    await client.put(f"{ME}/ai-memory", json={"enabled": False}, **account)
    await client.post("/api/v1/chat", json={"message": "안녕"}, **account)
    assert "건조한 피부라 보습이 중요함" not in _quiet_chat["systems"][-1]          # 철회하면 읽지도 않는다


async def test_auto_extraction_is_scheduled_for_cues_and_skipped_without_consent(
    client: AsyncClient, account, _quiet_chat: dict
) -> None:
    await client.post("/api/v1/chat", json={"message": "요즘 트러블이 많이 나요"}, **account)
    assert _quiet_chat["extract"] == []                                            # 동의 전에는 추출하지 않는다
    await client.put(f"{ME}/ai-memory", json={"enabled": True}, **account)
    await client.post("/api/v1/chat", json={"message": "요즘 트러블이 많이 나요"}, **account)
    await client.post("/api/v1/chat", json={"message": "안녕하세요"}, **account)
    assert _quiet_chat["extract"] == ["요즘 트러블이 많이 나요"]                   # 단서가 있는 말만(안녕은 3번째 턴이 아니라 건너뜀)


async def test_guest_has_no_memory(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    async def weather() -> str:
        return "정보 없음"

    async def plain(messages, system, *a, **k):
        return "일반 답변"

    monkeypatch.setattr("app.api.chat._get_weather_context", weather)
    monkeypatch.setattr("app.api.chat.llm.chat_completion", plain)
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)
    res = await client.post(
        "/api/v1/chat", json={"message": "향료 싫어, 기억해"}, headers={"X-Forwarded-For": f"pytest-{uuid.uuid4().hex[:12]}"}
    )
    assert res.status_code == 200 and "📌" not in res.json()["reply"]
