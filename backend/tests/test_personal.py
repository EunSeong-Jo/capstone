"""개인 데이터 API 계약 테스트 (Phase 2).

`test_auth.py`와 같은 규칙을 따른다 — 매번 새 계정을 만들고 끝나면 지운다.
개인 데이터는 전부 `user_id` FK에 ON DELETE CASCADE라 계정 하나만 지우면
화장대·장바구니·주문·후기·포인트가 함께 사라진다.

이 테스트 모음이 지키는 가장 중요한 불변식은 **없는 제품은 들어갈 수 없다**는
것이다. 이 도메인이 localStorage에서 서버로 온 이유가 그것이기 때문이다 —
예전에는 가짜 제품 id(102·960001)가 그대로 저장돼 화면이 엉뚱한 상세를 열었다.
"""
from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import delete

from app.db.session import AsyncSessionLocal
from app.models.user import User

pytestmark = pytest.mark.asyncio(loop_scope="session")

AUTH = "/api/v1/auth"
ME = "/api/v1/me"
ORDERS = "/api/v1/orders"
PASSWORD = "swappy1234"

# 카탈로그에 실재하는 id가 필요하다. 목록 API에서 뽑아 쓰면 데이터가 바뀌어도
# 따라간다 — 상수로 박으면 재적재 때 조용히 깨진다.
NO_SUCH_PRODUCT = 999_999_999


@pytest_asyncio.fixture(loop_scope="session")
async def account(client: AsyncClient):
    email = f"pytest-{uuid.uuid4().hex[:12]}@example.com"
    res = await client.post(
        f"{AUTH}/signup", json={"email": email, "password": PASSWORD, "nickname": "테스트"}
    )
    assert res.status_code == 201, res.text
    body = res.json()
    yield {"headers": {"Authorization": f"Bearer {body['accessToken']}"}}

    async with AsyncSessionLocal() as db:
        await db.execute(delete(User).where(User.email == email))
        await db.commit()


@pytest_asyncio.fixture(loop_scope="session")
async def product_ids(client: AsyncClient) -> list[int]:
    res = await client.get("/api/v1/products", params={"size": 3, "sort": "popular"})
    ids = [p["id"] for p in res.json()["items"]]
    assert len(ids) >= 2, "카탈로그에 제품이 최소 2건 있어야 한다"
    return ids


# ── 인증 ──────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "method,path",
    [
        ("get", f"{ME}/closet"),
        ("get", f"{ME}/cart"),
        ("get", f"{ME}/likes"),
        ("get", f"{ME}/orders"),
        ("get", f"{ME}/points"),
        ("get", f"{ME}/stats"),
        ("post", ORDERS),
    ],
)
async def test_personal_endpoints_require_login(
    client: AsyncClient, method: str, path: str
) -> None:
    """개인 데이터는 토큰 없이 새면 안 된다."""
    res = await getattr(client, method)(path)
    assert res.status_code == 401


# ── 화장대 ────────────────────────────────────────────────────


async def test_closet_add_and_list(client: AsyncClient, account, product_ids) -> None:
    pid = product_ids[0]
    res = await client.post(f"{ME}/closet", json={"productId": pid}, **account)
    assert res.status_code == 201
    # 응답에 제품 정보가 함께 온다 — 화면이 상세를 따로 부르지 않도록.
    assert res.json()["product"]["id"] == pid
    assert res.json()["product"]["name"]

    listed = await client.get(f"{ME}/closet", **account)
    assert [c["product"]["id"] for c in listed.json()] == [pid]


async def test_closet_add_is_idempotent(client: AsyncClient, account, product_ids) -> None:
    """두 번 담아도 한 행. UNIQUE가 막고, 화면은 409를 다루지 않아도 된다."""
    pid = product_ids[0]
    first = await client.post(f"{ME}/closet", json={"productId": pid}, **account)
    second = await client.post(f"{ME}/closet", json={"productId": pid}, **account)
    assert second.status_code == 201
    assert second.json()["id"] == first.json()["id"]

    listed = await client.get(f"{ME}/closet", **account)
    assert len(listed.json()) == 1


async def test_closet_rejects_unknown_product(client: AsyncClient, account) -> None:
    """**이 도메인이 서버로 온 이유.** localStorage에는 아무 숫자나 들어갔다."""
    res = await client.post(f"{ME}/closet", json={"productId": NO_SUCH_PRODUCT}, **account)
    assert res.status_code == 404


