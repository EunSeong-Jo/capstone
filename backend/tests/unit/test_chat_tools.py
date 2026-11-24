"""챗봇 도구 호출 — 모델이 계산 엔진을 부르고, 담기는 제안만 한다 (퍼스널 AI 2단계).

이 파일은 **DB·Redis 없이 도는 쪽**(tests/unit)이다. DB가 필요한 테스트는 `tests/integration/test_chat_tools.py`에 있다.

순수 함수와 도구 루프는 DB 없이, 도구 구현과 API 연동은 로컬 DB의 시연 계정(조은성)으로 확인한다.
"""
from __future__ import annotations

import pytest

from app.api.chat import _mentioned_cards
from app.config import settings
from app.services.chat import chat_tools, llm
from app.services.chat.llm import LLMUnavailable

pytestmark = pytest.mark.asyncio(loop_scope="session")


# ── 순수 함수 ─────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "text,expected",
    [
        ("7만원으로 루틴 짜줘", 70_000),
        ("5.5만원 예산으로", 55_000),
        ("70,000원 안에서", 70_000),
        ("3만원에서 10만원 사이", 100_000),     # 여러 개면 큰 값이 최대 예산
        ("1000원짜리", None),                    # 너무 작으면 예산이 아니다
        ("예산 알려줘", None),
        ("2000만원", None),                      # 상한(100만원) 초과는 무시
    ],
)
def test_parse_budget(text: str, expected: int | None) -> None:
    assert chat_tools.parse_budget(text) == expected


def test_wants_routine_and_cart() -> None:
    assert chat_tools.wants_routine("7만원으로 루틴 짜줘")
    assert not chat_tools.wants_routine("루틴 짜줘")            # 금액이 없으면 루틴 도구를 못 부른다
    assert not chat_tools.wants_routine("7만원이야")             # 루틴 말이 없으면 아니다
    assert chat_tools.wants_cart("장바구니에 담아 줘")
    assert not chat_tools.wants_cart("장바구니 보여줘")


def test_clamp_and_bool() -> None:
    assert chat_tools._clamp("999999999", 0, 1_000_000, 0) == 1_000_000
    assert chat_tools._clamp("abc", 0, 10, 3) == 3
    assert chat_tools._clamp(-5, 0, 10, 3) == 0
    assert chat_tools._as_bool(True) and chat_tools._as_bool("true") and not chat_tools._as_bool("false")
    assert not chat_tools._as_bool(None)


def test_tool_specs_are_wellformed_and_match_handlers() -> None:
    names = [t["name"] for t in chat_tools.TOOLS]
    assert len(names) == len(set(names)) and set(names) == set(chat_tools.TOOL_NAMES)
    for t in chat_tools.TOOLS:
        assert t["description"] and t["parameters"]["type"] == "object"
        assert set(t["parameters"].get("required", [])) <= set(t["parameters"]["properties"])


def test_write_tools_only_propose() -> None:
    # 쓰기 도구는 이름이 propose_*이고, 설명이 '실제로 담기지 않는다'를 알린다(모델이 "담았어요"라고 말하지 않게)
    for t in chat_tools.TOOLS:
        if t["name"].startswith("propose_"):
            assert "제안" in t["description"] and "실제로 담기지 않" in t["description"]


def test_mentioned_cards_keeps_only_cards_named_in_reply() -> None:
    cards = [
        {"id": 1, "name": "라운드랩 1025 독도 토너 200ml"},
        {"id": 2, "name": "에스트라 아토베리어365 크림 80ml"},
        {"id": 3, "name": "말하지 않은 제품 하나 둘 셋"},
    ]
    got = _mentioned_cards(cards, "라운드랩 1025 독도 토너와 에스트라 아토베리어365 크림을 추천해요")
    assert [c["id"] for c in got] == [1, 2]
    # 하나도 못 찾으면 앞쪽 몇 개만
    assert [c["id"] for c in _mentioned_cards(cards, "전혀 다른 말")] == [1, 2, 3]


def test_mentioned_cards_matches_when_model_drops_the_brand() -> None:
    cards = [{"id": 1, "brand": "라운드랩", "name": "라운드랩 포 맨 소나무 진정 시카 토너 200ml"}, {"id": 2, "brand": "코스노리", "name": "코스노리 판테놀 베리어 토너 205ml"}]
    got = _mentioned_cards(cards, "1️⃣ **포 맨 소나무 진정 시카 토너 200ml**\n2️⃣ **판테놀 베리어 토너 205ml**")
    assert [c["id"] for c in got] == [1, 2]


def test_routine_reply_formats_without_model() -> None:
    result = {
        "budget": [0, 70_000],
        "combinations": [
            {"label": "알뜰", "total": 56_300, "remaining": 13_700, "reason": "",
             "items": [{"step": "토너", "id": 1, "name": "A 토너", "brand": "A", "price": 15_000}]},
        ],
        "missing_steps": ["선크림"],
        "min_possible_total_for_full_routine": None,
    }
    text = chat_tools.routine_reply(result, ask_cart=True)
    assert "7" in text and "알뜰안" in text and "A 토너" in text and "선크림 단계는 뺐어요" in text and "장바구니" in text
    assert "맞는 조합을 찾지 못했어요" in chat_tools.routine_reply({"budget": [0, 10_000], "combinations": [], "min_possible_total_for_full_routine": 40_000}, False)
    assert "40,000원" in chat_tools.routine_reply({"budget": [0, 10_000], "combinations": [], "min_possible_total_for_full_routine": 40_000}, False)


