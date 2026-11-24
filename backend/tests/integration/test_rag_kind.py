"""제품 검색 — 종류 단어(크림·토너…)와 요청 말투 처리 (공용 DB 읽기 전용).

이 파일은 **DB·Redis가 필요한 쪽**(tests/integration)이다. DB 없이 도는 테스트는 `tests/unit/test_rag_kind.py`에 있다.
"""
from __future__ import annotations

import pytest

from app.db.session import AsyncSessionLocal
from app.services.chat import rag

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_search_with_kind_word_returns_only_that_kind() -> None:
    async with AsyncSessionLocal() as db:
        got = await rag.search_products(db, "건조한데 좋은 크림 있어?", None, top_k=5)
    assert got and all("크림" in p["name"] for p in got)
