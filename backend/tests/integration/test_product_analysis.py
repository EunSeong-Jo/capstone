"""내 제품 성분 분석 테스트 — 서비스는 DB 없이 합성 라벨로, 엔드포인트는 계약만.

이 파일은 **DB·Redis가 필요한 쪽**(tests/integration)이다. DB 없이 도는 테스트는 `tests/unit/test_product_analysis.py`에 있다.
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient


# ── 엔드포인트 계약 ──────────────────────────────────────────────────────

pytestmark_api = pytest.mark.asyncio(loop_scope="session")


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def pid(client: AsyncClient) -> int:
    return (await client.get("/api/v1/products", params={"size": 3})).json()["items"][0]["id"]


@pytestmark_api
async def test_analysis_shape_and_consistency_with_card(client: AsyncClient, pid: int) -> None:
    res = await client.get(f"/api/v1/products/{pid}/analysis", params={"skinType": "yuriguseul"})
    assert res.status_code == 200
    d = res.json()
    assert [f["code"] for f in d["functions"]] == list("HBSWAOPEU")
    assert all(0 <= f["value"] <= 100 for f in d["functions"])
    assert d["totalCount"] == len(d["anatomy"]) >= d["labeledCount"]
    assert [a["position"] for a in d["anatomy"]] == sorted(a["position"] for a in d["anatomy"])
    card = (await client.get(f"/api/v1/products/{pid}/skin-fit", params={"skinType": "yuriguseul"})).json()
    assert (d["fit"]["verdict"], d["fit"]["score"]) == (card["verdict"], card["score"])


@pytestmark_api
async def test_analysis_without_skin_type_has_no_fit_or_gaps(client: AsyncClient, pid: int) -> None:
    d = (await client.get(f"/api/v1/products/{pid}/analysis")).json()
    assert d["fit"] is None and d["skinType"] is None
    assert all(k["recommended"] is False for k in d["keyIngredients"])


@pytestmark_api
async def test_analysis_rejects_bad_input_and_missing_product(client: AsyncClient, pid: int) -> None:
    assert (await client.get("/api/v1/products/99999999/analysis")).status_code == 404
    assert (await client.get(f"/api/v1/products/{pid}/analysis", params={"closetIds": "a,b"})).status_code == 422
    big = ",".join(str(i) for i in range(1, 140))
    assert (await client.get(f"/api/v1/products/{pid}/analysis", params={"closetIds": big})).status_code == 422


@pytestmark_api
async def test_analysis_closet_ignores_itself_and_other_categories(client: AsyncClient, pid: int) -> None:
    d = (await client.get(f"/api/v1/products/{pid}/analysis", params={"closetIds": str(pid)})).json()
    assert d["closet"] is None or d["closet"]["ownedCount"] == 0


@pytestmark_api
async def test_analysis_skin_state_only_with_all_five_axes(client: AsyncClient, pid: int) -> None:
    full = {"moisture": 3, "oil": 5, "sensitivity": 8, "pigmentation": 4, "trouble": 6}
    d = (await client.get(f"/api/v1/products/{pid}/analysis", params={"skinType": "yuriguseul", **full})).json()
    assert [s["axis"] for s in d["skinState"]] and len(d["skinState"]) == 5
    partial = {k: v for k, v in list(full.items())[:3]}
    d2 = (await client.get(f"/api/v1/products/{pid}/analysis", params={**partial})).json()
    assert d2["skinState"] == [] and d2["skinStateSummary"] is None
    assert (await client.get(f"/api/v1/products/{pid}/analysis", params={"moisture": 11})).status_code == 422


@pytestmark_api
async def test_analysis_concerns_param(client: AsyncClient, pid: int) -> None:
    raw = "oiliness:79,moisture:40,redness:85,age_spot:86,acne:79,pore:64,wrinkle:96"
    d = (await client.get(f"/api/v1/products/{pid}/analysis", params={"concerns": raw})).json()
    assert [c["key"] for c in d["concernState"]] and len(d["concernState"]) == 7
    assert {c["status"] for c in d["concernState"]} <= {"good", "some", "lack", "fine", "na"}
    none = (await client.get(f"/api/v1/products/{pid}/analysis")).json()
    assert none["concernState"] == [] and none["concernSummary"] is None
    junk = (await client.get(f"/api/v1/products/{pid}/analysis", params={"concerns": "foo:1,bar:2"})).json()
    assert junk["concernState"] == []