# ── 도구 루프 (가짜 Anthropic 클라이언트) ─────────────────────────────────


class _Block:
    def __init__(self, type_: str, **kw) -> None:
        self.type = type_
        self.__dict__.update(kw)

    def model_dump(self) -> dict:
        return {k: v for k, v in self.__dict__.items()}


class _Resp:
    def __init__(self, blocks: list[_Block]) -> None:
        self.content = blocks


def _fake_claude(monkeypatch: pytest.MonkeyPatch, script: list[list[_Block]], seen: list[dict]) -> None:
    import anthropic

    queue = list(script)

    class _Messages:
        async def create(self, **kw):
            seen.append(kw)
            return _Resp(queue.pop(0))

    class _Client:
        def __init__(self, **_kw) -> None:
            self.messages = _Messages()

    monkeypatch.setattr(anthropic, "AsyncAnthropic", _Client)
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "sk-ant-test")
    monkeypatch.setattr(settings, "LLM_PROVIDER", "claude")
    monkeypatch.setattr(settings, "LLM_CHAIN", "claude")


async def test_tool_loop_runs_tool_feeds_result_back_and_returns_text(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, dict]] = []
    seen: list[dict] = []
    _fake_claude(
        monkeypatch,
        [
            [_Block("text", text="확인해 볼게요"), _Block("tool_use", id="t1", name="find_products", input={"query": "토너"})],
            [_Block("text", text="토너를 찾았어요")],
        ],
        seen,
    )

    async def run(name: str, args: dict) -> dict:
        calls.append((name, args))
        return {"products": [{"id": 1, "name": "토너"}]}

    out = await llm.chat_with_tools([{"role": "user", "content": "토너"}], "sys", chat_tools.TOOLS, run)
    assert out == "토너를 찾았어요"
    assert calls == [("find_products", {"query": "토너"})]
    # 두 번째 호출에는 도구 결과(tool_result)가 user 메시지로 들어간다
    second = seen[1]["messages"][-1]
    assert second["role"] == "user" and second["content"][0]["type"] == "tool_result" and second["content"][0]["tool_use_id"] == "t1"
    assert "tools" in seen[0]


async def test_tool_loop_last_round_has_no_tools_so_model_must_answer(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[dict] = []
    loop = [_Block("tool_use", id="t", name="find_products", input={"query": "x"})]
    _fake_claude(monkeypatch, [list(loop), list(loop), [_Block("text", text="끝")]], seen)

    async def run(name: str, args: dict) -> dict:
        return {"ok": True}

    out = await llm.chat_with_tools([{"role": "user", "content": "q"}], "sys", chat_tools.TOOLS, run, max_rounds=2)
    assert out == "끝"
    assert len(seen) == 3 and "tools" in seen[0] and "tools" in seen[1] and "tools" not in seen[2]


async def test_tool_error_is_reported_to_model_not_raised(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[dict] = []
    _fake_claude(
        monkeypatch,
        [[_Block("tool_use", id="t", name="find_products", input={})], [_Block("text", text="죄송해요")]],
        seen,
    )

    async def run(name: str, args: dict) -> dict:
        raise RuntimeError("DB 장애")

    out = await llm.chat_with_tools([{"role": "user", "content": "q"}], "sys", chat_tools.TOOLS, run)
    assert out == "죄송해요"
    assert "실행하지 못했어요" in seen[1]["messages"][-1]["content"][0]["content"]


async def test_tool_loop_all_empty_raises_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    _fake_claude(monkeypatch, [[_Block("text", text="")]], [])

    async def run(name: str, args: dict) -> dict:
        return {}

    with pytest.raises(LLMUnavailable):
        await llm.chat_with_tools([], "sys", chat_tools.TOOLS, run)


def test_tidy_reply_drops_honorifics_and_extra_blank_lines() -> None:
    from app.api.chat import _tidy_reply

    assert _tidy_reply("사용자님 취향 성분이 들어 있어요.") == "취향 성분이 들어 있어요."
    assert _tidy_reply("회원님의 피부는 건조해요.\n\n\n\n좋아요") == "피부는 건조해요.\n\n좋아요"
    assert _tidy_reply("고객님께서 고르신") == "고르신"
    assert _tidy_reply("그냥 문장") == "그냥 문장"


def test_tidy_reply_removes_product_numbers() -> None:
    from app.api.chat import _tidy_reply

    assert _tidy_reply("라운드랩 독도 클렌저(#867)와 비슷해요") == "라운드랩 독도 클렌저와 비슷해요"
    assert _tidy_reply("제품 #12345 입니다") == "제품 입니다"


def test_mentioned_cards_without_fallback_returns_empty_when_nothing_named() -> None:
    cards = [{"id": 1, "brand": "라운드랩", "name": "라운드랩 독도 토너"}]
    assert _mentioned_cards(cards, "전혀 다른 말", fallback=False) == []
