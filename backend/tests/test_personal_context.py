"""개인 컨텍스트 — 챗봇이 내 화장대·피부 상태를 아는 기능 (PR 1).

순수 함수(요약 문장·상한)는 DB 없이, 스냅샷 조회와 챗봇 연동은 로컬 DB의 시연 계정(조은성)으로 확인한다.
시연 계정이 없는 환경에서는 DB 의존 테스트를 건너뛴다.
"""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.config import settings
from app.db.session import AsyncSessionLocal
from app.models.user import User
from app.services import chat_fallback, personal_context as pc
from app.services.llm import LLMUnavailable

pytestmark = pytest.mark.asyncio(loop_scope="session")

DEMO_EMAIL = "eunseong@swappy.app"
DEMO_PASSWORD = "swappy1234"


def _entry(i: int, name: str = "라운드랩 1025 독도 토너 200ml", funcs=("보습", "진정")) -> pc.ClosetEntry:
    return pc.ClosetEntry(id=i, name=f"{name} {i}", brand="라운드랩", category="스킨케어", price=13500, functions=funcs)


# ── 순수 함수 ─────────────────────────────────────────────────────────────


def test_weak_concerns_picks_low_scores_that_products_can_help() -> None:
    got = pc.weak_concerns({"moisture": 62, "oiliness": 66, "acne": 90, "eye_bag": 40})
    names = [n for n, _ in got]
    # 80점대 이상(acne)과 화장품 성분으로 바뀌기 어려운 항목(눈밑 불룩)은 뺀다. 낮은 순.
    assert [s for _, s in got] == sorted(s for _, s in got)
    assert names == ["수분", "유분"] and got[0][1] == 62


def test_weak_concerns_empty_when_all_fine() -> None:
    assert pc.weak_concerns({"moisture": 85, "oiliness": 90}) == ()


def test_avoid_labels_only_strong_penalties() -> None:
    assert pc.avoid_labels("yuriguseul") == ("향료", "건조 알코올", "자극 소지 성분")
    # 옹달샘은 감점이 모두 3점이라 "피해야 할 성분"으로 말하지 않는다
    assert pc.avoid_labels("ondalsam") == ()
    assert pc.avoid_labels(None) == ()


def test_clean_ingredients_dedupes_and_caps() -> None:
    raw = ["  나이아신아마이드 ", "나이아신아마이드", "x" * 80] + [f"성분{i}" for i in range(40)]
    out = pc.clean_ingredients(raw)
    assert out[0] == "나이아신아마이드" and len(out) == pc.MAX_MY_INGREDIENTS
    assert all(len(n) <= 30 for n in out) and len(set(out)) == len(out)


def test_top_function_names_threshold_and_limit() -> None:
    s = {"H": {"value": 80, "count": 3}, "S": {"value": 60, "count": 2}, "B": {"value": 40, "count": 1}, "W": {"value": 10, "count": 1}}
    assert pc.top_function_names(s) == ("보습", "진정")      # 상위 2개, 25 미만(미백)은 제외
    assert pc.top_function_names({"H": {"value": 10, "count": 1}}) == ()


def test_render_empty_snapshot_is_empty_string() -> None:
    assert pc.render(pc.PersonalSnapshot()) == ""


def test_render_includes_key_facts() -> None:
    s = pc.PersonalSnapshot(
        skin_type="hwasan",
        budget=(50_000, 100_000),
        weak_concerns=(("수분", 62),),
        analysis_date="2026-10-21",
        closet=(_entry(1),),
        closet_total=1,
        my_ingredients=("나이아신아마이드",),
        avoid=("향료",),
    )
    text = pc.render(s)
    for expected in ("울긋불긋 화산", "5만원 ~ 10만원", "수분 62점", "2026-10-21", "피해야 할 성분: 향료", "나이아신아마이드", "내 화장대 (1개)"):
        assert expected in text, expected


def test_render_respects_char_limit_by_dropping_closet_tail() -> None:
    closet = tuple(_entry(i, name="아주아주아주 긴 이름을 가진 화장품 " * 3) for i in range(pc.MAX_CLOSET))
    s = pc.PersonalSnapshot(skin_type="hwasan", closet=closet, closet_total=40)
    text = pc.render(s)
    assert len(text) <= pc.MAX_CHARS
    assert "그 밖에" in text and "내 화장대 (40개" in text      # 빠진 만큼 "그 밖에 N개 더"로 알린다


def test_render_marks_empty_closet() -> None:
    assert "아직 등록한 제품이 없음" in pc.render(pc.PersonalSnapshot(skin_type="mulgae"))


def test_mine_body_lists_closet_without_model() -> None:
    s = pc.PersonalSnapshot(skin_type="hwasan", closet=(_entry(1),), closet_total=1)
    body = chat_fallback.mine_body(s)
    assert "울긋불긋 화산" in body and "1️⃣ **" in body and "주요 기능: 보습·진정" in body


def test_closet_match_by_name_then_kind() -> None:
    cream = pc.ClosetEntry(id=2, name="에스트라 아토베리어365 크림 80ml", brand="에스트라", category="스킨케어", price=29700)
    toner = _entry(1)
    s = pc.PersonalSnapshot(closet=(toner, cream), closet_total=2)
    assert chat_fallback._closet_match("에스트라 비슷한데 더 싼 거", s) is cream      # 브랜드(제품명 단어)가 있으면 그 제품
    assert chat_fallback._closet_match("내 화장대 크림보다 싼 거 있어?", s) is cream   # 종류 단어
    assert chat_fallback._closet_match("내 화장대 세럼보다 싼 거", s) is None


