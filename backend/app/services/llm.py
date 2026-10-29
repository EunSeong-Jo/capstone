"""
LLM 추상화 레이어 — 공급자 체인.

`LLM_CHAIN` 순서(기본 openai → claude)로 시도하고, 한 곳이 실패하면(키 없음·만료·한도·타임아웃)
다음 공급자로 넘어간다. 전부 실패하면 `LLMUnavailable`을 던지고, 호출처가 대체 응답을 정한다
(챗봇은 services/chat_fallback.py의 DB 기반 답변, 케어 문구는 502 → 프론트 정적 문구).

`ollama`는 로컬 개발용 선택지다. OpenAI 호환 `/v1`이라 `_openai_chat`을 그대로 쓴다.
"""
from __future__ import annotations

import structlog

from app.config import settings

log = structlog.get_logger()


class LLMUnavailable(RuntimeError):
    """체인의 모든 공급자가 실패했다."""


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


def provider_chain() -> list[str]:
    """시도할 공급자 이름을 순서대로. 중복·알 수 없는 이름·설정 안 된 ollama는 뺀다."""
    names = [n.strip().lower() for n in settings.LLM_CHAIN.split(",") if n.strip()]
    # LLM_PROVIDER는 체인 맨 앞이다 — LLM_PROVIDER=claude만 바꿔 쓰던 기존 설정을 존중한다.
    primary = settings.LLM_PROVIDER.strip().lower()
    if primary:
        names = [primary] + [n for n in names if n != primary]
    out: list[str] = []
    for n in names:
        if n in out or n not in ("openai", "claude", "ollama"):
            continue
        if n == "ollama" and not settings.OLLAMA_BASE_URL:
            continue
        out.append(n)
    return out


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
    errors: list[str] = []
    for name in provider_chain():
        try:
            if name == "openai":
                text = await _openai_chat(messages, system_prompt, max_tokens)
            elif name == "claude":
                text = await _claude_chat(messages, system_prompt, max_tokens)
            else:
                text = await _ollama_chat(messages, system_prompt, max_tokens)
            # 빈 응답(거절·길이 초과 등)은 답이 아니다. 그대로 돌려주면 호출처가 None/빈 문자열을 화면에 낸다 → 다음 공급자로.
            if text and text.strip():
                return text
            errors.append(f"{name}: 빈 응답")
            log.warning("llm_provider_empty", provider=name)
        except Exception as exc:  # noqa: BLE001 — 어떤 실패든 다음 공급자로 넘어간다
            errors.append(f"{name}: {type(exc).__name__}")
            log.warning("llm_provider_failed", provider=name, error=str(exc)[:200])
    raise LLMUnavailable("모든 LLM 공급자가 실패했습니다: " + ", ".join(errors or ["공급자 없음"]))


async def _openai_chat(
    messages: list[dict],
    system_prompt: str,
    max_tokens: int,
    *,
    api_key: str | None = None,
    base_url: str | None = None,
    model: str | None = None,
) -> str:
    from openai import AsyncOpenAI

    key = api_key if api_key is not None else _validate_api_key(settings.OPENAI_API_KEY, "OPENAI_API_KEY")
    client = AsyncOpenAI(api_key=key, base_url=base_url, timeout=settings.LLM_TIMEOUT, max_retries=0)
    response = await client.chat.completions.create(
        model=model or settings.LLM_MODEL,
        messages=[{"role": "system", "content": system_prompt}] + messages,
        max_tokens=max_tokens,
        temperature=0.7,
    )
    return response.choices[0].message.content or ""


async def _ollama_chat(messages: list[dict], system_prompt: str, max_tokens: int) -> str:
    # Ollama는 키를 검사하지 않지만 SDK가 빈 값을 거부해서 자리표시 값을 준다.
    return await _openai_chat(
        messages, system_prompt, max_tokens,
        api_key="ollama", base_url=settings.OLLAMA_BASE_URL, model=settings.OLLAMA_MODEL,
    )


