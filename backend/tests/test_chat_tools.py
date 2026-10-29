"""챗봇 도구 호출 — 모델이 계산 엔진을 부르고, 담기는 제안만 한다 (퍼스널 AI 2단계).

순수 함수와 도구 루프는 DB 없이, 도구 구현과 API 연동은 로컬 DB의 시연 계정(조은성)으로 확인한다.
"""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient

from app.api.chat import _mentioned_cards
from app.config import settings
from app.db.session import AsyncSessionLocal
from app.services import chat_tools, llm
from app.services.llm import LLMUnavailable
from app.services.personal_context import ClosetEntry, PersonalSnapshot

pytestmark = pytest.mark.asyncio(loop_scope="session")

DEMO_EMAIL = "eunseong@swappy.app"
DEMO_PASSWORD = "swappy1234"


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


# ── 도구 구현 (시연 계정 DB) ──────────────────────────────────────────────


def _ctx(db, skin: str | None = "hwasan") -> chat_tools.ToolContext:
    snap = PersonalSnapshot(skin_type=skin, closet=(ClosetEntry(712, "에스트라 아토베리어365 크림 80ml", "에스트라", "스킨케어", 29700),), closet_total=1)
    return chat_tools.ToolContext(db=db, skin_type=skin, snapshot=snap)


async def test_unknown_tool_and_bad_ids_are_errors_not_crashes() -> None:
    async with AsyncSessionLocal() as db:
        run = chat_tools.make_runner(_ctx(db))
        assert "error" in await run("drop_database", {})
        assert "error" in await run("find_alternatives", {"product_id": "abc"})
        assert "error" in await run("find_alternatives", {"product_id": 99_999_999})
        assert "error" in await run("check_skin_fit", {"product_id": None})
        assert "error" in await run("find_products", {"query": "   "})
        assert "error" in await run("build_routine", {"budget_max": 0})


async def test_find_products_returns_cards_and_ids() -> None:
    async with AsyncSessionLocal() as db:
        ctx = _ctx(db)
        out = await chat_tools.make_runner(ctx)("find_products", {"query": "토너"})
    assert out["products"] and all({"id", "name", "price"} <= set(p) for p in out["products"])
    assert ctx.cards and len(ctx.cards) <= chat_tools.MAX_CARDS


async def test_find_alternatives_cheaper_only() -> None:
    async with AsyncSessionLocal() as db:
        ctx = _ctx(db)
        out = await chat_tools.make_runner(ctx)("find_alternatives", {"product_id": 712, "cheaper_only": True})
    assert out["seed"]["id"] == 712 and out["alternatives"]
    assert all(a["price_difference"] < 0 for a in out["alternatives"])      # 쓰던 제품보다 싼 것만
    assert all(0 < a["ingredient_similarity_percent"] <= 100 for a in out["alternatives"])


async def test_check_skin_fit_needs_skin_type() -> None:
    async with AsyncSessionLocal() as db:
        out = await chat_tools.make_runner(_ctx(db, skin=None))("check_skin_fit", {"product_id": 712})
        assert "error" in out
        ok = await chat_tools.make_runner(_ctx(db))("check_skin_fit", {"product_id": 712})
    assert ok["score"] is not None and ok["verdict"] and ok["product"]["id"] == 712


async def test_build_routine_stays_in_budget_and_excludes_closet() -> None:
    async with AsyncSessionLocal() as db:
        ctx = _ctx(db)
        out = await chat_tools.make_runner(ctx)("build_routine", {"budget_max": 70_000})
    assert out["combinations"]
    for c in out["combinations"]:
        assert c["total"] <= 70_000
        assert all(i["id"] != 712 for i in c["items"])                       # 화장대에 있는 제품은 뺀다
    # 예산 상한을 넘는 값은 잘린다
    async with AsyncSessionLocal() as db:
        big = await chat_tools.make_runner(_ctx(db))("build_routine", {"budget_max": 10**12})
    assert big["budget"][1] == 1_000_000


