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
MATCH = "/api/v1/products/match"

# 프론트 src/types/index.ts의 Product가 필수로 요구하는 필드
REQUIRED = ("id", "name", "brand", "category", "price")

# scripts/seed_ingredient_descriptions.py의 KEYWORDS와 같아야 한다
DESCRIPTION_KEYWORDS = {
    "보습", "진정", "장벽강화", "브라이트닝", "탄력", "항산화", "피지조절",
    "각질케어", "자외선차단", "영양",
    "용제", "보존", "유화", "세정", "점증", "pH조절", "향료", "사용감개선",
    "안정화", "색소",
}


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

    # grade는 scripts/seed_skin_type_tags.py가 ingredient_tags에서 도출한다.
    # 값이 정해진 넷 중 하나이거나(근거 있음) None(분류 미정)이어야 한다 —
    # 화면이 이 값으로 칩 색을 정하므로 임의 문자열이 새면 조용히 중립으로
    # 그려진다.
    assert all(x["grade"] in (None, "key", "normal", "warn") for x in ingredients)

    # EWG 등급은 절대 내지 않는다. 컬럼은 있지만 출처를 검증할 수 없어
    # 비워 둔 값이고, 응답에 새면 화면이 근거 없는 안전 등급을 주장하게 된다.
    assert "ewgGrade" not in ingredients[0]
    assert "ewg_grade" not in ingredients[0]

    # 알레르겐 표시는 불리언이다(식약처 표시 의무 착향제 26종).
    assert all(isinstance(x["isAllergen"], bool) for x in ingredients)

    # 성분 설명. 키워드가 어휘 밖으로 새면 화면 칩 필터가 갈라진다 —
    # 적재 스크립트가 막지만 응답 계약으로도 못박는다.
    for x in ingredients:
        desc = x.get("description")
        if desc is None:
            assert x.get("keywords") == []
            assert x.get("descriptionSource") is None
            continue
        assert isinstance(desc, str) and desc.strip()
        assert 1 <= len(x["keywords"]) <= 2
        assert set(x["keywords"]) <= DESCRIPTION_KEYWORDS
        assert x["descriptionSource"] in ("llm", "reviewed")


async def test_detail_joins_ingredient_description(client: AsyncClient) -> None:
    """설명이 실제로 붙는지 — 정제수는 거의 모든 제품에 들어 있고 설명이 있다."""
    for item in await _items(client, size=20):
        body = (await client.get(f"{LIST}/{item['id']}")).json()
        water = next((x for x in body["ingredients"] if x["name"] == "정제수"), None)
        if water is not None:
            assert water["description"]
            assert water["keywords"]
            return
    pytest.skip("첫 20개 제품에 정제수가 없다")


async def test_detail_includes_notice_fields(client: AsyncClient) -> None:
    pid = (await _items(client, size=1))[0]["id"]
    body = (await client.get(f"{LIST}/{pid}")).json()
    for key in ("volume", "country", "manufacturer", "expiry", "productUrl"):
        assert key in body


async def test_detail_not_found(client: AsyncClient) -> None:
    assert (await client.get(f"{LIST}/99999999")).status_code == 404
    assert (await client.get(f"{LIST}/0")).status_code == 422


# ── 단가 ─────────────────────────────────────────────────────