async def test_closet_remove(client: AsyncClient, account, product_ids) -> None:
    pid = product_ids[0]
    await client.post(f"{ME}/closet", json={"productId": pid}, **account)
    assert (await client.delete(f"{ME}/closet/{pid}", **account)).status_code == 204
    assert (await client.get(f"{ME}/closet", **account)).json() == []


# ── 장바구니 ──────────────────────────────────────────────────


async def test_cart_accumulates_quantity(client: AsyncClient, account, product_ids) -> None:
    pid = product_ids[0]
    await client.post(f"{ME}/cart", json={"productId": pid, "qty": 2}, **account)
    res = await client.post(f"{ME}/cart", json={"productId": pid, "qty": 1}, **account)

    body = res.json()
    assert len(body["lines"]) == 1, "같은 제품은 줄이 늘지 않고 수량이 는다"
    assert body["lines"][0]["qty"] == 3
    assert body["count"] == 3


async def test_cart_subtotal_matches_lines(client: AsyncClient, account, product_ids) -> None:
    await client.post(f"{ME}/cart", json={"productId": product_ids[0], "qty": 2}, **account)
    await client.post(f"{ME}/cart", json={"productId": product_ids[1], "qty": 1}, **account)

    body = (await client.get(f"{ME}/cart", **account)).json()
    expected = sum(line["product"]["price"] * line["qty"] for line in body["lines"])
    assert body["subtotal"] == expected


async def test_cart_qty_zero_deletes_line(client: AsyncClient, account, product_ids) -> None:
    """수량 0짜리 행을 남기면 목록·합계가 그걸 세어야 한다."""
    pid = product_ids[0]
    await client.post(f"{ME}/cart", json={"productId": pid, "qty": 2}, **account)
    res = await client.patch(f"{ME}/cart/{pid}", json={"qty": 0}, **account)
    assert res.status_code == 200
    assert res.json()["lines"] == []


async def test_cart_qty_on_missing_line(client: AsyncClient, account, product_ids) -> None:
    res = await client.patch(f"{ME}/cart/{product_ids[0]}", json={"qty": 2}, **account)
    assert res.status_code == 404


# ── 주문 ──────────────────────────────────────────────────────


async def test_order_requires_nonempty_cart(client: AsyncClient, account) -> None:
    assert (await client.post(ORDERS, **account)).status_code == 422


async def test_order_freezes_price_and_clears_cart(
    client: AsyncClient, account, product_ids
) -> None:
    """주문은 '그때 그 가격에 샀다'는 기록이다.

    order_items가 가격을 복사해 두지 않으면 제품 가격이 바뀔 때 과거 주문
    금액이 따라 움직인다.
    """
    pid = product_ids[0]
    cart = (await client.post(f"{ME}/cart", json={"productId": pid, "qty": 2}, **account)).json()
    unit_price = cart["lines"][0]["product"]["price"]

    order = (await client.post(ORDERS, **account)).json()
    assert order["total"] == unit_price * 2
    assert order["items"][0]["unitPrice"] == unit_price
    assert order["items"][0]["qty"] == 2
    assert order["items"][0]["productName"]

    assert (await client.get(f"{ME}/cart", **account)).json()["lines"] == []


async def test_order_grants_points(client: AsyncClient, account, product_ids) -> None:
    await client.post(f"{ME}/cart", json={"productId": product_ids[0], "qty": 1}, **account)
    order = (await client.post(ORDERS, **account)).json()

    points = (await client.get(f"{ME}/points", **account)).json()
    assert points["balance"] == int(order["total"] * 0.01)
    assert points["transactions"][0]["reason"] == "order"


async def test_frequent_is_empty_without_orders(client: AsyncClient, account) -> None:
    """주문이 없으면 빈 목록. 예전에는 이 자리를 가짜 '3회 구매'가 채웠다."""
    assert (await client.get(f"{ME}/orders/frequent", **account)).json() == []


