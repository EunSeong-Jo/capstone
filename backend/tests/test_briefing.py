"""오늘의 개인 브리핑 — 날씨 × 내 약한 항목 × 내 화장대 (퍼스널 AI 4단계)."""
from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import delete

from app.db.session import AsyncSessionLocal
from app.models.user import User
from app.services import briefing as bf
from app.services.personal_context import ClosetEntry, PersonalSnapshot

pytestmark = pytest.mark.asyncio(loop_scope="session")

AUTH = "/api/v1/auth"
ME = "/api/v1/me"
PASSWORD = "Passw0rd!pytest"


def entry(i: int, name: str, **strengths: int) -> ClosetEntry:
    return ClosetEntry(i, name, "브랜드", "스킨케어", 10000, strengths=tuple(strengths.items()))


# ── 날씨가 요구하는 것 ────────────────────────────────────────────────────


def funcs(needs) -> set[str]:
    return {n.func for n in needs}


def test_dry_day_needs_moisture_and_barrier() -> None:
    needs, tips = bf.needs_from_weather(12, 35, [], "cloudy", "autumn")
    assert {"H", "B"} <= funcs(needs) and any("습도 35%" in n.why for n in needs) and tips == []


def test_forecast_events_drive_needs_even_if_now_looks_fine() -> None:
    needs, _ = bf.needs_from_weather(15, 55, ["일교차 12도(최저 8~최고 20도)", "건조(습도 38%)"], "cloudy", "autumn")
    assert {"H", "B"} <= funcs(needs) and any("일교차" in n.why for n in needs)


def test_hot_humid_day_needs_oil_control_and_sunny_needs_uv() -> None:
    needs, _ = bf.needs_from_weather(30, 80, [], "sunny", "summer")
    assert funcs(needs) >= {"P", "U"}


def test_cold_day_needs_barrier_and_no_uv_when_cloudy() -> None:
    needs, _ = bf.needs_from_weather(2, 50, ["추위(최저 2도)"], "cloudy", "winter")
    assert "B" in funcs(needs) and "U" not in funcs(needs)
    assert "U" not in funcs(bf.needs_from_weather(2, 50, [], "sunny", "winter")[0])     # 한겨울 한낮 5도 미만... 아니라 10도 미만이면 자외선 안내 안 함


def test_rain_snow_wind_become_tips_not_product_needs() -> None:
    _, tips = bf.needs_from_weather(14, 60, ["비(오후, 강수확률 70%)", "강풍(저녁)"], "rainy", "autumn")
    assert any("우산" in t for t in tips) and any("바람" in t for t in tips)


def test_unknown_weather_gives_no_needs() -> None:
    assert bf.needs_from_weather(None, None, [], None, None) == ([], [])


# ── 내 약한 항목 ──────────────────────────────────────────────────────────


def test_concern_needs_use_lowest_two_items_with_bonus() -> None:
    needs = bf.needs_from_concerns((("모공", 58), ("수분", 66), ("유분", 69)))
    assert funcs(needs) >= {"P", "E", "H", "B"} and all(n.weight == bf.CONCERN_BONUS for n in needs)
    assert "유분" not in " ".join(n.why for n in needs)                    # 세 번째 항목은 쓰지 않는다
    assert "모공이 58점" in needs[0].why
    assert bf.needs_from_concerns(()) == [] and bf.needs_from_concerns((("모름", 10),)) == []


# ── 제품 고르기 ───────────────────────────────────────────────────────────


def test_pick_product_by_strength_times_need_weight_and_threshold() -> None:
    closet = (entry(1, "수분 크림", H=80, B=40), entry(2, "피지 토너", P=70, H=20))
    needs = [bf.Need("H", "건조", 1.0), bf.Need("P", "더움", 0.9)]
    got = bf.pick_product(needs, closet)
    assert got and got[0].id == 1 and got[1].func == "H" and got[2] == 80       # 80×1.0 > 70×0.9
    assert bf.pick_product([bf.Need("U", "자외선")], closet) is None             # 해당 기능이 강한 제품이 없다
    assert bf.pick_product([bf.Need("H", "건조")], (entry(3, "약한 제품", H=29),)) is None   # 기준(30) 미만
    assert bf.pick_product([], closet) is None


# ── 합치기 ────────────────────────────────────────────────────────────────