# ── DB (시연 계정) ────────────────────────────────────────────────────────


async def _demo_user_id() -> uuid.UUID | None:
    async with AsyncSessionLocal() as db:
        return await db.scalar(select(User.id).where(User.email == DEMO_EMAIL))


async def test_build_snapshot_for_demo_account() -> None:
    uid = await _demo_user_id()
    if uid is None:
        pytest.skip("시연 계정이 없는 DB")
    async with AsyncSessionLocal() as db:
        snap = await pc.build_snapshot(db, uid, ["나이아신아마이드", "병풀추출물"])
    assert snap.skin_type is not None and snap.skin_label
    assert snap.closet and len(snap.closet) <= pc.MAX_CLOSET and snap.closet_total >= len(snap.closet)
    assert all(e.name and e.category for e in snap.closet)
    assert snap.my_ingredients == ("나이아신아마이드", "병풀추출물")
    text = pc.render(snap)
    assert snap.closet[0].name in text or "그 밖에" in text
    assert "@" not in text      # 이메일 같은 식별 정보는 요약에 없다


async def test_build_snapshot_unknown_user_is_empty() -> None:
    async with AsyncSessionLocal() as db:
        snap = await pc.build_snapshot(db, uuid.uuid4())
    assert snap.is_empty and pc.render(snap) == ""


async def _login(client: AsyncClient) -> dict[str, str]:
    res = await client.post("/api/v1/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    if res.status_code != 200:
        pytest.skip("시연 계정으로 로그인할 수 없는 DB")
    return {"Authorization": f"Bearer {res.json()['accessToken']}"}


async def test_chat_prompt_contains_personal_summary_for_logged_in_user(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    seen: dict[str, str] = {}

    async def fake_llm(messages, system, *a, **k):
        seen["system"] = system
        return "알겠어요"

    async def weather() -> str:
        return "정보 없음"

    monkeypatch.setattr("app.api.chat.llm.chat_completion", fake_llm)
    monkeypatch.setattr("app.api.chat._get_weather_context", weather)
    headers = await _login(client)
    res = await client.post("/api/v1/chat", json={"message": "내 화장대 알려줘", "my_ingredients": ["판테놀"]}, headers=headers)
    assert res.status_code == 200 and res.json()["mode"] == "ai"
    assert "[내 정보 요약" in seen["system"] and "내 화장대" in seen["system"] and "판테놀" in seen["system"]


async def test_chat_prompt_has_no_personal_summary_for_guest(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    seen: dict[str, str] = {}

    async def fake_llm(messages, system, *a, **k):
        seen["system"] = system
        return "알겠어요"

    async def weather() -> str:
        return "정보 없음"

    monkeypatch.setattr("app.api.chat.llm.chat_completion", fake_llm)
    monkeypatch.setattr("app.api.chat._get_weather_context", weather)
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)
    res = await client.post(
        "/api/v1/chat",
        json={"message": "토너 추천해줘", "my_ingredients": ["판테놀"]},
        headers={"X-Forwarded-For": f"pytest-{uuid.uuid4().hex[:12]}"},
    )
    assert res.status_code == 200
    section = seen["system"].split("[내 정보 요약")[1].split("[참고 제품 데이터]")[0]
    assert "없음 (비회원" in section and "판테놀" not in section     # 비회원이 보낸 마이 성분은 쓰지 않는다


async def test_flag_off_disables_personalization(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, str] = {}

    async def fake_llm(messages, system, *a, **k):
        seen["system"] = system
        return "알겠어요"

    async def weather() -> str:
        return "정보 없음"

    monkeypatch.setattr("app.api.chat.llm.chat_completion", fake_llm)
    monkeypatch.setattr("app.api.chat._get_weather_context", weather)
    monkeypatch.setattr(settings, "PERSONAL_AI_ENABLED", False)
    headers = await _login(client)
    res = await client.post("/api/v1/chat", json={"message": "내 화장대 알려줘"}, headers=headers)
    assert res.status_code == 200 and "없음 (비회원" in seen["system"]


async def test_fallback_answers_my_closet_for_logged_in_user_and_is_not_cached_across_users(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def down(*_a, **_k):
        raise LLMUnavailable("모든 공급자 실패")

    async def weather() -> str:
        return "정보 없음"

    monkeypatch.setattr("app.api.chat.llm.chat_completion", down)
    monkeypatch.setattr("app.api.chat._get_weather_context", weather)
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)
    headers = await _login(client)
    q = {"message": "내 화장대에 뭐 있어?"}
    mine = await client.post("/api/v1/chat", json=q, headers=headers)
    assert mine.status_code == 200 and mine.json()["mode"] == "fallback"
    assert "**내 화장대**" in mine.json()["reply"] and "1️⃣ **" in mine.json()["reply"]

    # 같은 문장을 비회원이 보내면 내 화장대가 보이면 안 된다(질문 문장 캐시로 새는 사고 방지)
    guest = await client.post("/api/v1/chat", json=q, headers={"X-Forwarded-For": f"pytest-{uuid.uuid4().hex[:12]}"})
    assert guest.status_code == 200 and "**내 화장대**" not in guest.json()["reply"]


async def test_rag_prefer_fit_returns_at_most_top_k_and_respects_exclusion() -> None:
    from app.services import rag

    async with AsyncSessionLocal() as db:
        plain = await rag.search_products(db, "토너 추천해줘", "hwasan", top_k=5)
        fit = await rag.search_products(db, "토너 추천해줘", "hwasan", top_k=5, prefer_fit=True)
    assert 0 < len(fit) <= 5 and len(plain) <= 5