async def test_frequent_counts_quantities(client: AsyncClient, account, product_ids) -> None:
    pid = product_ids[0]
    await client.post(f"{ME}/cart", json={"productId": pid, "qty": 2}, **account)
    await client.post(ORDERS, **account)
    await client.post(f"{ME}/cart", json={"productId": pid, "qty": 1}, **account)
    await client.post(ORDERS, **account)

    frequent = (await client.get(f"{ME}/orders/frequent", **account)).json()
    assert frequent[0]["product"]["id"] == pid
    assert frequent[0]["purchaseCount"] == 3


# ── 후기 ──────────────────────────────────────────────────────


async def test_review_requires_purchase(client: AsyncClient, account) -> None:
    """사지 않은 제품에는 쓸 수 없다 — order_item을 거치게 한 이유."""
    res = await client.post(
        f"{ME}/reviews", json={"orderItemId": 99_999_999, "rating": 5}, **account
    )
    assert res.status_code == 404


async def test_review_once_per_order_item(client: AsyncClient, account, product_ids) -> None:
    await client.post(f"{ME}/cart", json={"productId": product_ids[0], "qty": 1}, **account)
    order = (await client.post(ORDERS, **account)).json()
    item_id = order["items"][0]["id"]

    first = await client.post(
        f"{ME}/reviews", json={"orderItemId": item_id, "rating": 5, "body": "좋아요"}, **account
    )
    assert first.status_code == 201

    again = await client.post(
        f"{ME}/reviews", json={"orderItemId": item_id, "rating": 3}, **account
    )
    assert again.status_code == 409

    # 주문내역이 '후기 씀'을 알아야 버튼을 정할 수 있다.
    orders = (await client.get(f"{ME}/orders", **account)).json()
    assert orders[0]["items"][0]["reviewed"] is True


@pytest.mark.parametrize("rating", [0, 6])
async def test_review_rating_range(
    client: AsyncClient, account, product_ids, rating: int
) -> None:
    await client.post(f"{ME}/cart", json={"productId": product_ids[0], "qty": 1}, **account)
    order = (await client.post(ORDERS, **account)).json()
    res = await client.post(
        f"{ME}/reviews",
        json={"orderItemId": order["items"][0]["id"], "rating": rating},
        **account,
    )
    assert res.status_code == 422


# ── 찜 · 최근 본 ──────────────────────────────────────────────


async def test_like_is_idempotent(client: AsyncClient, account, product_ids) -> None:
    pid = product_ids[0]
    assert (await client.post(f"{ME}/likes", json={"productId": pid}, **account)).status_code == 204
    assert (await client.post(f"{ME}/likes", json={"productId": pid}, **account)).status_code == 204
    assert len((await client.get(f"{ME}/likes", **account)).json()) == 1

    assert (await client.delete(f"{ME}/likes/{pid}", **account)).status_code == 204
    assert (await client.get(f"{ME}/likes", **account)).json() == []


async def test_likes_are_per_account(client: AsyncClient, account, product_ids) -> None:
    """예전 LikedProductsContext는 계정 구분 없이 한 키를 써서 찜이 공유됐다."""
    await client.post(f"{ME}/likes", json={"productId": product_ids[0]}, **account)

    other_email = f"pytest-{uuid.uuid4().hex[:12]}@example.com"
    signup = await client.post(
        f"{AUTH}/signup", json={"email": other_email, "password": PASSWORD}
    )
    other = {"headers": {"Authorization": f"Bearer {signup.json()['accessToken']}"}}
    try:
        assert (await client.get(f"{ME}/likes", **other)).json() == []
    finally:
        async with AsyncSessionLocal() as db:
            await db.execute(delete(User).where(User.email == other_email))
            await db.commit()


async def test_recently_viewed_dedupes(client: AsyncClient, account, product_ids) -> None:
    pid = product_ids[0]
    for _ in range(3):
        assert (
            await client.post(f"{ME}/recently-viewed", json={"productId": pid}, **account)
        ).status_code == 204

    assert len((await client.get(f"{ME}/recently-viewed", **account)).json()) == 1

    assert (await client.delete(f"{ME}/recently-viewed", **account)).status_code == 204
    assert (await client.get(f"{ME}/recently-viewed", **account)).json() == []


# ── 스캔 · 통계 ───────────────────────────────────────────────


async def test_scan_without_product_is_allowed(client: AsyncClient, account) -> None:
    """OCR이 인식은 했지만 카탈로그에서 못 찾은 경우를 남긴다 —
    매칭 실패율을 재는 유일한 자료다."""
    res = await client.post(
        f"{ME}/scans", json={"source": "ocr", "rawText": "정제수, 글리세린"}, **account
    )
    assert res.status_code == 201
    assert res.json()["product"] is None


