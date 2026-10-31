"""제품 검색 — 종류 단어(크림·토너…)와 요청 말투 처리 (공용 DB 읽기 전용)."""
from __future__ import annotations

import pytest

from app.db.session import AsyncSessionLocal
from app.services import rag

pytestmark = pytest.mark.asyncio(loop_scope="session")


def test_kind_words_drops_cream_inside_sunscreen() -> None:
    assert rag.kind_words("건조한데 좋은 크림 있어?") == ["크림"]
    assert rag.kind_words("3만원 이하 선크림") == ["선크림"]
    assert rag.kind_words("나이아신아마이드 들어간 세럼") == ["세럼"]
    assert rag.kind_words("피부가 건조해요") == []


def test_tokenize_drops_request_words_but_never_returns_empty() -> None:
    assert rag._tokenize("건조한데 좋은 크림 있어?") == ["건조한데", "크림"]
    assert rag._tokenize("추천해줘") == ["추천해줘"]        # 다 걸러지면 원래 토큰을 남긴다


async def test_search_with_kind_word_returns_only_that_kind() -> None:
    async with AsyncSessionLocal() as db:
        got = await rag.search_products(db, "건조한데 좋은 크림 있어?", None, top_k=5)
    assert got and all("크림" in p["name"] for p in got)
