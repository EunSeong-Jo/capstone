"""개인 컨텍스트 — 챗봇이 내 화장대·피부 상태를 아는 기능 (PR 1).

이 파일은 **DB·Redis가 필요한 쪽**(tests/integration)이다. DB 없이 도는 테스트는 `tests/unit/test_personal_context.py`에 있다.

순수 함수(요약 문장·상한)는 DB 없이, 스냅샷 조회와 챗봇 연동은 로컬 DB의 시연 계정(조은성)으로 확인한다.
시연 계정이 없는 환경에서는 DB 의존 테스트를 건너뛴다.
"""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.config import settings
from app.db.session import AsyncSessionLocal
from app.models.user import User
from app.services.chat import chat_fallback
from app.services.personal_ai import personal_context as pc
from app.services.chat.llm import LLMUnavailable

pytestmark = pytest.mark.asyncio(loop_scope="session")

DEMO_EMAIL = "eunseong@swappy.app"
DEMO_PASSWORD = "swappy1234"


def _entry(i: int, name: str = "라운드랩 1025 독도 토너 200ml", funcs=("보습", "진정")) -> pc.ClosetEntry:
    return pc.ClosetEntry(id=i, name=f"{name} {i}", brand="라운드랩", category="스킨케어", price=13500, functions=funcs)


# ── DB (시연 계정) ────────────────────────────────────────────────────────


async def _demo_user_id() -> uuid.UUID | None:
    async with AsyncSessionLocal() as db:
        return await db.scalar(select(User.id).where(User.email == DEMO_EMAIL))


async def test_build_snapshot_for_demo_account() -> None:
    uid = await _demo_user_id()
    if uid is None:
        pytest.skip("시연 계정이 없는 DB")
    async with AsyncSessionLocal() as db:
        snap = await pc.build_snapshot(db, uid, ["나이아신아마이드", "병풀추출물"])
    assert snap.skin_type is not None and snap.skin_label
    assert snap.closet and len(snap.closet) <= pc.MAX_CLOSET and snap.closet_total >= len(snap.closet)
    assert all(e.name and e.category for e in snap.closet)
    assert snap.my_ingredients == ("나이아신아마이드", "병풀추출물")
    text = pc.render(snap)
    assert snap.closet[0].name in text or "그 밖에" in text
    assert "@" not in text      # 이메일 같은 식별 정보는 요약에 없다


async def test_build_snapshot_unknown_user_is_empty() -> None:
    async with AsyncSessionLocal() as db:
        snap = await pc.build_snapshot(db, uuid.uuid4())
    assert snap.is_empty and pc.render(snap) == ""