async def test_stats_counts_real_rows(client: AsyncClient, account, product_ids) -> None:
    """예전에는 홈·마이페이지에 {saved: 128400, scans: 21, swaps: 9}가 박혀 있었다."""
    empty = (await client.get(f"{ME}/stats", **account)).json()
    assert empty["closetCount"] == 0 and empty["totalSpent"] == 0
    # 레벨·경험치도 기록에서 계산해 낸다. 아무 것도 안 했으면 Lv.1 · 0 EXP다.
    assert empty["level"] == 1 and empty["exp"] == 0

    await client.post(f"{ME}/closet", json={"productId": product_ids[0]}, **account)
    await client.post(f"{ME}/likes", json={"productId": product_ids[1]}, **account)
    await client.post(f"{ME}/cart", json={"productId": product_ids[0], "qty": 2}, **account)
    order = (await client.post(ORDERS, **account)).json()

    stats = (await client.get(f"{ME}/stats", **account)).json()
    assert stats["closetCount"] == 1
    assert stats["likeCount"] == 1
    assert stats["cartCount"] == 0, "주문하면 장바구니가 비워진다"
    assert stats["orderCount"] == 1
    assert stats["totalSpent"] == order["total"]


# ── 선물하기 ──────────────────────────────────────────────────

GIFTS = "/api/v1/gifts"


async def test_gift_requires_auth(client: AsyncClient, product_ids: list[int]) -> None:
    res = await client.post(
        GIFTS, json={"productId": product_ids[0], "recipientName": "친구"}
    )
    assert res.status_code == 401

    res = await client.get(f"{ME}/gifts/sent")
    assert res.status_code == 401


async def test_gift_rejects_unknown_product(client: AsyncClient, account) -> None:
    res = await client.post(
        GIFTS,
        headers=account["headers"],
        json={"productId": NO_SUCH_PRODUCT, "recipientName": "친구"},
    )
    assert res.status_code == 404


async def test_gift_requires_recipient_name(
    client: AsyncClient, account, product_ids: list[int]
) -> None:
    res = await client.post(
        GIFTS,
        headers=account["headers"],
        json={"productId": product_ids[0], "recipientName": ""},
    )
    assert res.status_code == 422


async def test_gift_records_and_lists(
    client: AsyncClient, account, product_ids: list[int]
) -> None:
    res = await client.post(
        GIFTS,
        headers=account["headers"],
        json={
            "productId": product_ids[0],
            "recipientName": "  친구  ",
            "message": "생일 축하해",
        },
    )
    assert res.status_code == 201, res.text
    gift = res.json()

    # 이름·가격은 그 시점 값이 박제된다(order_items와 같은 이유).
    assert gift["productId"] == product_ids[0]
    assert gift["productName"]
    assert gift["unitPrice"] >= 0
    assert gift["recipientName"] == "친구"  # 앞뒤 공백은 서버가 다듬는다
    assert gift["status"] == "pending"

    listed = await client.get(f"{ME}/gifts/sent", headers=account["headers"])
    assert listed.status_code == 200
    assert [g["id"] for g in listed.json()] == [gift["id"]]


async def test_gift_never_stores_contact_details(
    client: AsyncClient, account, product_ids: list[int]
) -> None:
    """연락처는 받지도 돌려주지도 않는다.

    전달 경로가 없어 쓰이지 않는데, 쓰이지도 않는 제3자의 개인정보를 공용
    DB에 쌓게 된다. 실수로 컬럼이 다시 생기면 여기서 걸린다.
    """
    res = await client.post(
        GIFTS,
        headers=account["headers"],
        json={
            "productId": product_ids[0],
            "recipientName": "친구",
            "recipientPhone": "010-1234-5678",
        },
    )
    assert res.status_code == 201
    assert "recipientPhone" not in res.json()


