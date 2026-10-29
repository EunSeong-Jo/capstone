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


async def test_empty_reply_counts_as_failure_and_falls_through(monkeypatch: pytest.MonkeyPatch) -> None:
    """빈 문자열은 답이 아니다. 그대로 돌려주면 호출처(챗봇)가 빈 답을 화면에 낸다."""

    async def empty(*_a, **_k):
        return "   "

    async def ok(*_a, **_k):
        return "claude 답변"

    monkeypatch.setattr(llm, "_openai_chat", empty)
    monkeypatch.setattr(llm, "_claude_chat", ok)
    assert await llm.chat_completion([], "sys") == "claude 답변"


async def test_all_empty_raises_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    async def empty(*_a, **_k):
        return ""

    monkeypatch.setattr(llm, "_openai_chat", empty)
    monkeypatch.setattr(llm, "_claude_chat", empty)
    with pytest.raises(llm.LLMUnavailable):
        await llm.chat_completion([], "sys")


class _Block:
    def __init__(self, type_: str, text: str | None) -> None:
        self.type, self.text = type_, text


class _Resp:
    def __init__(self, blocks: list[_Block]) -> None:
        self.content, self.stop_reason = blocks, "end_turn"
        self.usage = type("U", (), {"output_tokens": 1})()


def _fake_anthropic(monkeypatch: pytest.MonkeyPatch, blocks: list[_Block], seen: dict) -> None:
    import anthropic

    class _Messages:
        async def create(self, **kw):
            seen.update(kw)
            return _Resp(blocks)

    class _Client:
        def __init__(self, **_kw) -> None:
            self.messages = _Messages()

    monkeypatch.setattr(anthropic, "AsyncAnthropic", _Client)
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "sk-ant-test")


async def test_claude_joins_text_blocks_and_skips_empty_or_thinking_blocks(monkeypatch: pytest.MonkeyPatch) -> None:
    """응답이 블록 여러 개일 때 첫 블록의 text가 None이어도 뒤 블록의 본문을 읽는다(예전엔 content[0].text라 None → 500)."""
    seen: dict = {}
    blocks = [_Block("thinking", None), _Block("text", None), _Block("text", "안녕하세요"), _Block("text", " 반가워요")]
    _fake_anthropic(monkeypatch, blocks, seen)
    assert await llm._claude_chat([{"role": "user", "content": "hi"}], "sys", 100) == "안녕하세요 반가워요"
    # 짧은 생성에서 생각이 토큰을 다 쓰지 않게 끈다
    assert seen["extra_body"] == {"thinking": {"type": "disabled"}}


async def test_claude_only_thinking_block_is_empty_so_chain_moves_on(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict = {}
    _fake_anthropic(monkeypatch, [_Block("thinking", None)], seen)
    assert await llm._claude_chat([], "sys", 100) == ""
