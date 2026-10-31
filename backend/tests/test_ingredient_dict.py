"""성분 사전 API 계약·불변식. 행 수에 의존하지 않는다(conftest 참고)."""
from __future__ import annotations

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio(loop_scope="session")

URL = "/api/v1/ingredients"


async def test_categories_contract(client: AsyncClient):
    r = await client.get(f"{URL}/categories")
    assert r.status_code == 200
    items = r.json()["items"]
    ids = [c["id"] for c in items]
    assert len(ids) == len(set(ids))
    assert {"moisture", "soothing", "allergen", "irritant"} <= set(ids)
    assert {c["group"] for c in items} == {"function", "caution"}
    assert all(c["count"] >= 0 and c["label"] and c["blurb"] for c in items)


async def test_category_list_matches_count_and_filters(client: AsyncClient):
    cats = {c["id"]: c for c in (await client.get(f"{URL}/categories")).json()["items"]}
    r = await client.get(URL, params={"category": "moisture", "size": 50})
    body = r.json()
    assert r.status_code == 200
    assert body["total"] == cats["moisture"]["count"]
    assert body["items"] and all("H" in i["functions"] for i in body["items"])


async def test_caution_categories_filter_flags(client: AsyncClient):
    body = (await client.get(URL, params={"category": "allergen", "size": 50})).json()
    assert all(i["isAllergen"] for i in body["items"])
    body = (await client.get(URL, params={"category": "irritant", "size": 50})).json()
    assert all("I" in i["flags"] for i in body["items"])


async def test_default_list_has_descriptions_first_and_no_noise(client: AsyncClient):
    items = (await client.get(URL, params={"size": 50})).json()["items"]
    seen_blank = False
    for i in items:
        assert i["role"] != "j"
        assert i["productCount"] > 0
        has = i["description"] is not None
        assert not (seen_blank and has), "설명 있는 성분이 설명 없는 성분 뒤에 나왔다"
        seen_blank = seen_blank or not has


async def test_search_by_name_and_alias(client: AsyncClient):
    # '히알루론산'은 구명칭·통칭이라 표준명(하이알루로닉…)으로 찾아져야 한다
    body = (await client.get(URL, params={"q": "히알루론산"})).json()
    assert body["total"] > 0
    assert any("알루" in i["name"] for i in body["items"])


async def test_ids_lookup_ignores_other_filters(client: AsyncClient):
    base = (await client.get(URL, params={"category": "moisture", "size": 2})).json()["items"]
    ids = ",".join(str(i["id"]) for i in base)
    body = (await client.get(URL, params={"ids": ids, "category": "uv"})).json()
    assert {i["id"] for i in body["items"]} == {i["id"] for i in base}


async def test_ids_garbage_and_unknown_category_are_empty_not_errors(client: AsyncClient):
    assert (await client.get(URL, params={"ids": "a,b"})).json()["items"] == []
    r = await client.get(URL, params={"category": "nope"})
    assert r.status_code == 200 and r.json()["items"] == []


async def test_paging_is_stable(client: AsyncClient):
    p1 = (await client.get(URL, params={"category": "soothing", "size": 5, "page": 1})).json()
    p2 = (await client.get(URL, params={"category": "soothing", "size": 5, "page": 2})).json()
    assert p1["total"] == p2["total"]
    assert not ({i["id"] for i in p1["items"]} & {i["id"] for i in p2["items"]})
