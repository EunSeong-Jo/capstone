"""예산 구매 가이드 (Task 15).

이 파일은 **DB·Redis가 필요한 쪽**(tests/integration)이다. DB 없이 도는 테스트는 `tests/unit/test_budget_guide.py`에 있다.

앞쪽은 DB 없이 도는 순수 함수(조합 탐색 · 1~3안 선택 · 사유) 테스트이고,
뒤쪽은 실제 카탈로그에 대고 API 계약과 규칙을 본다.
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient

URL = "/api/v1/recommendations/budget"


# ── API ──────────────────────────────────────────────────────

pytestmark_api = pytest.mark.asyncio(loop_scope="session")


@pytestmark_api
async def test_api_contract(client: AsyncClient) -> None:
    res = await client.post(URL, json={"budgetMin": 50_000, "budgetMax": 80_000, "skinType": "hwasan"})
    assert res.status_code == 200
    body = res.json()
    assert {"combinations", "budgetMin", "budgetMax", "skinType", "minPossibleTotal"} <= body.keys()
    assert 1 <= len(body["combinations"]) <= 3
    for combo in body["combinations"]:
        assert combo["total"] <= 80_000
        assert combo["remaining"] == 80_000 - combo["total"]
        assert [i["step"] for i in combo["items"]] == ["toner", "essence", "cream", "sunscreen"]
        assert sum(i["product"]["price"] for i in combo["items"]) == combo["total"]
        assert combo["reason"]


@pytestmark_api
async def test_api_too_small_budget_tells_minimum(client: AsyncClient) -> None:
    res = await client.post(URL, json={"budgetMin": 0, "budgetMax": 5_000})
    body = res.json()
    assert res.status_code == 200
    assert body["combinations"] == []
    assert body["missingSteps"] == ["토너", "에센스", "크림", "선크림"]
    assert body["minPossibleTotal"] and body["minPossibleTotal"] > 5_000


@pytestmark_api
async def test_api_small_budget_returns_partial_routine(client: AsyncClient) -> None:
    """네 단계를 못 사도 빈 화면이 아니라 앞쪽 단계부터 살 수 있는 만큼 보여 준다."""
    res = await client.post(URL, json={"budgetMin": 0, "budgetMax": 20_000, "skinType": "hwasan"})
    body = res.json()
    assert body["combinations"], "부분 루틴이라도 있어야 한다"
    assert body["missingSteps"], "빠진 단계를 알려야 한다"
    order = ["toner", "essence", "cream", "sunscreen"]
    for combo in body["combinations"]:
        steps = [i["step"] for i in combo["items"]]
        assert steps == order[: len(steps)], "앞쪽 단계부터 채운다"
        assert combo["total"] <= 20_000
    assert body["minPossibleTotal"] > 20_000


@pytestmark_api
async def test_api_excludes_owned_products(client: AsyncClient) -> None:
    payload = {"budgetMin": 50_000, "budgetMax": 80_000, "skinType": "hwasan"}
    first = (await client.post(URL, json=payload)).json()
    owned = [i["product"]["id"] for i in first["combinations"][0]["items"]]

    again = (await client.post(URL, json={**payload, "excludeProductIds": owned})).json()
    shown = {i["product"]["id"] for c in again["combinations"] for i in c["items"]}
    assert not shown & set(owned)


@pytestmark_api
async def test_api_is_cached(client: AsyncClient) -> None:
    payload = {"budgetMin": 60_000, "budgetMax": 90_000, "skinType": "ondalsam"}
    first = await client.post(URL, json=payload)
    second = await client.post(URL, json=payload)
    assert second.headers.get("X-Cache") == "HIT"
    assert second.json() == first.json()