async def test_propose_tools_only_propose() -> None:
    async with AsyncSessionLocal() as db:
        ctx = _ctx(db)
        run = chat_tools.make_runner(ctx)
        out = await run("propose_add_to_cart", {"product_id": 712})
        await run("propose_add_to_cart", {"product_id": 712})              # 중복 제안은 한 번만
        await run("propose_add_to_closet", {"product_id": 712})
    assert out["proposed"] is True and "담았어요" in out["note"]            # 모델에게 '담았다고 말하지 말라'고 알린다
    assert [(a["type"], a["productId"]) for a in ctx.actions] == [("add_to_cart", 712), ("add_to_closet", 712)]


# ── API 연동 ──────────────────────────────────────────────────────────────


async def _login(client: AsyncClient) -> dict[str, str]:
    res = await client.post("/api/v1/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    if res.status_code != 200:
        pytest.skip("시연 계정으로 로그인할 수 없는 DB")
    return {"Authorization": f"Bearer {res.json()['accessToken']}"}


@pytest.fixture
def _no_weather(monkeypatch: pytest.MonkeyPatch) -> None:
    async def weather() -> str:
        return "정보 없음"

    monkeypatch.setattr("app.api.chat._get_weather_context", weather)


async def test_chat_returns_cards_and_proposals_but_does_not_touch_cart(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch, _no_weather: None
) -> None:
    async def fake_tools(messages, system, tools, run_tool, **_k):
        await run_tool("propose_add_to_cart", {"product_id": 712})
        return "에스트라 아토베리어365 크림을 장바구니에 담을 수 있어요"

    monkeypatch.setattr("app.api.chat.llm.chat_with_tools", fake_tools)
    headers = await _login(client)
    before = (await client.get("/api/v1/me/cart", headers=headers)).json()
    res = await client.post("/api/v1/chat", json={"message": "에스트라 크림 담아줘"}, headers=headers)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["mode"] == "ai" and [c["id"] for c in body["cards"]] == [712]
    assert body["actions"][0]["type"] == "add_to_cart" and body["actions"][0]["productId"] == 712
    after = (await client.get("/api/v1/me/cart", headers=headers)).json()
    assert after == before                                                   # 제안만 했다 — 장바구니는 그대로


async def test_cart_request_without_tool_call_still_gets_proposals_from_mentioned_cards(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch, _no_weather: None
) -> None:
    async def fake_tools(messages, system, tools, run_tool, **_k):
        await run_tool("find_products", {"query": "아토베리어365 크림"})      # 찾기만 하고 제안 도구는 안 부른다
        return "에스트라 아토베리어365 크림 80ml가 좋아요"

    monkeypatch.setattr("app.api.chat.llm.chat_with_tools", fake_tools)
    headers = await _login(client)
    res = await client.post("/api/v1/chat", json={"message": "아토베리어365 크림 장바구니에 담아줘"}, headers=headers)
    body = res.json()
    assert res.status_code == 200 and body["actions"] and all(a["type"] == "add_to_cart" for a in body["actions"])
    assert {a["productId"] for a in body["actions"]} <= {c["id"] for c in body["cards"]}


async def test_guest_never_gets_tools(client: AsyncClient, monkeypatch: pytest.MonkeyPatch, _no_weather: None) -> None:
    async def boom(*_a, **_k):
        raise AssertionError("비회원에게 도구를 쓰면 안 된다")

    async def plain(messages, system, *a, **k):
        return "일반 답변"

    monkeypatch.setattr("app.api.chat.llm.chat_with_tools", boom)
    monkeypatch.setattr("app.api.chat.llm.chat_completion", plain)
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)
    res = await client.post(
        "/api/v1/chat", json={"message": "7만원 루틴 짜줘"}, headers={"X-Forwarded-For": f"pytest-{uuid.uuid4().hex[:12]}"}
    )
    assert res.status_code == 200 and res.json()["reply"] == "일반 답변" and res.json()["actions"] == []


