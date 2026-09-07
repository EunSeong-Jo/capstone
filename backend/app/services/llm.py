"""
LLM 추상화 레이어.
현재: OpenAI API 사용.
9월 이후 Claude API로 전환 시 LLM_PROVIDER=claude + ANTHROPIC_API_KEY만 설정하면 됨.
"""
from __future__ import annotations

from app.config import settings


async def chat_completion(
    messages: list[dict], system_prompt: str, max_tokens: int = 1024
) -> str:
    """
    messages: [{"role": "user"|"assistant", "content": str}, ...]
    system_prompt: 시스템 프롬프트 (RAG 컨텍스트 포함)
    max_tokens: 응답 상한. 챗봇처럼 긴 답변이 필요 없는 호출(예: 오늘의
        케어 한 줄 문구)은 작게 줘서, 프롬프트 지시("30자 내외")를
        모델이 어겨도 물리적으로 긴 응답이 나올 수 없게 한다 — 글자수
        지시는 "부탁"일 뿐이라 강제력이 없어서, 토큰 상한이 실질적인
        안전장치다.
    """
    if settings.LLM_PROVIDER == "openai":
        return await _openai_chat(messages, system_prompt, max_tokens)
    if settings.LLM_PROVIDER == "claude":
        return await _claude_chat(messages, system_prompt, max_tokens)
    raise ValueError(f"지원하지 않는 LLM_PROVIDER: {settings.LLM_PROVIDER}")


async def _openai_chat(messages: list[dict], system_prompt: str, max_tokens: int) -> str:
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    response = await client.chat.completions.create(
        model=settings.LLM_MODEL,
        messages=[{"role": "system", "content": system_prompt}] + messages,
        max_tokens=max_tokens,
        temperature=0.7,
    )
    return response.choices[0].message.content or ""


async def _claude_chat(messages: list[dict], system_prompt: str, max_tokens: int) -> str:
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    response = await client.messages.create(
        model=settings.LLM_MODEL,
        max_tokens=max_tokens,
        system=system_prompt,
        messages=messages,
    )
    return response.content[0].text  # type: ignore[union-attr]