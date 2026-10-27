"""LLM 공급자 체인 — 한 곳이 실패하면 다음으로, 전부 실패하면 LLMUnavailable."""
from __future__ import annotations

import pytest

from app.config import settings
from app.services import llm

pytestmark = pytest.mark.asyncio(loop_scope="session")


@pytest.fixture(autouse=True)
def _cfg(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "LLM_PROVIDER", "openai")
    monkeypatch.setattr(settings, "LLM_CHAIN", "openai,claude")
    monkeypatch.setattr(settings, "OLLAMA_BASE_URL", "")


def test_chain_order_and_filters(monkeypatch: pytest.MonkeyPatch) -> None:
    assert llm.provider_chain() == ["openai", "claude"]
    # ollama는 주소가 있을 때만, 알 수 없는 이름·중복은 뺀다
    monkeypatch.setattr(settings, "LLM_CHAIN", "claude,ollama,foo,claude")
    assert llm.provider_chain() == ["openai", "claude"]
    monkeypatch.setattr(settings, "OLLAMA_BASE_URL", "http://x/v1")
    assert llm.provider_chain() == ["openai", "claude", "ollama"]
    # 기존 설정(LLM_PROVIDER=claude)은 체인 맨 앞
    monkeypatch.setattr(settings, "LLM_PROVIDER", "claude")
    assert llm.provider_chain()[0] == "claude"


async def test_falls_through_to_next_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    async def boom(*_a, **_k):
        raise RuntimeError("401")

    async def ok(*_a, **_k):
        return "claude 답변"

    monkeypatch.setattr(llm, "_openai_chat", boom)
    monkeypatch.setattr(llm, "_claude_chat", ok)
    assert await llm.chat_completion([], "sys") == "claude 답변"


async def test_all_fail_raises_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    async def boom(*_a, **_k):
        raise RuntimeError("down")

    monkeypatch.setattr(llm, "_openai_chat", boom)
    monkeypatch.setattr(llm, "_claude_chat", boom)
    with pytest.raises(llm.LLMUnavailable):
        await llm.chat_completion([], "sys")


async def test_empty_keys_skip_without_network(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "")
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "")
    with pytest.raises(llm.LLMUnavailable):
        await llm.chat_completion([], "sys")
