"""챗봇 도구 호출 — 모델이 계산 엔진을 부르고, 담기는 제안만 한다 (퍼스널 AI 2단계).

이 파일은 **DB·Redis가 필요한 쪽**(tests/integration)이다. DB 없이 도는 테스트는 `tests/unit/test_chat_tools.py`에 있다.

순수 함수와 도구 루프는 DB 없이, 도구 구현과 API 연동은 로컬 DB의 시연 계정(조은성)으로 확인한다.
"""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from app.config import settings
from app.db.session import AsyncSessionLocal
from app.services.chat import chat_tools
from app.services.chat.llm import LLMUnavailable
from app.services.personal_ai.personal_context import ClosetEntry, PersonalSnapshot

pytestmark = pytest.mark.asyncio(loop_scope="session")

DEMO_EMAIL = "eunseong@swappy.app"
DEMO_PASSWORD = "swappy1234"


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


async def test_analyze_product_returns_ingredients_functions_and_cautions() -> None:
    async with AsyncSessionLocal() as db:
        ctx = _ctx(db)
        out = await chat_tools.make_runner(ctx)("analyze_product", {"product_id": 712})
        assert "error" in await chat_tools.make_runner(ctx)("analyze_product", {"product_id": 99_999_999})
    assert out["total_count"] > 0 and out["labeled_count"] > 0     # 성분표가 비어 있다고 말하게 되면 안 된다
    assert out["key_ingredients"] and {"name", "functions", "order"} <= set(out["key_ingredients"][0])
    assert out["function_strength"] and isinstance(out["cautions"], list)
    assert ctx.cards and ctx.cards[0]["id"] == 712


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
        from app.services.personal_ai import personal_context

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