class TestUnitPrice:
    """단가 표시·정렬 계약.

    마스크팩에 '20매' 같은 대용량이 섞여 있어 총액만으로는 비교가 어긋난다 —
    80,000원/20매(1매당 4,000원)가 3,000원/1매(1매당 3,000원)보다 27배 비싼
    것처럼 정렬된다. 여기서 보는 것은 **단가가 실제로 값을 바꾸는가**다.
    """

    async def test_pair_is_all_or_nothing(self, client: AsyncClient):
        """unitPrice와 unitLabel은 함께 오거나 함께 없다.

        한쪽만 오면 화면이 'undefined당 3,000원'을 그리거나 단가를 통째로
        떨어뜨린다. DB 생성 컬럼이 같은 식에서 나오므로 계약으로 못박는다.
        """
        for item in await _items(client, size=50):
            assert (item.get("unitPrice") is None) == (item.get("unitLabel") is None)

    async def test_label_is_known_code(self, client: AsyncClient):
        """라벨은 화면이 문구로 옮길 수 있는 코드여야 한다."""
        known = {"sheet", "ml10", "g10", "piece"}
        for item in await _items(client, size=50):
            if item.get("unitLabel") is not None:
                assert item["unitLabel"] in known

    async def test_sort_by_unit_price_is_ascending(self, client: AsyncClient):
        items = await _items(client, size=30, sort="unitPriceAsc", category="마스크팩")
        prices = [i["unitPrice"] for i in items]
        assert prices == sorted(prices)

    async def test_products_without_unit_price_go_last(self, client: AsyncClient):
        """단가를 못 내는 제품이 '가장 싼 것'의 첫 자리에 서면 안 된다."""
        assert all(i["unitPrice"] is not None for i in
                   await _items(client, size=30, sort="unitPriceAsc"))

    async def test_unit_price_sort_differs_from_price_sort(self, client: AsyncClient):
        """단가순과 가격순이 같으면 이 기능이 아무 일도 안 한 것이다."""
        by_price = [i["id"] for i in await _items(client, size=10, sort="priceAsc",
                                                  category="마스크팩")]
        by_unit = [i["id"] for i in await _items(client, size=10, sort="unitPriceAsc",
                                                 category="마스크팩")]
        assert by_price != by_unit

    async def test_multi_sheet_product_uses_sheet_unit(self, client: AsyncClient):
        """매수가 있으면 매수가 이긴다 — 사용자가 소비하는 단위가 '한 장'이다."""
        items = await _items(client, size=100, sort="unitPriceAsc", category="마스크팩")
        sheets = [i for i in items if i["unitLabel"] == "sheet"]
        assert sheets, "마스크팩 상위에 1매당 단가 제품이 하나도 없다"
        for i in sheets:
            # 1매당 단가는 총액을 넘을 수 없다(매수가 1 이상이므로).
            assert i["unitPrice"] <= i["price"] + 0.01

    async def test_similar_also_carries_unit_price(self, client: AsyncClient):
        """대체품 카드도 같은 값을 쓴다. 목록만 붙이면 화면마다 기준이 달라진다."""
        seed = (await _items(client, size=1, category="마스크팩"))[0]["id"]
        res = await client.get(f"{LIST}/{seed}/similar", params={"limit": 5})
        assert res.status_code == 200
        for item in res.json()["items"]:
            assert (item.get("unitPrice") is None) == (item.get("unitLabel") is None)


# ── 제품 후기 ─────────────────────────────────────────────────


async def test_product_reviews_empty_by_default(client: AsyncClient) -> None:
    """후기가 없는 제품은 빈 목록과 null 평균을 낸다.

    후기는 산 제품에만 쓸 수 있어서 대부분의 제품은 비어 있다. `products.review_count`
    (크롤링으로 받아 온 올리브영 리뷰 수)와 다른 값이다 — 저쪽은 내용을 갖고 있지 않다.

    공용 DB에는 QA·데모 후기가 쌓일 수 있으므로, 첫 제품이 비어 있다고 가정하지 않고
    **후기가 하나도 없는 제품을 DB에서 골라** 확인한다.
    """
    from sqlalchemy import select

    from app.db.session import AsyncSessionLocal
    from app.models.personal import Review
    from app.models.product import Product

    async with AsyncSessionLocal() as db:
        product_id = await db.scalar(
            select(Product.id)
            .where(~select(Review.id).where(Review.product_id == Product.id).exists())
            .order_by(Product.id)
            .limit(1)
        )
    assert product_id is not None, "후기가 없는 제품이 하나도 없다"

    res = await client.get(f"/api/v1/products/{product_id}/reviews")
    assert res.status_code == 200
    body = res.json()
    assert body["items"] == []
    assert body["total"] == 0
    # 0.0이 아니라 null이다. 0.0으로 내면 "최악"과 "아직 없음"이 같아 보인다.
    assert body["average"] is None
    assert body["distribution"] == {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}


