"""옵션형 묶음 제품 — 원본은 숨기고 옵션은 한 제품으로 보인다 (로컬/Neon 데이터에 분해 결과가 있어야 한다)."""
from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import text

from app.db.session import AsyncSessionLocal

pytestmark = pytest.mark.asyncio(loop_scope="session")


@pytest_asyncio.fixture(loop_scope="session")
async def group():
    """옵션이 3개 이상인 그룹 하나: {parent, options: [(id,label,order)], name}"""
    async with AsyncSessionLocal() as db:
        parent = (
            await db.execute(
                text("""select p.id, (select o.display_name from products o where o.option_parent_id = p.id
                                       order by o.option_order limit 1) from products p
                         where p.composition = 'optgroup' and p.status = 'active'
                           and (select count(*) from products o where o.option_parent_id = p.id) >= 3
                         order by p.id limit 1""")
            )
        ).first()
        if parent is None:
            pytest.skip("옵션형 묶음 분해 결과가 없습니다 (scripts/load_products.py --options-only)")
        opts = (
            await db.execute(
                text("select id, option_label, option_order from products where option_parent_id = :p order by option_order"),
                {"p": parent[0]},
            )
        ).all()
    return {"parent": parent[0], "name": parent[1], "options": [tuple(o) for o in opts]}


async def test_option_detail_lists_all_options_in_order(client: AsyncClient, group) -> None:
    first_id, first_label, _ = group["options"][0]
    body = (await client.get(f"/api/v1/products/{first_id}")).json()
    assert body["optionLabel"] == first_label and body["optionParentId"] == group["parent"]
    assert [(o["id"], o["label"]) for o in body["options"]] == [(i, l) for i, l, _ in group["options"]]
    assert [o["orderNo"] for o in body["options"]] == list(range(1, len(group["options"]) + 1))
    assert body["ingredients"], "옵션 행은 자기 구간의 전성분을 가진다"


async def test_parent_detail_exposes_options_so_the_screen_can_redirect(client: AsyncClient, group) -> None:
    body = (await client.get(f"/api/v1/products/{group['parent']}")).json()
    assert body["composition"] == "optgroup"
    assert [o["id"] for o in body["options"]] == [i for i, _l, _o in group["options"]]


async def test_options_have_their_own_ingredients(client: AsyncClient, group) -> None:
    a, b = group["options"][0][0], group["options"][1][0]
    names = []
    for pid in (a, b):
        body = (await client.get(f"/api/v1/products/{pid}")).json()
        names.append({i["name"] for i in body["ingredients"]})
    assert names[0] != names[1], "옵션별로 성분이 달라야 분해한 의미가 있다"


async def test_listing_shows_one_representative_and_never_the_parent(client: AsyncClient, group) -> None:
    first_id = group["options"][0][0]
    others = {i for i, _l, o in group["options"] if o != 1}
    res = await client.get("/api/v1/products/search", params={"q": group["name"], "size": 50})
    ids = {p["id"] for p in res.json()["items"]}
    assert first_id in ids
    assert not (ids & others), "대표가 아닌 옵션이 목록에 나오면 같은 제품이 여러 장 나온다"
    assert group["parent"] not in ids, "원본(optgroup)은 목록에 나오면 안 된다"


async def test_search_finds_group_by_any_option_label(client: AsyncClient, group) -> None:
    label = group["options"][-1][1]
    res = await client.get("/api/v1/products/search", params={"q": label, "size": 50})
    assert group["options"][0][0] in {p["id"] for p in res.json()["items"]}


async def test_photo_match_folds_options_into_one_candidate(client: AsyncClient, group) -> None:
    res = await client.get("/api/v1/products/match", params={"q": group["name"], "limit": 3})
    item = next((i for i in res.json() if i["product"]["id"] == group["options"][0][0]), None)
    assert item is not None, "대표 옵션이 후보로 나와야 한다"
    assert [v["label"] for v in item["variants"]] == [l for _i, l, _o in group["options"]]
    ids = [i["product"]["id"] for i in res.json()]
    assert group["parent"] not in ids


async def test_similarities_never_pair_siblings(client: AsyncClient, group) -> None:
    async with AsyncSessionLocal() as db:
        n = (
            await db.execute(
                text("""select count(*) from similarities s join products a on a.id = s.product_id
                          join products b on b.id = s.similar_id
                         where s.method = 'hybrid' and a.option_parent_id = :p and b.option_parent_id = :p"""),
                {"p": group["parent"]},
            )
        ).scalar_one()
    assert n == 0


async def test_analysis_carries_options(client: AsyncClient, group) -> None:
    pid, label, _ = group["options"][1]
    body = (await client.get(f"/api/v1/products/{pid}/analysis")).json()
    assert body["optionLabel"] == label
    assert [o["id"] for o in body["options"]] == [i for i, _l, _o in group["options"]]
