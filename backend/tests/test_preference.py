"""내 성분 취향 — 설명 가능한 개인 모델 (퍼스널 AI 3단계).

계산(`build_profile`·`score`·`explain`)은 DB 없이, 신호 읽기와 API·홈 추천 연동은 로컬 DB로 확인한다.
"""
from __future__ import annotations

import math
import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import delete

from app.db.session import AsyncSessionLocal
from app.models.user import User
from app.services import preference as pf

pytestmark = pytest.mark.asyncio(loop_scope="session")

AUTH = "/api/v1/auth"
ME = "/api/v1/me"
PASSWORD = "Passw0rd!pytest"

# 성분 id: 1 정제수(흔함) · 2 판테놀 · 3 병풀 · 4 알코올 · 5 향료
IDF = {1: 0.1, 2: 3.0, 3: 3.0, 4: 2.0, 5: 2.0}
LABELS = {1: ("", "s", "", 3), 2: ("HB", "a", "", 3), 3: ("S", "a", "", 3), 4: ("", "x", "L", 3), 5: ("", "x", "F", 3)}


def sig(pid: int, w: float, src: str = "review") -> pf.Signal:
    return pf.Signal(pid, w, (src,))


# ── 신호 합치기 ───────────────────────────────────────────────────────────


def test_combine_signals_sums_clamps_and_drops_zero() -> None:
    got = pf.combine_signals([sig(1, 1.0), sig(1, 0.8, "repeat"), sig(2, 0.6), sig(2, -0.6), sig(3, -0.6)])
    assert got[1].weight == 1.0 and got[1].sources == ("repeat", "review")      # 합이 1을 넘으면 1로
    assert 2 not in got                                                         # 상쇄돼 0이면 취향에 쓰지 않는다
    assert got[3].weight == -0.6


def test_review_weights_cover_ratings() -> None:
    assert pf.REVIEW_WEIGHT[5] > pf.REVIEW_WEIGHT[4] > 0 == pf.REVIEW_WEIGHT[3] > pf.REVIEW_WEIGHT[2] > pf.REVIEW_WEIGHT[1]


# ── 프로필 ────────────────────────────────────────────────────────────────


def _profile(signals: dict[int, float], docs: dict[int, list[int]]) -> pf.PreferenceProfile:
    return pf.build_profile({p: sig(p, w) for p, w in signals.items()}, docs, LABELS, IDF)


DOCS = {10: [1, 2, 3], 11: [1, 2, 3], 12: [1, 2], 20: [1, 4, 5], 30: [1, 2, 3], 31: [1, 4, 5]}


def test_cold_start_stays_inactive_below_min_signals() -> None:
    p = _profile({10: 1.0, 11: 1.0}, DOCS)             # 신호 2개 < MIN_SIGNALS
    assert not p.active and p.signal_count == 2
    assert pf.score(p, DOCS[30], LABELS, IDF) == 0.0     # 꺼져 있으면 점수 0


def test_needs_at_least_one_liked_product() -> None:
    p = _profile({20: -1.0, 31: -0.6, 10: -0.6}, DOCS)   # 별로였던 것만 있다
    assert not p.active


def test_active_profile_prefers_liked_ingredients_and_avoids_disliked() -> None:
    p = _profile({10: 1.0, 11: 0.6, 12: 1.0, 20: -1.0}, DOCS)
    assert p.active and p.signal_count == 4
    like_like = pf.score(p, DOCS[30], LABELS, IDF)       # 판테놀·병풀 — 좋아한 제품과 같은 성분
    dislike_like = pf.score(p, DOCS[31], LABELS, IDF)    # 알코올·향료 — 별로였던 제품과 같은 성분
    assert like_like > 0.5 and dislike_like < 0.05 and like_like > dislike_like


def test_vectors_are_l2_normalized() -> None:
    p = _profile({10: 1.0, 11: 1.0, 12: 1.0, 20: -1.0}, DOCS)
    assert math.isclose(sum(v * v for v in p.pos.values()), 1.0, rel_tol=1e-9)
    assert math.isclose(sum(v * v for v in p.neg.values()), 1.0, rel_tol=1e-9)


def test_common_ingredient_barely_matters() -> None:
    """정제수(IDF 0.1)만 겹치는 제품은 취향과 거의 무관하다 — IDF가 흔한 성분을 지운다."""
    p = _profile({10: 1.0, 11: 1.0, 12: 1.0}, DOCS)
    only_water = pf.score(p, [1], LABELS, IDF)
    assert only_water < 0.1


def test_explain_names_overlapping_ingredients_in_contribution_order() -> None:
    p = _profile({10: 1.0, 11: 1.0, 12: 1.0, 20: -1.0}, DOCS)
    likes, dislikes = pf.explain(p, [1, 2, 3, 4], LABELS, IDF)
    assert set(likes) <= {2, 3, 1} and 2 in likes and 3 in likes
    assert dislikes and dislikes[0] == 4
    assert pf.explain(p, [], LABELS, IDF) == ([], [])


