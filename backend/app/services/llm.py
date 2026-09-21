"""
LLM 추상화 레이어.
현재: OpenAI API 사용.
9월 이후 Claude API로 전환 시 LLM_PROVIDER=claude + ANTHROPIC_API_KEY만 설정하면 됨.
"""
from __future__ import annotations

from app.config import settings


def _validate_api_key(key: str | None, env_var_name: str) -> str:
    """API 키가 비어있거나 손상된 값이면 여기서 바로 막는다.

    검증 없이 그대로 httpx 헤더에 실으면 "UnicodeEncodeError: 'ascii' codec
    can't encode..." 같은, 원인을 짐작하기 어려운 에러가 난다. 흔한 원인은
    .env.example의 안내문 placeholder(sk-...여기에_실제_키_입력...)를
    실제 키로 안 바꾼 경우다.
    """
    if not key or not key.isascii():
        raise RuntimeError(
            f"{env_var_name}가 비어있거나 올바르지 않습니다. "
            f".env의 {env_var_name} 값을 실제 API 키로 채워주세요."
        )
    return key


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

    api_key = _validate_api_key(settings.OPENAI_API_KEY, "OPENAI_API_KEY")
    client = AsyncOpenAI(api_key=api_key)
    response = await client.chat.completions.create(
        model=settings.LLM_MODEL,
        messages=[{"role": "system", "content": system_prompt}] + messages,
        max_tokens=max_tokens,
        temperature=0.7,
    )
    return response.choices[0].message.content or ""


async def _claude_chat(messages: list[dict], system_prompt: str, max_tokens: int) -> str:
    import anthropic

    api_key = _validate_api_key(settings.ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY")
    client = anthropic.AsyncAnthropic(api_key=api_key)
    response = await client.messages.create(
        model=settings.LLM_MODEL,
        max_tokens=max_tokens,
        system=system_prompt,
        messages=messages,
    )
    return response.content[0].text  # type: ignore[union-attr]