"""피부 변화 리포트 — 사진 분석 기록의 변화를 화장대 변화와 함께, 원인을 단정하지 않고 (퍼스널 AI 4단계)."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import delete

from app.db.session import AsyncSessionLocal
from app.models.user import User
from app.services import skin_report as sr

pytestmark = pytest.mark.asyncio(loop_scope="session")

AUTH = "/api/v1/auth"
ME = "/api/v1/me"
PASSWORD = "Passw0rd!pytest"


def dt(m: int, d: int, h: int = 12) -> datetime:
    return datetime(2026, m, d, h, tzinfo=timezone.utc)


# ── 순수 계산 ─────────────────────────────────────────────────────────────


def test_compare_marks_trends_with_threshold_and_sorts_by_size() -> None:
    before = {"moisture": 66, "pore": 58, "oiliness": 79, "redness": 85, "acne": 80}
    after = {"moisture": 74, "pore": 56, "oiliness": 80, "redness": 84, "acne": 77}
    got = {c.key: c for c in sr.compare(before, after)}
    assert got["moisture"].trend == "up" and got["moisture"].delta == 8
    assert got["acne"].trend == "down" and got["acne"].delta == -3          # 경계(3점)는 달라진 것으로 본다
    assert got["pore"].trend == "flat" and got["oiliness"].trend == "flat" and got["redness"].trend == "flat"   # 3점 미만은 '비슷'
    keys = [c.key for c in sr.compare(before, after)]
    assert keys[0] == "moisture"                                           # 변화가 큰 순


def test_compare_ignores_items_present_in_only_one_analysis_and_unimprovable_ones() -> None:
    got = sr.compare({"moisture": 70, "eye_bag": 60, "tear_trough": 70}, {"moisture": 75, "eye_bag": 40, "firmness": 80})
    assert [c.key for c in got] == ["moisture"]                            # 눈가 구조·한쪽에만 있는 항목은 뺀다


def test_average_only_over_improvable_items() -> None:
    assert sr.average({"moisture": 70, "pore": 60, "eye_bag": 10}) == 65
    assert sr.average({"eye_bag": 10}) is None


def _added(strengths: dict[str, int], name: str = "에스네이처 세럼", m: int = 10, d: int = 23) -> sr.AddedProduct:
    return sr.AddedProduct(1, name, dt(m, d), strengths)


def test_helps_needs_enough_strength_for_the_concern_functions() -> None:
    moisture_up = sr.Change("moisture", "수분", 66, 74, 8, "up")
    assert sr.helps(moisture_up, _added({"H": 70})) == "보습"
    assert sr.helps(moisture_up, _added({"H": 29, "B": 10})) is None       # 기준(30) 미만
    assert sr.helps(moisture_up, _added({"P": 90})) is None                # 다른 기능만 강하다


def test_narrative_links_additions_without_claiming_causation() -> None:
    changes = [sr.Change("moisture", "수분", 66, 74, 8, "up"), sr.Change("oiliness", "유분", 80, 76, -4, "down")]
    notes = sr.narrative(changes, [_added({"H": 70})], dt(10, 14), dt(10, 28))
    text = "\n".join(notes)
    assert "10월 14일 → 10월 28일(14일)" in text
    assert "좋아진 항목: 수분 66→74(+8)" in text and "신경 쓸 항목: 유분 80→76(-4)" in text
    assert "'에스네이처 세럼'" in text and "10월 23일에 화장대에 더했어요" in text
    assert "영향이 있었을 수 있어요" in text and "다른 요인" in text
    for banned in ("덕분", "때문에 좋아", "효과가 있었", "확실히", "원인은"):
        assert banned not in text, banned


def test_narrative_flat_and_no_matching_addition() -> None:
    notes = sr.narrative([sr.Change("moisture", "수분", 70, 71, 1, "flat")], [_added({"P": 80})], dt(10, 21), dt(10, 28))
    text = "\n".join(notes)
    assert "눈에 띄는 변화는 없어요" in text and "화장대에 더했어요" not in text
    same_day = sr.narrative([], [], dt(10, 21, 9), dt(10, 21, 18))
    assert "같은 날" in same_day[0]


def test_narrative_links_at_most_two_additions() -> None:
    changes = [sr.Change(k, n, 50, 60, 10, "up") for k, n in (("moisture", "수분"), ("pore", "모공"), ("oiliness", "유분"))]
    notes = sr.narrative(changes, [_added({"H": 80, "P": 80, "B": 80})], dt(10, 14), dt(10, 28))
    assert sum("화장대에 더했어요" in n for n in notes) == sr.MAX_LINKED


# ── DB·API ────────────────────────────────────────────────────────────────


@pytest_asyncio.fixture(loop_scope="session")
async def account(client: AsyncClient):
    email = f"pytest-{uuid.uuid4().hex[:12]}@example.com"
    res = await client.post(f"{AUTH}/signup", json={"email": email, "password": PASSWORD, "nickname": "리포트"})
    assert res.status_code == 201, res.text
    yield {"headers": {"Authorization": f"Bearer {res.json()['accessToken']}"}}
    async with AsyncSessionLocal() as db:
        await db.execute(delete(User).where(User.email == email))
        await db.commit()


async def test_requires_login(client: AsyncClient) -> None:
    assert (await client.get(f"{ME}/skin-report")).status_code == 401


async def test_new_account_has_no_report_and_says_how_to_get_one(client: AsyncClient, account) -> None:
    res = await client.get(f"{ME}/skin-report", **account)
    assert res.status_code == 200
    body = res.json()
    assert body["enough"] is False and body["changes"] == [] and "촬영" in body["message"]


async def test_demo_account_report_compares_and_never_claims_cause(client: AsyncClient) -> None:
    login = await client.post(f"{AUTH}/login", json={"email": "eunseong@swappy.app", "password": "swappy1234"})
    if login.status_code != 200:
        pytest.skip("시연 계정이 없는 DB")
    headers = {"Authorization": f"Bearer {login.json()['accessToken']}"}
    body = (await client.get(f"{ME}/skin-report", headers=headers)).json()
    if not body["enough"]:
        pytest.skip("시연 계정의 사진 분석이 2건 미만")
    assert body["beforeAt"] < body["afterAt"] and body["days"] >= 0
    assert body["changes"] and all({"key", "name", "before", "after", "delta", "trend"} <= set(c) for c in body["changes"])
    assert all(c["delta"] == c["after"] - c["before"] for c in body["changes"])
    assert all(c["trend"] in ("up", "down", "flat") for c in body["changes"])
    text = "\n".join(body["notes"])
    assert "영향이 있었을 수 있어요" in text or "눈에 띄는 변화" in text or "좋아진 항목" in text or "신경 쓸 항목" in text
    for banned in ("덕분", "확실히", "원인은"):
        assert banned not in text
    assert body["timeline"] and all(0 <= t["average"] <= 100 for t in body["timeline"])