async def test_gift_list_is_scoped_to_sender(
    client: AsyncClient, account, product_ids: list[int]
) -> None:
    """남이 보낸 선물이 내 목록에 보이면 안 된다."""
    await client.post(
        GIFTS,
        headers=account["headers"],
        json={"productId": product_ids[0], "recipientName": "친구"},
    )

    other_email = f"pytest-{uuid.uuid4().hex[:12]}@example.com"
    signup = await client.post(
        f"{AUTH}/signup",
        json={"email": other_email, "password": PASSWORD, "nickname": "남"},
    )
    other = {"Authorization": f"Bearer {signup.json()['accessToken']}"}
    try:
        res = await client.get(f"{ME}/gifts/sent", headers=other)
        assert res.status_code == 200
        assert res.json() == []
    finally:
        async with AsyncSessionLocal() as db:
            await db.execute(delete(User).where(User.email == other_email))
            await db.commit()


# ── 레벨·경험치 ────────────────────────────────────────────────


async def test_stats_starts_at_level_one(client: AsyncClient, account) -> None:
    """아무 것도 안 한 계정은 Lv.1 · 0 EXP다."""
    res = await client.get(f"{ME}/stats", headers=account["headers"])
    assert res.status_code == 200
    body = res.json()
    assert body["exp"] == 0
    assert body["level"] == 1
    assert body["expInLevel"] == 0
    assert body["levelSpan"] == 100


async def test_stats_counts_exp_from_records(
    client: AsyncClient, account, product_ids: list[int]
) -> None:
    """경험치는 **기록에서 센다.**

    클라이언트가 더해 보내는 값이 아니다. 여기서 확인하는 것은 행동을
    실제로 했을 때 서버가 그 행을 보고 계산한다는 것이다.
    """
    before = (await client.get(f"{ME}/stats", headers=account["headers"])).json()

    # 스캔 +10
    await client.post(
        f"{ME}/scans",
        headers=account["headers"],
        json={"productId": product_ids[0], "source": "search"},
    )
    # 주문 +50 (장바구니 → 결제)
    await client.post(
        f"{ME}/cart", headers=account["headers"], json={"productId": product_ids[0], "qty": 1}
    )
    order = await client.post(ORDERS, headers=account["headers"])
    assert order.status_code == 201
    # 후기 +20
    await client.post(
        f"{ME}/reviews",
        headers=account["headers"],
        json={"orderItemId": order.json()["items"][0]["id"], "rating": 5},
    )
    # 선물 +20
    await client.post(
        "/api/v1/gifts",
        headers=account["headers"],
        json={"productId": product_ids[0], "recipientName": "친구"},
    )

    after = (await client.get(f"{ME}/stats", headers=account["headers"])).json()
    assert after["scanCount"] == before["scanCount"] + 1
    assert after["reviewCount"] == before["reviewCount"] + 1
    assert after["giftCount"] == before["giftCount"] + 1
    assert after["exp"] == before["exp"] + 10 + 50 + 20 + 20


async def test_stats_level_is_consistent(client: AsyncClient, account) -> None:
    """레벨·진행도는 서로 어긋나지 않는다."""
    body = (await client.get(f"{ME}/stats", headers=account["headers"])).json()
    assert 0 <= body["expInLevel"] < body["levelSpan"]
    assert body["levelSpan"] == body["level"] * 100


# ── 캐릭터 꾸미기 ─────────────────────────────────────────────


async def test_decoration_defaults_to_none(client: AsyncClient, account) -> None:
    res = await client.get(f"{ME}/profile", headers=account["headers"])
    assert res.status_code == 200
    assert res.json()["decorationId"] is None


async def test_decoration_roundtrip(client: AsyncClient, account) -> None:
    res = await client.patch(
        f"{ME}/profile", headers=account["headers"], json={"decorationId": 4}
    )
    assert res.status_code == 200
    assert res.json()["decorationId"] == 4

    again = await client.get(f"{ME}/profile", headers=account["headers"])
    assert again.json()["decorationId"] == 4


async def test_decoration_zero_clears_it(client: AsyncClient, account) -> None:
    """0은 해제다. null은 '안 보냈다'라서 해제와 구분되지 않는다."""
    await client.patch(f"{ME}/profile", headers=account["headers"], json={"decorationId": 4})
    res = await client.patch(
        f"{ME}/profile", headers=account["headers"], json={"decorationId": 0}
    )
    assert res.status_code == 200
    assert res.json()["decorationId"] is None