def test_compose_picks_product_and_explains_with_weather_and_concern() -> None:
    snap = PersonalSnapshot(
        skin_type="hwasan", weak_concerns=(("수분", 64),),
        closet=(entry(1, "수분 크림", H=85), entry(2, "선크림", U=90)), closet_total=2,
    )
    b = bf.compose(snap, temp=9, humidity=33, label="맑음", events=["건조(습도 33%)"], condition="sunny", season="autumn")
    assert b.pick and b.pick["id"] == 1 and "보습" in b.pick["why"]
    assert "수분 크림" in b.headline and b.weather == {"label": "맑음", "temperature": 9, "humidity": 33}
    assert 1 <= len(b.reasons) <= 3 and b.missing is None


def test_compose_says_so_when_closet_has_no_matching_product() -> None:
    snap = PersonalSnapshot(skin_type="hwasan", closet=(entry(1, "클렌저", E=60),), closet_total=1)
    b = bf.compose(snap, temp=9, humidity=30, label="맑음", events=["건조(습도 30%)"], condition="cloudy", season="autumn")
    assert b.pick is None and "보습" in b.headline and b.missing and "보습" in b.missing        # 없는 제품을 지어내지 않는다


def test_compose_empty_closet_asks_to_register() -> None:
    b = bf.compose(PersonalSnapshot(skin_type="hwasan"), temp=9, humidity=30, label="맑음", events=["건조"], condition="cloudy", season="autumn")
    assert b.pick is None and b.missing and "등록" in b.missing


def test_compose_without_weather_uses_only_my_skin() -> None:
    snap = PersonalSnapshot(weak_concerns=(("모공", 58),), closet=(entry(1, "피지 토너", P=75),), closet_total=1)
    b = bf.compose(snap, has_weather=False)
    assert b.weather is None and b.pick and b.pick["id"] == 1 and b.tips == []
    calm = bf.compose(PersonalSnapshot(closet=(entry(1, "크림", H=80),), closet_total=1), has_weather=False)
    assert calm.pick is None and "평소 루틴" in calm.headline


# ── API ───────────────────────────────────────────────────────────────────


@pytest_asyncio.fixture(loop_scope="session")
async def account(client: AsyncClient):
    email = f"pytest-{uuid.uuid4().hex[:12]}@example.com"
    res = await client.post(f"{AUTH}/signup", json={"email": email, "password": PASSWORD, "nickname": "브리핑"})
    assert res.status_code == 201, res.text
    yield {"headers": {"Authorization": f"Bearer {res.json()['accessToken']}"}}
    async with AsyncSessionLocal() as db:
        await db.execute(delete(User).where(User.email == email))
        await db.commit()


@pytest.fixture
def _dry_weather(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake() -> dict:
        return {"has": True, "temp": 8, "humidity": 30, "label": "맑음", "condition": "sunny", "season": "autumn", "events": ["건조(습도 30%)"]}

    monkeypatch.setattr("app.api.insights._weather", fake)


async def test_requires_login(client: AsyncClient) -> None:
    assert (await client.get(f"{ME}/briefing")).status_code == 401


async def test_new_account_briefing_asks_to_register_closet(client: AsyncClient, account, _dry_weather: None) -> None:
    body = (await client.get(f"{ME}/briefing", **account)).json()
    assert body["date"] and body["pick"] is None and body["missing"]
    assert body["weather"] == {"label": "맑음", "temperature": 8, "humidity": 30}


async def test_briefing_works_without_weather(client: AsyncClient, account, monkeypatch: pytest.MonkeyPatch) -> None:
    async def none() -> dict:
        return {"has": False}

    monkeypatch.setattr("app.api.insights._weather", none)
    res = await client.get(f"{ME}/briefing", **account)
    assert res.status_code == 200 and res.json()["weather"] is None and res.json()["headline"]


async def test_demo_account_briefing_picks_closet_product(client: AsyncClient, _dry_weather: None) -> None:
    login = await client.post(f"{AUTH}/login", json={"email": "eunseong@swappy.app", "password": "swappy1234"})
    if login.status_code != 200:
        pytest.skip("시연 계정이 없는 DB")
    headers = {"Authorization": f"Bearer {login.json()['accessToken']}"}
    first = (await client.get(f"{ME}/briefing", headers=headers)).json()
    assert first["pick"] and first["pick"]["function"] in ("보습", "장벽", "자외선차단", "피지·모공", "각질·클렌징", "진정")
    assert any("건조" in r for r in first["reasons"])
    mine = {c["product"]["id"] for c in (await client.get(f"{ME}/closet", headers=headers)).json() if c["status"] == "owned"}
    assert first["pick"]["id"] in mine                                     # 추천한 제품은 실제로 내 화장대에 있다
    again = (await client.get(f"{ME}/briefing", headers=headers)).json()
    assert again == first                                                  # 같은 조건이면 같은 브리핑(캐시·결정적)
