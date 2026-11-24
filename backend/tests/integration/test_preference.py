"""내 성분 취향 — 설명 가능한 개인 모델 (퍼스널 AI 3단계).

이 파일은 **DB·Redis가 필요한 쪽**(tests/integration)이다. DB 없이 도는 테스트는 `tests/unit/test_preference.py`에 있다.

계산(`build_profile`·`score`·`explain`)은 DB 없이, 신호 읽기와 API·홈 추천 연동은 로컬 DB로 확인한다.
"""
from __future__ import annotations
import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import delete

from app.db.session import AsyncSessionLocal
from app.models.user import User
from app.services.personal_ai import preference as pf

pytestmark = pytest.mark.asyncio(loop_scope="session")

AUTH = "/api/v1/auth"
ME = "/api/v1/me"
PASSWORD = "Passw0rd!pytest"


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