async def test_product_reviews_404_for_unknown_product(client: AsyncClient) -> None:
    res = await client.get("/api/v1/products/999999999/reviews")
    assert res.status_code == 404


async def test_product_reviews_never_expose_email(client: AsyncClient) -> None:
    """작성자는 닉네임만 낸다."""
    listing = await client.get("/api/v1/products", params={"size": 1})
    product_id = listing.json()["items"][0]["id"]

    res = await client.get(f"/api/v1/products/{product_id}/reviews")
    for item in res.json()["items"]:
        assert "email" not in item and "userId" not in item


# ── OCR 텍스트 매칭 ───────────────────────────────────────────


async def test_match_requires_two_chars(client: AsyncClient) -> None:
    assert (await client.get(MATCH, params={"q": "a"})).status_code == 422


async def test_match_returns_empty_not_error(client: AsyncClient) -> None:
    """아무것도 못 찾으면 빈 배열이다 — 404가 아니다.

    OCR은 완전 실패가 44.4%다(scripts/OCR_SUMMARY.md). "못 찾았다"는 오류가
    아니라 정상적인 결과이고, 화면은 수동 검색으로 안내해야 한다.
    """
    res = await client.get(MATCH, params={"q": "zzzz99999999"})
    assert res.status_code == 200
    assert res.json() == []


async def test_match_finds_product_by_korean_name(client: AsyncClient) -> None:
    """DB에 있는 한글명 일부로 그 제품이 나와야 한다."""
    name = (await _items(client, size=1))[0]["name"]
    # 앞 두 토큰(브랜드 + 첫 단어)만 넘긴다 — OCR이 포장에서 읽는 분량에 가깝다
    q = " ".join(name.split()[:2])

    res = await client.get(MATCH, params={"q": q, "limit": 5})
    assert res.status_code == 200
    body = res.json()
    assert body, f"'{q}'로 아무것도 찾지 못했다"
    assert any(m["product"]["name"] == name for m in body)


async def test_match_response_shape(client: AsyncClient) -> None:
    name = (await _items(client, size=1))[0]["name"]
    body = (
        await client.get(MATCH, params={"q": " ".join(name.split()[:2]), "limit": 5})
    ).json()
    assert body

    for m in body:
        # product는 목록과 같은 모양이어야 한다 — 프론트가 같은 카드로 그린다
        for key in REQUIRED:
            assert m["product"].get(key) is not None

        # 점수를 signals 묶음으로 낸다. 나중에 이미지 유사도를 두 번째 신호로
        # 더할 때 응답 모양이 깨지지 않도록 한 약속이다.
        text = m["signals"]["text"]
        assert text["matchedOn"] in ("ko", "en")
        assert 0 < text["score"] <= 1
        assert text["matchedText"]


async def test_match_is_sorted_by_score(client: AsyncClient) -> None:
    """점수 내림차순이어야 한다 — 호출 측이 1위만 보고 판단할 수 있어야 한다."""
    name = (await _items(client, size=1))[0]["name"]
    body = (
        await client.get(MATCH, params={"q": " ".join(name.split()[:2]), "limit": 10})
    ).json()
    scores = [m["signals"]["text"]["score"] for m in body]
    assert scores == sorted(scores, reverse=True)


async def test_match_never_returns_same_product_twice(client: AsyncClient) -> None:
    """한 제품에 영문명이 여러 개 붙을 수 있다. 후보 목록에는 한 번만 나와야 한다."""
    name = (await _items(client, size=1))[0]["name"]
    body = (
        await client.get(MATCH, params={"q": " ".join(name.split()[:2]), "limit": 20})
    ).json()
    ids = [m["product"]["id"] for m in body]
    assert len(ids) == len(set(ids))