def test_normalize_pool_is_relative_and_nonnegative() -> None:
    got = pf.normalize_pool({1: 0.4, 2: 0.2, 3: -0.3})
    assert got == {1: 1.0, 2: 0.5, 3: 0.0}
    assert pf.normalize_pool({1: -0.1, 2: 0.0}) == {1: 0.0, 2: 0.0}
    assert pf.normalize_pool({}) == {}


def test_product_without_ingredient_info_is_not_a_usable_signal() -> None:
    p = pf.build_profile({10: sig(10, 1.0), 99: sig(99, 1.0), 11: sig(11, 1.0), 12: sig(12, 1.0)}, DOCS, LABELS, IDF)
    assert p.signal_count == 3 and p.active                         # 99는 성분 정보가 없어 세지 않는다


# ── DB·API ────────────────────────────────────────────────────────────────


@pytest_asyncio.fixture(loop_scope="session")
async def account(client: AsyncClient):
    email = f"pytest-{uuid.uuid4().hex[:12]}@example.com"
    res = await client.post(f"{AUTH}/signup", json={"email": email, "password": PASSWORD, "nickname": "취향"})
    assert res.status_code == 201, res.text
    yield {"headers": {"Authorization": f"Bearer {res.json()['accessToken']}"}}
    async with AsyncSessionLocal() as db:
        await db.execute(delete(User).where(User.email == email))
        await db.commit()


async def test_idf_table_is_positive_and_commons_are_low() -> None:
    async with AsyncSessionLocal() as db:
        idf = await pf.idf_table(db)
    assert len(idf) > 1000 and all(v >= 0 for v in idf.values())
    assert min(idf.values()) < 0.5 < max(idf.values())             # 정제수류는 0에 가깝고 희귀 성분은 크다


async def test_new_account_has_inactive_preferences_with_hint(client: AsyncClient, account) -> None:
    res = await client.get(f"{ME}/preferences", **account)
    assert res.status_code == 200
    body = res.json()
    assert body["active"] is False and body["liked"] == [] and body["minSignals"] == pf.MIN_SIGNALS
    assert "찜" in body["message"] or "후기" in body["message"]


async def test_likes_turn_preferences_on_and_explain_with_products(client: AsyncClient, account) -> None:
    # 성분 정보가 있는 제품 몇 개를 찜한다(찜 0.4 × 3개 → 신호 3개, 좋아한 제품 3개)
    listing = await client.get("/api/v1/products", params={"size": 12})
    pids = [p["id"] for p in listing.json()["items"]][:6]
    for pid in pids:
        assert (await client.post(f"{ME}/likes", json={"productId": pid}, **account)).status_code in (200, 201, 204)
    body = (await client.get(f"{ME}/preferences", **account)).json()
    assert body["active"] is True and body["sources"]["like"] == len(pids)
    assert body["liked"] and body["liked"][0]["weight"] == 100
    assert all(i["products"] for i in body["liked"])                 # 근거 제품이 붙어 있다
    assert all(0 < i["weight"] <= 100 for i in body["liked"])


async def test_home_recommendations_personalize_only_when_active_and_never_break_skin_exclusion(
    client: AsyncClient, account
) -> None:
    cold = await client.get("/api/v1/recommendations/main", params={"size": 6}, **account)
    assert cold.status_code == 200 and cold.headers.get("X-Cache", "").startswith(("HIT", "MISS"))
    assert "PERSONAL" not in cold.headers.get("X-Cache", "")          # 신호가 없으면 기존 추천
    listing = await client.get("/api/v1/products", params={"size": 12})
    for p in listing.json()["items"][:6]:
        await client.post(f"{ME}/likes", json={"productId": p["id"]}, **account)
    warm = await client.get("/api/v1/recommendations/main", params={"size": 6, "skinType": "yuriguseul"}, **account)
    assert warm.status_code == 200 and "PERSONAL" in warm.headers.get("X-Cache", "")
    items = warm.json()["items"]
    assert items and len({i["id"] for i in items}) == len(items)
    # 유리구슬은 향료·건조 알코올이 든 제품을 하드 제외한다 — 취향이 그걸 끌어올리면 안 된다(후보 풀이 기존 규칙에서 나온다)
    from sqlalchemy import select

    from app.models.recommendation import ProductSkinFit

    async with AsyncSessionLocal() as db:
        excluded = set(
            (
                await db.scalars(
                    select(ProductSkinFit.product_id).where(
                        ProductSkinFit.skin_type == "yuriguseul",
                        ProductSkinFit.excluded.is_(True),
                        ProductSkinFit.product_id.in_([i["id"] for i in items]),
                    )
                )
            ).all()
        )
    assert excluded == set()
