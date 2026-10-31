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
    r = await _reply("블라블라 아무말")
    assert "1️⃣ **" not in r.split("아래처럼")[0] and "아래처럼 물어보시면" in r
    assert "진정 성분이 뭐야?" in r


async def test_greeting_and_thanks_get_short_replies_without_notice() -> None:
    hi, thanks = await _reply("안녕"), await _reply("고마워")
    assert chat_fallback.NOTICE not in hi and "안녕하세요" in hi and len(hi) < 80
    assert chat_fallback.NOTICE not in thanks and len(thanks) < 80


async def test_app_howto_questions_get_fixed_answers_not_products() -> None:
    points = await _reply("포인트는 어떻게 모아요?")
    assert "1%" in points and "100P" in points and "마이페이지 > 포인트" in points
    ship = await _reply("배송은 언제 와요?")
    assert "주문내역" in ship and "1️⃣" not in ship
    diag = await _reply("피부 타입 진단은 어떻게 해?")
    assert "문답 진단" in diag and "AI 피부관리" in diag
    closet = await _reply("화장대에 제품 어떻게 등록해?")
    assert "내 화장품 등록하기" in closet
    app = await _reply("이 앱 뭐하는 앱이야?")
    assert "대체품" in app and "1️⃣" not in app


async def test_function_question_lists_ingredients_not_a_random_product() -> None:
    r = await _reply("진정 성분이 뭐야?")
    assert "**진정**" in r and "· " in r and "1️⃣" not in r


async def test_sensitive_question_lists_what_to_avoid() -> None:
    r = await _reply("민감성 피부한테 안 좋은 성분 알려줘")
    assert "향료" in r and "알코올" in r


async def test_no_unsupported_markdown() -> None:
    for q in ("레티놀이 뭐야?", "토너 추천해줘", "안녕", "진정 성분이 뭐야?", "포인트는 어떻게 모아요?"):
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
