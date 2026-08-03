"""
LLM 추상화 레이어.
현재: OpenAI API 사용.
9월 이후 Claude API로 전환 시 LLM_PROVIDER=claude + ANTHROPIC_API_KEY만 설정하면 됨.
"""
from __future__ import annotations

from app.config import settings


async def chat_completion(messages: list[dict], system_prompt: str) -> str:
    """
    messages: [{"role": "user"|"assistant", "content": str}, ...]
    system_prompt: 시스템 프롬프트 (RAG 컨텍스트 포함)
    """
    if settings.LLM_PROVIDER == "openai":
        return await _openai_chat(messages, system_prompt)
    if settings.LLM_PROVIDER == "claude":
        return await _claude_chat(messages, system_prompt)
    raise ValueError(f"지원하지 않는 LLM_PROVIDER: {settings.LLM_PROVIDER}")


async def _openai_chat(messages: list[dict], system_prompt: str) -> str:
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    response = await client.chat.completions.create(
        model=settings.LLM_MODEL,
        messages=[{"role": "system", "content": system_prompt}] + messages,
        max_tokens=1024,
        temperature=0.7,
    )
    return response.choices[0].message.content or ""


async def _claude_chat(messages: list[dict], system_prompt: str) -> str:
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    response = await client.messages.create(
        model=settings.LLM_MODEL,
        max_tokens=1024,
        system=system_prompt,
        messages=messages,
    )
    return response.content[0].text  # type: ignore[union-attr]