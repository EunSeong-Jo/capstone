"""사진으로 찾기 후보에서 같은 제품의 용량·기획 변형을 한 후보로 접는다.

이 파일은 **DB·Redis가 필요한 쪽**(tests/integration)이다. DB 없이 도는 테스트는 `tests/unit/test_product_variants.py`에 있다.
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_match_returns_one_candidate_per_product_with_variants(client: AsyncClient) -> None:
    res = await client.get("/api/v1/products/match", params={"q": "아누아 어성초 77 히알루론산 수분 진정 토너", "limit": 5})
    assert res.status_code == 200
    items = res.json()
    assert items, "시드 데이터에 아누아 토너가 있어야 한다"
    names = [i["product"]["name"] for i in items]
    assert len(names) == len(set(names)), "같은 제품이 여러 후보로 나오면 안 된다"
    grouped = [i for i in items if i["variants"]]
    assert grouped, "기획·용량 변형이 있는 제품은 variants가 채워져야 한다"
    for item in grouped:
        ids = [v["product"]["id"] for v in item["variants"]]
        assert ids[0] == item["product"]["id"]                          # 대표 = 가장 작은 용량이 맨 앞
        assert len(ids) == len(set(ids)) >= 2
        assert all(v["label"] for v in item["variants"])


async def test_home_recommendations_only_list_analyzed_products(client: AsyncClient) -> None:
    """홈이 먼저 골라 보여 주는 추천은 성분 분석이 끝난 제품만 — 눌렀을 때 '분석 전'이 나오지 않게."""
    from sqlalchemy import text

    from app.db.session import AsyncSessionLocal

    res = await client.get("/api/v1/recommendations/main", params={"size": 40})
    assert res.status_code == 200
    ids = [p["id"] for p in res.json()["items"]]
    assert ids
    async with AsyncSessionLocal() as db:
        analyzed = {
            r[0]
            for r in await db.execute(
                text("select distinct product_id from similarities where method='hybrid' and product_id = any(:ids)"),
                {"ids": ids},
            )
        }
    assert set(ids) <= analyzed, f"분석 전 제품이 추천에 섞였다: {set(ids) - analyzed}"
