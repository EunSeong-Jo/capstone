"""챗봇 폴백 — LLM이 전부 실패해도 DB로 답한다 (공용 DB 읽기 전용).

이 파일은 **DB·Redis 없이 도는 쪽**(tests/unit)이다. DB가 필요한 테스트는 `tests/integration/test_chat_fallback.py`에 있다.
"""
from __future__ import annotations

import pytest
from app.db.session import AsyncSessionLocal
from app.services.chat import chat_fallback

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _reply(q: str, skin: str | None = None) -> str:
    async with AsyncSessionLocal() as db:
        return await chat_fallback.fallback_reply(db, q, skin)


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


async def test_sensitive_question_lists_what_to_avoid() -> None:
    r = await _reply("민감성 피부한테 안 좋은 성분 알려줘")
    assert "향료" in r and "알코올" in r