async def test_decoration_rejects_unknown_id(client: AsyncClient, account) -> None:
    """에셋이 없는 번호를 받으면 화면이 깨진 이미지를 그린다."""
    res = await client.patch(
        f"{ME}/profile", headers=account["headers"], json={"decorationId": 99}
    )
    assert res.status_code == 422


async def test_decoration_survives_other_profile_edits(
    client: AsyncClient, account
) -> None:
    """다른 필드만 보내면 장식은 그대로다(부분 수정)."""
    await client.patch(f"{ME}/profile", headers=account["headers"], json={"decorationId": 2})
    res = await client.patch(
        f"{ME}/profile", headers=account["headers"], json={"budgetMin": 10000}
    )
    assert res.status_code == 200
    assert res.json()["decorationId"] == 2


# ── 알림 ──────────────────────────────────────────────────────

NOTI = f"{ME}/notifications"


async def test_notifications_require_auth(client: AsyncClient) -> None:
    assert (await client.get(NOTI)).status_code == 401
    assert (await client.post(f"{NOTI}/seen")).status_code == 401


async def test_notifications_start_empty(client: AsyncClient, account) -> None:
    """아무 것도 안 한 계정은 알릴 것이 없다.

    알림은 저장돼 있지 않고 기록에서 뽑으므로, 기록이 없으면 비는 게 맞다.
    """
    res = await client.get(NOTI, headers=account["headers"])
    assert res.status_code == 200
    body = res.json()
    assert body["items"] == []
    assert body["unreadCount"] == 0


async def test_notifications_come_from_records(
    client: AsyncClient, account, product_ids: list[int]
) -> None:
    await client.post(
        f"{ME}/cart", headers=account["headers"], json={"productId": product_ids[0], "qty": 1}
    )
    order = await client.post(ORDERS, headers=account["headers"])
    assert order.status_code == 201

    res = await client.get(NOTI, headers=account["headers"])
    kinds = {i["kind"] for i in res.json()["items"]}
    # 주문 → 주문 알림 · 포인트 적립 알림 · 아직 안 쓴 후기 알림
    assert {"order", "point", "review"} <= kinds
    assert res.json()["unreadCount"] > 0


async def test_notifications_never_invent_price_or_restock(
    client: AsyncClient, account, product_ids: list[int]
) -> None:
    """가격 인하·재입고 알림은 만들지 않는다.

    가격 이력 테이블이 없고 재입고 신청 기능 자체가 없다. 근거 없이
    내보내면 목업과 다를 바 없다 — 옮겨 온 판이 그랬다.
    """
    await client.post(
        f"{ME}/cart", headers=account["headers"], json={"productId": product_ids[0], "qty": 1}
    )
    await client.post(ORDERS, headers=account["headers"])

    kinds = {i["kind"] for i in (await client.get(NOTI, headers=account["headers"])).json()["items"]}
    assert "price" not in kinds and "restock" not in kinds


async def test_notifications_seen_clears_unread(
    client: AsyncClient, account, product_ids: list[int]
) -> None:
    await client.post(
        f"{ME}/cart", headers=account["headers"], json={"productId": product_ids[0], "qty": 1}
    )
    await client.post(ORDERS, headers=account["headers"])
    assert (await client.get(NOTI, headers=account["headers"])).json()["unreadCount"] > 0

    assert (await client.post(f"{NOTI}/seen", headers=account["headers"])).status_code == 204

    after = (await client.get(NOTI, headers=account["headers"])).json()
    assert after["unreadCount"] == 0
    # 읽었다고 사라지지는 않는다 — 목록은 그대로다.
    assert len(after["items"]) > 0


async def test_notifications_are_scoped_to_user(
    client: AsyncClient, account, product_ids: list[int]
) -> None:
    await client.post(
        f"{ME}/cart", headers=account["headers"], json={"productId": product_ids[0], "qty": 1}
    )
    await client.post(ORDERS, headers=account["headers"])

    other_email = f"pytest-{uuid.uuid4().hex[:12]}@example.com"
    signup = await client.post(
        f"{AUTH}/signup",
        json={"email": other_email, "password": PASSWORD, "nickname": "남"},
    )
    other = {"Authorization": f"Bearer {signup.json()['accessToken']}"}
    try:
        assert (await client.get(NOTI, headers=other)).json()["items"] == []
    finally:
        async with AsyncSessionLocal() as db:
            await db.execute(delete(User).where(User.email == other_email))
            await db.commit()