async def _claude_chat(messages: list[dict], system_prompt: str, max_tokens: int) -> str:
    import anthropic

    api_key = _validate_api_key(settings.ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY")
    client = anthropic.AsyncAnthropic(api_key=api_key, timeout=settings.LLM_TIMEOUT, max_retries=0)
    request = dict(model=settings.CLAUDE_MODEL, max_tokens=max_tokens, system=system_prompt, messages=messages)
    # 사고(thinking) 블록을 쓰는 모델은 생각에 토큰을 다 써서 max_tokens에 닿으면 본문 없이 끝난다("빈 응답").
    # 챗봇·케어 문구는 생각이 필요 없는 짧은 생성이라 끈다. SDK가 옛 버전이라 extra_body로 보낸다.
    try:
        response = await client.messages.create(**request, extra_body={"thinking": {"type": "disabled"}})
    except anthropic.BadRequestError:
        # 이 옵션을 모르는 모델이면 기본값으로 한 번 더 시도한다.
        response = await client.messages.create(**request)
    # 응답은 블록 여러 개일 수 있다 — 모델에 따라 첫 블록의 text가 비어(None) 있고 실제 답이 뒤 블록에 온다.
    # content[0].text만 읽으면 None이 되어 챗봇이 빈 답을 내거나 500이 났다.
    text = "".join(getattr(b, "text", None) or "" for b in response.content if getattr(b, "type", "text") == "text")
    if not text.strip():
        # 빈 답이 오면 이유를 남긴다(길이 초과·거절·블록 구성). 호출 계층이 다음 공급자로 넘어간다.
        log.warning(
            "claude_empty_response",
            stop_reason=response.stop_reason,
            blocks=[getattr(b, "type", type(b).__name__) for b in response.content],
            output_tokens=getattr(response.usage, "output_tokens", None),
        )
    return text


# ── 도구 호출 ─────────────────────────────────────────────────────────────
#
# 모델이 우리 계산 엔진(대체품·궁합·예산 루틴 등)을 도구로 불러 쓰게 한다. 도구는 이름·설명·JSON 스키마로 알리고,
# 모델이 부르면 `run_tool(이름, 인자) -> dict`로 실행해 결과를 돌려준 뒤 다시 답을 받는다(최대 `max_rounds`번).
# 사실(제품·가격·점수)은 도구 결과에서만 나오게 하는 것이 목적이라, 도구 실행은 호출처가 책임진다(여기는 중개만 한다).
#
# 공급자마다 메시지 형식이 달라 따로 구현하고, 체인 규칙(실패·빈 응답이면 다음 공급자)은 `chat_completion`과 같다.

import json  # noqa: E402
from collections.abc import Awaitable, Callable  # noqa: E402

ToolSpec = dict          # {"name": str, "description": str, "parameters": JSON 스키마(object)}
ToolRunner = Callable[[str, dict], Awaitable[dict]]
MAX_TOOL_RESULT_CHARS = 6000


def _tool_result_text(result: dict) -> str:
    """도구 결과를 모델에 줄 문자열로. 너무 길면 자른다(토큰 폭주 방지)."""
    text = json.dumps(result, ensure_ascii=False, default=str)
    return text if len(text) <= MAX_TOOL_RESULT_CHARS else text[:MAX_TOOL_RESULT_CHARS] + '…(이하 생략)'


async def chat_with_tools(
    messages: list[dict],
    system_prompt: str,
    tools: list[ToolSpec],
    run_tool: ToolRunner,
    max_rounds: int = 4,
    max_tokens: int = 1024,
) -> str:
    """도구를 쓸 수 있는 대화. 반환은 최종 답 문자열이고, 전부 실패하거나 빈 답이면 `LLMUnavailable`."""
    errors: list[str] = []
    for name in provider_chain():
        try:
            if name == "claude":
                text = await _claude_tools(messages, system_prompt, tools, run_tool, max_rounds, max_tokens)
            elif name == "openai":
                text = await _openai_tools(messages, system_prompt, tools, run_tool, max_rounds, max_tokens)
            else:
                text = await _openai_tools(
                    messages, system_prompt, tools, run_tool, max_rounds, max_tokens,
                    api_key="ollama", base_url=settings.OLLAMA_BASE_URL, model=settings.OLLAMA_MODEL,
                )
            if text and text.strip():
                return text
            errors.append(f"{name}: 빈 응답")
            log.warning("llm_tools_empty", provider=name)
        except Exception as exc:  # noqa: BLE001 — 어떤 실패든 다음 공급자로 넘어간다
            errors.append(f"{name}: {type(exc).__name__}")
            log.warning("llm_tools_failed", provider=name, error=str(exc)[:200])
    raise LLMUnavailable("모든 LLM 공급자가 실패했습니다: " + ", ".join(errors or ["공급자 없음"]))


async def _claude_tools(
    messages: list[dict], system_prompt: str, tools: list[ToolSpec], run_tool: ToolRunner,
    max_rounds: int, max_tokens: int,
) -> str:
    import anthropic

    api_key = _validate_api_key(settings.ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY")
    client = anthropic.AsyncAnthropic(api_key=api_key, timeout=settings.LLM_TIMEOUT, max_retries=0)
    specs = [{"name": t["name"], "description": t["description"], "input_schema": t["parameters"]} for t in tools]
    convo: list[dict] = [dict(m) for m in messages]
    for round_no in range(max_rounds + 1):
        request = dict(model=settings.CLAUDE_MODEL, max_tokens=max_tokens, system=system_prompt, messages=convo)
        # 마지막 라운드에는 도구를 주지 않아 반드시 글로 마무리하게 한다
        if round_no < max_rounds:
            request["tools"] = specs
        try:
            response = await client.messages.create(**request, extra_body={"thinking": {"type": "disabled"}})
        except anthropic.BadRequestError:
            response = await client.messages.create(**request)
        uses = [b for b in response.content if getattr(b, "type", "") == "tool_use"]
        if not uses:
            return "".join(getattr(b, "text", None) or "" for b in response.content if getattr(b, "type", "") == "text")
        convo.append({"role": "assistant", "content": [b.model_dump() if hasattr(b, "model_dump") else b for b in response.content]})
        results = []
        for u in uses:
            try:
                out = await run_tool(u.name, dict(u.input or {}))
            except Exception as exc:  # noqa: BLE001 — 도구 오류는 모델에게 알리고 계속한다
                log.warning("llm_tool_error", tool=u.name, error=str(exc)[:200])
                out = {"error": "도구를 실행하지 못했어요"}
            results.append({"type": "tool_result", "tool_use_id": u.id, "content": _tool_result_text(out)})
        convo.append({"role": "user", "content": results})
    return ""


async def _openai_tools(
    messages: list[dict], system_prompt: str, tools: list[ToolSpec], run_tool: ToolRunner,
    max_rounds: int, max_tokens: int,
    *, api_key: str | None = None, base_url: str | None = None, model: str | None = None,
) -> str:
    from openai import AsyncOpenAI

    key = api_key if api_key is not None else _validate_api_key(settings.OPENAI_API_KEY, "OPENAI_API_KEY")
    client = AsyncOpenAI(api_key=key, base_url=base_url, timeout=settings.LLM_TIMEOUT, max_retries=0)
    specs = [
        {"type": "function", "function": {"name": t["name"], "description": t["description"], "parameters": t["parameters"]}}
        for t in tools
    ]
    convo: list[dict] = [{"role": "system", "content": system_prompt}] + [dict(m) for m in messages]
    for round_no in range(max_rounds + 1):
        kwargs: dict = dict(model=model or settings.LLM_MODEL, messages=convo, max_tokens=max_tokens, temperature=0.7)
        if round_no < max_rounds:
            kwargs["tools"] = specs
        response = await client.chat.completions.create(**kwargs)
        msg = response.choices[0].message
        calls = getattr(msg, "tool_calls", None) or []
        if not calls:
            return msg.content or ""
        convo.append({
            "role": "assistant", "content": msg.content or "",
            "tool_calls": [
                {"id": c.id, "type": "function", "function": {"name": c.function.name, "arguments": c.function.arguments}}
                for c in calls
            ],
        })
        for c in calls:
            try:
                args = json.loads(c.function.arguments or "{}")
                out = await run_tool(c.function.name, args if isinstance(args, dict) else {})
            except Exception as exc:  # noqa: BLE001
                log.warning("llm_tool_error", tool=c.function.name, error=str(exc)[:200])
                out = {"error": "도구를 실행하지 못했어요"}
            convo.append({"role": "tool", "tool_call_id": c.id, "content": _tool_result_text(out)})
    return ""
