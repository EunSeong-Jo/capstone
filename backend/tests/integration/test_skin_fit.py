"""피부 궁합 판정 테스트.

이 파일은 **DB·Redis가 필요한 쪽**(tests/integration)이다. DB 없이 도는 테스트는 `tests/unit/test_skin_fit.py`에 있다.

서비스(services/skin/skin_fit.py)는 DB 없이 합성 라벨로 검증한다 — 공용 DB 상태에 흔들리지 않게.
마지막 절은 엔드포인트 계약만 본다(라벨이 적재된 환경에서만 판정 내용을 요구한다).
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient


# ── 엔드포인트 계약 ──────────────────────────────────────────────────────

pytestmark_api = pytest.mark.asyncio(loop_scope="session")


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def pid(client: AsyncClient) -> int:
    res = await client.get("/api/v1/products", params={"size": 5})
    return res.json()["items"][0]["id"]


@pytestmark_api
async def test_endpoint_shape_and_verdict_domain(client: AsyncClient, pid: int) -> None:
    res = await client.get(f"/api/v1/products/{pid}/skin-fit", params={"skinType": "yuriguseul"})
    assert res.status_code == 200
    body = res.json()
    assert body["verdict"] in {"good", "ok", "caution", "unknown"}
    assert body["skinType"] == "yuriguseul" and body["productId"] == pid
    assert isinstance(body["reasons"], list)


@pytestmark_api
async def test_endpoint_rejects_unknown_type_and_missing_product(client: AsyncClient, pid: int) -> None:
    assert (await client.get(f"/api/v1/products/{pid}/skin-fit", params={"skinType": "x"})).status_code == 422
    assert (await client.get("/api/v1/products/99999999/skin-fit", params={"skinType": "samak"})).status_code == 404
    assert (await client.get(f"/api/v1/products/{pid}/skin-fit")).status_code == 422


@pytestmark_api
async def test_similar_items_carry_skin_match_only_when_type_given(client: AsyncClient, pid: int) -> None:
    plain = (await client.get(f"/api/v1/products/{pid}/similar")).json()["items"]
    typed = (await client.get(f"/api/v1/products/{pid}/similar", params={"fitFor": "samak"})).json()["items"]
    assert all(i["skinMatch"] is None for i in plain)
    assert all(i["skinMatch"] in {"good", "ok", "caution", "unknown"} for i in typed)


@pytestmark_api
async def test_batch_returns_brief_items_and_rejects_bad_input(client: AsyncClient, pid: int) -> None:
    res = await client.get("/api/v1/skin-fit", params={"ids": f"{pid},99999999", "skinType": "samak"})
    assert res.status_code == 200
    items = res.json()["items"]
    assert [i["productId"] for i in items] == [pid]          # 없는 제품은 빠진다
    assert items[0]["verdict"] in {"good", "ok", "caution", "unknown"}
    assert "reasons" not in items[0]
    assert (await client.get("/api/v1/skin-fit", params={"ids": "a,b", "skinType": "samak"})).status_code == 422
    assert (await client.get("/api/v1/skin-fit", params={"ids": "", "skinType": "samak"})).status_code == 422
    big = ",".join(str(i) for i in range(1, 70))
    assert (await client.get("/api/v1/skin-fit", params={"ids": big, "skinType": "samak"})).status_code == 422
    assert (await client.get("/api/v1/skin-fit", params={"ids": str(pid), "skinType": "x"})).status_code == 422


@pytestmark_api
async def test_similar_items_carry_the_same_score_the_fit_verdict_came_from(client: AsyncClient, pid: int) -> None:
    plain = (await client.get(f"/api/v1/products/{pid}/similar")).json()["items"]
    typed = (await client.get(f"/api/v1/products/{pid}/similar", params={"fitFor": "samak"})).json()["items"]
    assert all(i["skinFitScore"] is None for i in plain)
    for i in typed:
        if i["skinMatch"] == "unknown":
            assert i["skinFitScore"] is None
        else:
            assert 0 <= i["skinFitScore"] <= 100


@pytestmark_api
async def test_similar_carries_the_seed_fit_score_only_when_type_given(client: AsyncClient, pid: int) -> None:
    plain = (await client.get(f"/api/v1/products/{pid}/similar")).json()
    typed = (await client.get(f"/api/v1/products/{pid}/similar", params={"fitFor": "samak"})).json()
    assert plain["seedSkinFitScore"] is None
    assert typed["seedSkinFitScore"] is None or 0 <= typed["seedSkinFitScore"] <= 100