async def _login(client: AsyncClient) -> dict[str, str]:
    res = await client.post("/api/v1/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    if res.status_code != 200:
        pytest.skip("시연 계정으로 로그인할 수 없는 DB")
    return {"Authorization": f"Bearer {res.json()['accessToken']}"}


async def test_chat_prompt_contains_personal_summary_for_logged_in_user(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    seen: dict[str, str] = {}

    async def fake_llm(messages, system, *a, **k):
        seen["system"] = system
        return "알겠어요"

    async def weather() -> str:
        return "정보 없음"

    monkeypatch.setattr("app.api.chat.llm.chat_completion", fake_llm)
    monkeypatch.setattr("app.api.chat._get_weather_context", weather)
    monkeypatch.setattr(settings, "CHAT_TOOLS_ENABLED", False)     # 이 파일은 도구 없는 챗봇의 개인 요약을 본다(도구는 test_chat_tools.py)
    headers = await _login(client)
    res = await client.post("/api/v1/chat", json={"message": "내 화장대 알려줘", "my_ingredients": ["판테놀"]}, headers=headers)
    assert res.status_code == 200 and res.json()["mode"] == "ai"
    assert "[내 정보 요약" in seen["system"] and "내 화장대" in seen["system"] and "판테놀" in seen["system"]


async def test_chat_prompt_has_no_personal_summary_for_guest(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    seen: dict[str, str] = {}

    async def fake_llm(messages, system, *a, **k):
        seen["system"] = system
        return "알겠어요"

    async def weather() -> str:
        return "정보 없음"

    monkeypatch.setattr("app.api.chat.llm.chat_completion", fake_llm)
    monkeypatch.setattr("app.api.chat._get_weather_context", weather)
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)
    res = await client.post(
        "/api/v1/chat",
        json={"message": "토너 추천해줘", "my_ingredients": ["판테놀"]},
        headers={"X-Forwarded-For": f"pytest-{uuid.uuid4().hex[:12]}"},
    )
    assert res.status_code == 200
    section = seen["system"].split("[내 정보 요약")[1].split("[참고 제품 데이터]")[0]
    assert "없음 (비회원" in section and "판테놀" not in section     # 비회원이 보낸 마이 성분은 쓰지 않는다


async def test_flag_off_disables_personalization(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, str] = {}

    async def fake_llm(messages, system, *a, **k):
        seen["system"] = system
        return "알겠어요"

    async def weather() -> str:
        return "정보 없음"

    monkeypatch.setattr("app.api.chat.llm.chat_completion", fake_llm)
    monkeypatch.setattr("app.api.chat._get_weather_context", weather)
    monkeypatch.setattr(settings, "PERSONAL_AI_ENABLED", False)
    headers = await _login(client)
    res = await client.post("/api/v1/chat", json={"message": "내 화장대 알려줘"}, headers=headers)
    assert res.status_code == 200 and "없음 (비회원" in seen["system"]


async def test_fallback_answers_my_closet_for_logged_in_user_and_is_not_cached_across_users(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def down(*_a, **_k):
        raise LLMUnavailable("모든 공급자 실패")

    async def weather() -> str:
        return "정보 없음"

    monkeypatch.setattr("app.api.chat.llm.chat_completion", down)
    monkeypatch.setattr("app.api.chat.llm.chat_with_tools", down)
    monkeypatch.setattr("app.api.chat._get_weather_context", weather)
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)
    headers = await _login(client)
    q = {"message": "내 화장대에 뭐 있어?"}
    mine = await client.post("/api/v1/chat", json=q, headers=headers)
    assert mine.status_code == 200 and mine.json()["mode"] == "fallback"
    assert "**내 화장대**" in mine.json()["reply"] and "1️⃣ **" in mine.json()["reply"]

    # 같은 문장을 비회원이 보내면 내 화장대가 보이면 안 된다(질문 문장 캐시로 새는 사고 방지)
    guest = await client.post("/api/v1/chat", json=q, headers={"X-Forwarded-For": f"pytest-{uuid.uuid4().hex[:12]}"})
    assert guest.status_code == 200 and "**내 화장대**" not in guest.json()["reply"]


async def test_rag_prefer_fit_returns_at_most_top_k_and_respects_exclusion() -> None:
    from app.services.chat import rag

    async with AsyncSessionLocal() as db:
        plain = await rag.search_products(db, "토너 추천해줘", "hwasan", top_k=5)
        fit = await rag.search_products(db, "토너 추천해줘", "hwasan", top_k=5, prefer_fit=True)
    assert 0 < len(fit) <= 5 and len(plain) <= 5


async def test_fallback_product_question_is_not_hijacked_by_my_summary() -> None:
    """"○○ 크림 내 피부에 맞아?"는 제품 질문이다. 내 요약(화장대 목록)만 쏟아내면 엉뚱한 답이다."""
    snap = pc.PersonalSnapshot(skin_type="hwasan", closet=(_entry(1),), closet_total=1)
    async with AsyncSessionLocal() as db:
        product = await chat_fallback.fallback_reply(db, "에스트라 아토베리어365 크림 내 피부에 맞아?", "hwasan", snap)
        mine = await chat_fallback.fallback_reply(db, "내 피부 상태 알려줘", "hwasan", snap)
    assert "**내 화장대**" not in product
    assert "**내 화장대**" in mine and "울긋불긋 화산" in mine
