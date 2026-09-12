"""제품 API 계약 테스트.

가장 중요한 것은 **프론트가 죽지 않는 조건**을 지키는지다.
ProductCardV는 `product.price.toLocaleString()`을 가드 없이 호출하므로
price가 하나라도 null이면 홈 화면이 통째로 죽는다.
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient

# 엔진의 커넥션 풀이 첫 루프에 묶이므로 전 테스트를 하나의 루프에서 돌린다.
# 자세한 이유는 conftest.py 참고.
pytestmark = pytest.mark.asyncio(loop_scope="session")

LIST = "/api/v1/products"
SEARCH = "/api/v1/products/search"

# 프론트 src/types/index.ts의 Product가 필수로 요구하는 필드
REQUIRED = ("id", "name", "brand", "category", "price")


async def _items(client: AsyncClient, path: str = LIST, **params) -> list[dict]:
    res = await client.get(path, params=params)
    assert res.status_code == 200, res.text
    return res.json()["items"]


# ── 응답 계약 ────────────────────────────────────────────────


async def test_list_envelope(client: AsyncClient) -> None:
    res = await client.get(LIST, params={"size": 5})
    assert res.status_code == 200
    body = res.json()
    assert set(body) == {"items", "total", "page", "size"}
    assert body["page"] == 1 and body["size"] == 5
    assert len(body["items"]) <= 5
    assert body["total"] >= len(body["items"])


async def test_fields_are_camel_case(client: AsyncClient) -> None:
    """snake_case가 새어 나가면 프론트 타입과 어긋난다."""
    item = (await _items(client, size=1))[0]
    assert "imageUrl" in item and "reviewCount" in item
    assert not any("_" in key for key in item), item


async def test_required_fields_never_null(client: AsyncClient) -> None:
    """price가 null이면 ProductCardV가 예외를 던진다 — 홈이 죽는다."""
    for item in await _items(client, size=100):
        for key in REQUIRED:
            assert item.get(key) is not None, f"{key} is null: {item}"
        assert isinstance(item["price"], int) and item["price"] > 0
        assert item["brand"] and item["category"]


async def test_omitted_fields_absent(client: AsyncClient) -> None:
    """수집되지 않은 값은 null로 보내지 않고 필드 자체를 뺀다."""
    item = (await _items(client, size=1))[0]
    assert "originalPrice" not in item
    assert "discountRate" not in item


# ── 정렬 ────────────────────────────────────────────────────


@pytest.mark.parametrize("sort,reverse", [("priceAsc", False), ("priceDesc", True)])
async def test_sort_by_price(client: AsyncClient, sort: str, reverse: bool) -> None:
    prices = [i["price"] for i in await _items(client, sort=sort, size=50)]
    assert prices == sorted(prices, reverse=reverse)


async def test_sort_popular_is_review_desc(client: AsyncClient) -> None:
    counts = [i["reviewCount"] for i in await _items(client, sort="popular", size=50)]
    assert all(c is not None for c in counts), "결측이 앞으로 오면 안 된다"
    assert counts == sorted(counts, reverse=True)


async def test_sort_rating_puts_nulls_last(client: AsyncClient) -> None:
    ratings = [i["rating"] for i in await _items(client, sort="rating", size=50)]
    assert ratings[0] is not None
    seen_null = False
    for r in ratings:
        if r is None:
            seen_null = True
        else:
            assert not seen_null, "NULL 다음에 값이 나오면 nullslast가 깨진 것"


# ── 필터 ────────────────────────────────────────────────────


@pytest.mark.parametrize("category", ["스킨케어", "마스크팩", "클렌징", "선케어"])
async def test_filter_by_category(client: AsyncClient, category: str) -> None:
    items = await _items(client, category=category, size=30)
    assert items, f"{category} 결과가 비었다"
    assert {i["category"] for i in items} == {category}


async def test_filter_unknown_category_is_empty(client: AsyncClient) -> None:
    """제외한 카테고리(메이크업 등)는 적재돼 있지 않다."""
    res = await client.get(LIST, params={"category": "메이크업"})
    assert res.status_code == 200
    assert res.json()["total"] == 0


async def test_filter_by_price_range(client: AsyncClient) -> None:
    items = await _items(client, minPrice=20000, maxPrice=30000, size=50)
    assert items
    assert all(20000 <= i["price"] <= 30000 for i in items)


async def test_filter_by_brand(client: AsyncClient) -> None:
    brand = (await _items(client, size=1))[0]["brand"]
    items = await _items(client, brand=brand, size=30)
    assert items
    assert {i["brand"] for i in items} == {brand}


# ── 페이지네이션 ────────────────────────────────────────────


async def test_pages_do_not_overlap(client: AsyncClient) -> None:
    a = {i["id"] for i in await _items(client, sort="priceAsc", size=20, page=1)}
    b = {i["id"] for i in await _items(client, sort="priceAsc", size=20, page=2)}
    assert a and b and not (a & b)


async def test_size_limit_enforced(client: AsyncClient) -> None:
    assert (await client.get(LIST, params={"size": 101})).status_code == 422
    assert (await client.get(LIST, params={"page": 0})).status_code == 422


async def test_total_is_stable_across_pages(client: AsyncClient) -> None:
    """total은 페이지 크기와 무관하게 같아야 한다."""
    r1 = (await client.get(LIST, params={"size": 1})).json()
    r2 = (await client.get(LIST, params={"size": 50})).json()
    assert r1["total"] == r2["total"]


# ── 검색 ────────────────────────────────────────────────────


async def test_search_matches_name(client: AsyncClient) -> None:
    items = await _items(client, SEARCH, q="토너", size=20)
    assert items
    assert all("토너" in i["name"] for i in items)


async def test_search_requires_two_chars(client: AsyncClient) -> None:
    assert (await client.get(SEARCH, params={"q": "토"})).status_code == 422
    assert (await client.get(SEARCH)).status_code == 422


async def test_search_escapes_like_wildcards(client: AsyncClient) -> None:
    """'%'가 와일드카드로 새면 전건이 매칭된다."""
    res = await client.get(SEARCH, params={"q": "50%"})
    assert res.status_code == 200
    body = res.json()
    assert body["total"] < 100, "메타문자가 이스케이프되지 않았다"
    assert all("50%" in i["name"] for i in body["items"])


async def test_search_no_match_is_empty(client: AsyncClient) -> None:
    res = await client.get(SEARCH, params={"q": "존재하지않는제품명xyz"})
    assert res.status_code == 200
    assert res.json() == {"items": [], "total": 0, "page": 1, "size": 20}


# ── 상세 ────────────────────────────────────────────────────


async def test_detail_returns_ingredients_in_order(client: AsyncClient) -> None:
    pid = (await _items(client, size=1))[0]["id"]
    res = await client.get(f"{LIST}/{pid}")
    assert res.status_code == 200
    body = res.json()

    for key in REQUIRED:
        assert body.get(key) is not None

    ingredients = body["ingredients"]
    assert ingredients, "적재된 제품은 성분이 최소 1건 있다"
    positions = [x["position"] for x in ingredients]
    assert positions == sorted(positions)
    assert all(x["name"] for x in ingredients)
    # 큐레이션 전이라 등급은 응답에 없어야 한다
    assert "grade" not in ingredients[0]


async def test_detail_includes_notice_fields(client: AsyncClient) -> None:
    pid = (await _items(client, size=1))[0]["id"]
    body = (await client.get(f"{LIST}/{pid}")).json()
    for key in ("volume", "country", "manufacturer", "expiry", "productUrl"):
        assert key in body


async def test_detail_not_found(client: AsyncClient) -> None:
    assert (await client.get(f"{LIST}/99999999")).status_code == 404
    assert (await client.get(f"{LIST}/0")).status_code == 422
