"""피부타입 규칙이 조회에 실제로 반영되는지 (Task 14).

`skin_type_rules`는 오래 비어 있었고, 채운 뒤에도 읽는 코드가 없었다.
여기서 확인하는 것은 **규칙이 실제로 결과를 바꾸는가**다 — 파라미터를
받기만 하고 아무것도 안 해도 200이 나오기 때문에, 건수가 줄어드는지를
직접 본다.

기준으로 쓰는 타입은 `yuriguseul`(민감성)이다. 기피 태그가 셋으로 가장
많아 효과가 분명하게 드러난다.
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio(loop_scope="session")

LIST = "/api/v1/products"
SEARCH = "/api/v1/products/search"
SENSITIVE = "yuriguseul"          # exclude: 착향제 26종 · 향료 · 휘발성 알코올
NO_EXCLUSION = "mulgae"           # 지성 — exclude_tags가 빈 배열이다


async def _total(client: AsyncClient, path: str = LIST, **params) -> int:
    res = await client.get(path, params={"size": 1, **params})
    assert res.status_code == 200, res.text
    return res.json()["total"]


async def test_exclusion_reduces_result(client: AsyncClient):
    """기피 태그가 있는 타입은 결과가 줄어야 한다."""
    base = await _total(client)
    filtered = await _total(client, skinType=SENSITIVE)
    assert 0 < filtered < base


async def test_type_without_exclusions_keeps_all(client: AsyncClient):
    """exclude_tags가 비면 아무것도 걸러지지 않는다.

    지성(물개)에는 휘발성 알코올을 기피로 넣지 않았다 — 피지 조절 제품에
    흔히 쓰이고 오히려 선호되기도 해서다. 그 판단이 규칙에 남아 있는지
    확인한다.
    """
    assert await _total(client, skinType=NO_EXCLUSION) == await _total(client)


async def test_unknown_type_is_ignored(client: AsyncClient):
    """모르는 타입에 404를 내지 않는다.

    진단 결과가 바뀌거나 규칙을 잠시 꺼 둔 사이에 화면이 통째로 비는 편이
    더 나쁘다. 필터 없이 전체를 낸다.
    """
    assert await _total(client, skinType="없는타입") == await _total(client)


async def test_excluded_products_really_gone(client: AsyncClient):
    """걸러진 제품이 정말 안 나오는지 상세를 열어 확인한다.

    total만 보면 '어쩌다 줄었다'와 구분되지 않는다. 실제로 남은 제품의
    전성분에 향료·알코올이 없어야 한다.
    """
    res = await client.get(LIST, params={"size": 20, "skinType": SENSITIVE})
    assert res.status_code == 200
    banned = {"향료", "조합향료", "변성알코올", "에탄올", "알코올", "리모넨", "리날룰"}
    for item in res.json()["items"][:5]:
        detail = await client.get(f"{LIST}/{item['id']}")
        assert detail.status_code == 200
        names = {i["name"] for i in detail.json()["ingredients"]}
        assert not (names & banned), f"{item['name']}에 {names & banned}가 남아 있다"


async def test_search_applies_exclusion(client: AsyncClient):
    """검색도 같은 규칙을 탄다. 목록만 걸러지면 검색으로 우회된다."""
    base = await _total(client, SEARCH, q="토너")
    filtered = await _total(client, SEARCH, q="토너", skinType=SENSITIVE)
    assert 0 < filtered < base


async def test_skin_fit_sort_works(client: AsyncClient):
    """sort=skinFit이 추천 태그를 가진 제품을 앞으로 올린다."""
    res = await client.get(
        LIST, params={"size": 5, "skinType": SENSITIVE, "sort": "skinFit"}
    )
    assert res.status_code == 200
    items = res.json()["items"]
    assert items
    # 정렬만 바뀌고 대상 집합은 같아야 한다 — skinFit이 필터까지 건드리면
    # 사용자가 정렬을 바꿨을 뿐인데 결과 수가 달라져 혼란스럽다.
    other = await client.get(
        LIST, params={"size": 5, "skinType": SENSITIVE, "sort": "popular"}
    )
    assert res.json()["total"] == other.json()["total"]
    assert [i["id"] for i in items] != [i["id"] for i in other.json()["items"]]


async def test_similar_applies_exclusion(client: AsyncClient):
    """대체품 추천에도 규칙이 붙는다.

    성분이 비슷하다고 다 권할 수 있는 건 아니다 — 민감성 사용자에게
    착향제가 든 제품을 대체품으로 내밀면 유사도가 높을수록 더 나쁘다.
    """
    seed = (await client.get(LIST, params={"size": 1})).json()["items"][0]["id"]
    plain = await client.get(f"{LIST}/{seed}/similar", params={"limit": 20})
    guarded = await client.get(
        f"{LIST}/{seed}/similar", params={"limit": 20, "skinType": SENSITIVE}
    )
    assert plain.status_code == guarded.status_code == 200
    assert len(guarded.json()["items"]) <= len(plain.json()["items"])
