"""챗봇 폴백 — LLM이 전부 실패해도 DB로 답한다 (공용 DB 읽기 전용)."""
from __future__ import annotations

import re
import uuid

import pytest
from httpx import AsyncClient

from app.config import settings
from app.db.session import AsyncSessionLocal
from app.services import chat_fallback
from app.services.llm import LLMUnavailable

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _reply(q: str, skin: str | None = None) -> str:
    async with AsyncSessionLocal() as db:
        return await chat_fallback.fallback_reply(db, q, skin)


async def test_ingredient_question_uses_db_description() -> None:
    r = await _reply("레티놀이 뭐야?")
    assert chat_fallback.NOTICE in r
    assert "**레티놀**" in r and "일반 지식" not in r


async def test_recommend_lists_products_with_fit_score() -> None:
    r = await _reply("토너 추천해줘", "mulgae")
    assert "1️⃣ **" in r and "내 피부 궁합" in r


async def test_unknown_question_gets_guide_not_products() -> None:
    r = await _reply("안녕")
    assert "1️⃣ **" not in r and "이렇게 물어봐 주세요" in r


async def test_no_unsupported_markdown() -> None:
    for q in ("레티놀이 뭐야?", "토너 추천해줘", "안녕"):
        body = (await _reply(q)).replace("**", "")
        assert not re.search(r"^[#>`-]", body, re.M), q


async def test_chat_endpoint_returns_200_fallback_when_llm_down(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def down(*_a, **_k):
        raise LLMUnavailable("모든 공급자 실패")

    async def weather() -> str:
        return "정보 없음"

    monkeypatch.setattr("app.api.chat.llm.chat_completion", down)
    monkeypatch.setattr("app.api.chat._get_weather_context", weather)
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)
    res = await client.post(
        "/api/v1/chat",
        json={"message": "레티놀이 뭐야?", "history": []},
        headers={"X-Forwarded-For": f"pytest-{uuid.uuid4().hex[:12]}"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["mode"] == "fallback" and "레티놀" in res.json()["reply"]


async def test_brand_in_question_limits_products_to_that_brand() -> None:
    r = await _reply("아비브 어성초 토너 성분 알려줘 (브랜드 테스트)")
    assert "아비브 어성초" in r and "블랑네이처" not in r


async def test_unknown_product_of_known_brand_says_not_found() -> None:
    r = await _reply("아비브 존재하지않는제품zzz 성분 알려줘")
    assert "찾지 못했어요" in r and "1️⃣ **" not in r


async def test_brand_alternative_still_finds_seed() -> None:
    r = await _reply("달바 세럼보다 싼 대체품 있어요? (대체 테스트)")
    assert "보다 싼 비슷한 제품" in r