async def test_tools_flag_off_uses_plain_completion(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch, _no_weather: None
) -> None:
    async def boom(*_a, **_k):
        raise AssertionError("플래그가 꺼져 있으면 도구를 쓰면 안 된다")

    async def plain(messages, system, *a, **k):
        return "일반 답변"

    monkeypatch.setattr("app.api.chat.llm.chat_with_tools", boom)
    monkeypatch.setattr("app.api.chat.llm.chat_completion", plain)
    monkeypatch.setattr(settings, "CHAT_TOOLS_ENABLED", False)
    headers = await _login(client)
    res = await client.post("/api/v1/chat", json={"message": "안녕"}, headers=headers)
    assert res.status_code == 200 and res.json()["reply"] == "일반 답변"


async def test_fallback_builds_routine_without_model(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch, _no_weather: None
) -> None:
    async def down(*_a, **_k):
        raise LLMUnavailable("모든 공급자 실패")

    monkeypatch.setattr("app.api.chat.llm.chat_with_tools", down)
    monkeypatch.setattr("app.api.chat.llm.chat_completion", down)
    headers = await _login(client)
    res = await client.post("/api/v1/chat", json={"message": "7만원으로 루틴 짜줘"}, headers=headers)
    body = res.json()
    assert res.status_code == 200 and body["mode"] == "fallback"
    assert "7" in body["reply"] and "알뜰안" in body["reply"] and body["cards"]
    assert body["actions"] == []                                            # 담아 달라는 말이 없으면 제안도 없다

    wanted = await client.post("/api/v1/chat", json={"message": "7만원으로 루틴 짜서 장바구니에 담아줘"}, headers=headers)
    w = wanted.json()
    assert w["mode"] == "fallback" and w["actions"]
    assert {a["productId"] for a in w["actions"]} == {c["id"] for c in w["cards"]}   # 카드마다 [담기]


async def test_recommend_for_me_is_personalized_for_demo_account_and_falls_back_for_new_user() -> None:
    from sqlalchemy import select

    from app.models.user import User

    async with AsyncSessionLocal() as db:
        uid = await db.scalar(select(User.id).where(User.email == DEMO_EMAIL))
        if uid is None:
            pytest.skip("시연 계정이 없는 DB")
        ctx = _ctx(db)
        ctx.user_id = uid
        out = await chat_tools.make_runner(ctx)("recommend_for_me", {"category": "스킨케어"})
        assert out["personalized"] is True and out["products"] and ctx.cards
        assert any(p["reason"] for p in out["products"])                    # 취향 근거(좋아한 성분)가 붙는다
        # 취향이 없는 사용자(없는 id)는 피부타입 기준으로 대신하고 그렇다고 알린다
        cold = _ctx(db)
        cold.user_id = uuid.uuid4()
        out2 = await chat_tools.make_runner(cold)("recommend_for_me", {"category": "없는 종류"})
    assert out2["personalized"] is False and "피부타입 기준" in out2["note"] and out2["products"]


async def test_report_and_briefing_tools_for_demo_account(monkeypatch: pytest.MonkeyPatch) -> None:
    from sqlalchemy import select

    from app.models.user import User

    async def dry() -> dict:
        return {"has": True, "temp": 8, "humidity": 30, "label": "맑음", "condition": "sunny", "season": "autumn", "events": ["건조(습도 30%)"]}

    monkeypatch.setattr("app.api.insights._weather", dry)
    async with AsyncSessionLocal() as db:
        uid = await db.scalar(select(User.id).where(User.email == DEMO_EMAIL))
        if uid is None:
            pytest.skip("시연 계정이 없는 DB")
        from app.services import personal_context

        snap = await personal_context.build_snapshot(db, uid)
        ctx = chat_tools.ToolContext(db=db, skin_type=snap.skin_type, snapshot=snap, user_id=uid)
        run = chat_tools.make_runner(ctx)
        report = await run("get_skin_report", {})
        brief = await run("get_today_briefing", {})
        guest = await chat_tools.make_runner(chat_tools.ToolContext(db=db, skin_type=None, snapshot=None))("get_skin_report", {})
    assert "error" in guest                                              # 비로그인은 쓸 수 없다
    assert report["enough"] in (True, False) and (not report["enough"] or "원인을 단정" not in " ".join(report["notes"]))
    assert report.get("caution") is None or "단정하지" in report["caution"]
    assert brief["headline"] and brief["pick"] and ctx.cards and ctx.cards[0]["id"] == brief["pick"]["id"]
