"""대체품 API 계약 테스트.

계산 로직은 test_similarity.py가 DB 없이 검증한다. 여기서는 **엔드포인트가
지켜야 할 약속**만 본다.

similarities는 단일제품(composition='single')에만 적재된다. 기획세트·굿즈
동봉 제품에는 영영 대체품이 없다. 그래서 이 파일은 "결과가 몇 개 나온다"에
기대지 않는다 — 대신 **비어 있어도 200이고 모양이 같다**는 쪽을 못박는다.
프론트가 그 계약에 기대어 '준비 중' 자리표시자를 띄우기 때문이다.
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio(loop_scope="session")

LIST = "/api/v1/products"

# 프론트 Alternative 타입이 Product를 extends 하므로 카드 필드가 그대로 필요하다.
REQUIRED = ("id", "name", "brand", "category", "price", "score", "sharedIngredients")


def _url(product_id: int) -> str:
    return f"{LIST}/{product_id}/similar"


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def seed(client: AsyncClient) -> int:
    """유사도가 실제로 적재된 제품 하나.

    세션 스코프인 이유: 공용 Neon에 붙어 있어 왕복 하나가 비싸다. 테스트마다
    후보를 다시 찾으면 파일 전체가 분 단위로 늘어진다.

    기본 조회가 단일제품만 내주므로 카테고리를 가리지 않고 상위에서 찾는다.
    못 찾으면 유사도를 요구하는 테스트만 건너뛴다 — 배치를 안 돌린 팀원의
    로컬에서도 나머지는 돌아야 한다.
    """
    res = await client.get(LIST, params={"size": 8})
    for item in res.json()["items"]:
        got = await client.get(_url(item["id"]))
        if got.status_code == 200 and got.json()["items"]:
            return item["id"]
    pytest.skip("similarities가 아직 적재되지 않았습니다")


# ── 응답 계약 ────────────────────────────────────────────────


async def test_envelope(client: AsyncClient) -> None:
    """데이터가 있든 없든 봉투 모양은 같다."""
    res = await client.get(_url(1))
    assert res.status_code == 200, res.text
    body = res.json()
    assert set(body) == {"seedId", "method", "seedSkinFitScore", "items"}
    assert body["seedId"] == 1
    assert body["method"] == "tfidf"  # 기본값
    assert isinstance(body["items"], list)


async def test_empty_result_is_200_not_404(client: AsyncClient) -> None:
    """제품은 있는데 유사도만 없는 경우 — 404를 내면 화면이 오류로 뜬다.

    기획세트·굿즈 동봉 제품(composition != 'single')이 이 경우다. 배치가
    단일제품만 계산하므로 이들에게는 대체품이 영영 없지만, 제품 자체는
    존재하므로 404가 아니라 빈 배열이어야 한다.

    예전에는 "아직 계산하지 않은 카테고리"로 이 경로를 밟았는데, 4종을
    모두 적재하면서 그 전제가 사라졌다.
    """
    res = await client.get(LIST, params={"composition": "bundle", "size": 1})
    items = res.json()["items"]
    if not items:
        pytest.skip("composition='bundle' 제품이 없습니다")
    got = await client.get(_url(items[0]["id"]))
    assert got.status_code == 200
    assert got.json()["items"] == []


async def test_unknown_product_is_404(client: AsyncClient) -> None:
    res = await client.get(_url(99_999_999))
    assert res.status_code == 404


async def test_fields_are_camel_case(client: AsyncClient, seed: int) -> None:
    item = (await client.get(_url(seed))).json()["items"][0]
    for field in REQUIRED:
        assert field in item, f"{field} 누락"
    assert "shared_ingredients" not in item  # snake_case가 새면 안 된다


async def test_price_is_never_null(client: AsyncClient, seed: int) -> None:
    """ProductCardV가 price.toLocaleString()을 가드 없이 부른다."""
    for item in (await client.get(_url(seed))).json()["items"]:
        assert isinstance(item["price"], int)


# ── 정렬·경계 ────────────────────────────────────────────────


async def test_sorted_by_score_desc(client: AsyncClient, seed: int) -> None:
    scores = [i["score"] for i in (await client.get(_url(seed))).json()["items"]]
    assert scores == sorted(scores, reverse=True)


async def test_scores_are_in_unit_range(client: AsyncClient, seed: int) -> None:
    for item in (await client.get(_url(seed))).json()["items"]:
        assert 0.0 < item["score"] <= 1.0


async def test_seed_is_not_its_own_alternative(client: AsyncClient, seed: int) -> None:
    ids = [i["id"] for i in (await client.get(_url(seed))).json()["items"]]
    assert seed not in ids


async def test_limit_is_honoured(client: AsyncClient, seed: int) -> None:
    res = await client.get(_url(seed), params={"limit": 3})
    assert len(res.json()["items"]) <= 3


async def test_limit_above_max_is_422(client: AsyncClient) -> None:
    """배치가 제품당 20개만 적재한다. 더 달라는 요청은 막는다."""
    assert (await client.get(_url(1), params={"limit": 21})).status_code == 422
    assert (await client.get(_url(1), params={"limit": 0})).status_code == 422


# ── 방식 선택 ────────────────────────────────────────────────


@pytest.mark.parametrize("method", ["hybrid", "tfidf"])
async def test_each_method_answers(client: AsyncClient, method: str) -> None:
    res = await client.get(_url(1), params={"method": method})
    assert res.status_code == 200
    # hybrid는 적재 전이면 tfidf로 대신한다(응답 method가 실제 방식을 알려 준다)
    assert res.json()["method"] in {method, "tfidf"}


async def test_unknown_method_is_422(client: AsyncClient) -> None:
    res = await client.get(_url(1), params={"method": "cosine"})
    assert res.status_code == 422


async def test_methods_can_disagree(client: AsyncClient, seed: int) -> None:
    """두 방식을 나란히 적재하는 이유 — 기능 라벨이 점수에 반영돼야 한다.

    hybrid가 tfidf와 점수까지 완전히 같다면 라벨이 일하지 않고 있다는 신호다.
    """
    tfidf = await client.get(_url(seed), params={"method": "tfidf"})
    hybrid = await client.get(_url(seed), params={"method": "hybrid"})
    if hybrid.json()["method"] != "hybrid":
        pytest.skip("hybrid가 아직 적재되지 않았습니다")
    assert [i["score"] for i in tfidf.json()["items"]] != [
        i["score"] for i in hybrid.json()["items"]
    ]


async def test_shared_ingredients_avoid_ubiquitous_ones(client: AsyncClient, seed: int) -> None:
    """근거로 정제수·글리세린을 보여주면 추천을 신뢰할 수 없다.

    IDF 큰 순으로 고르므로 상위 근거에는 흔한 성분이 오면 안 된다.
    """
    ubiquitous = {"정제수", "글리세린", "1,2-헥산다이올", "부틸렌글라이콜"}
    for item in (await client.get(_url(seed))).json()["items"]:
        shared = item["sharedIngredients"]
        if shared:
            assert shared[0] not in ubiquitous


# ── 캐시 ──────────────────────────────────────────────────────


async def test_similar_is_cached(client: AsyncClient, seed: int) -> None:
    """두 번째 조회는 Redis에서 나오고 내용은 같다.

    홈의 교체 제안이 화장대 제품마다 이 API를 불러 한 번에 1~2초씩 걸렸다.
    """
    params = {"limit": 5, "skinType": "hwasan"}
    first = await client.get(_url(seed), params=params)
    second = await client.get(_url(seed), params=params)
    assert second.headers.get("X-Cache") == "HIT"
    assert second.json() == first.json()


async def test_unknown_product_is_not_cached(client: AsyncClient) -> None:
    for _ in range(2):
        res = await client.get(_url(99_999_999))
        assert res.status_code == 404
        assert "X-Cache" not in res.headers


async def test_recommendation_set_is_cached(client: AsyncClient) -> None:
    url = "/api/v1/recommendations/set"
    first = await client.get(url, params={"skinType": "ondalsam"})
    second = await client.get(url, params={"skinType": "ondalsam"})
    assert first.status_code == 200
    assert second.headers.get("X-Cache") == "HIT"
    assert second.json() == first.json()
