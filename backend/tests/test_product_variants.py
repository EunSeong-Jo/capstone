"""사진으로 찾기 후보에서 같은 제품의 용량·기획 변형을 한 후보로 접는다."""
from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.services.product_variants import (
    group_key,
    sort_group,
    variant_label,
    volume_amount,
)

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_volume_amount_reads_first_amount_and_missing_goes_last() -> None:
    assert volume_amount("아누아 토너 350ml") == 350
    assert volume_amount("라운드랩 선크림 50mL 기획 (+50ml)") == 50
    assert volume_amount("시트 마스크 10매") == 10
    assert volume_amount("용량 표기 없음") == float("inf")


async def test_group_key_ignores_volume_and_gift_wording() -> None:
    a = group_key("아누아", "아누아 어성초 77 토너 250ml")
    assert a == group_key("아누아", "아누아 어성초 77 토너 500ml")
    assert a != group_key("아누아", "아누아 어성초 77 크림 80ml")
    assert a != group_key("다른브랜드", "아누아 어성초 77 토너 250ml")


async def test_sort_group_puts_smallest_volume_first_then_cheaper() -> None:
    members = [
        ("토너 350ml", 27500, 0),
        ("토너 150ml", 20000, 1),
        ("토너 150ml", 18000, 2),
        ("토너", 9000, 3),
    ]
    assert sort_group(members) == [2, 1, 0, 3]


async def test_variant_label_adds_set_wording_when_display_name_is_shared() -> None:
    display = "아누아 어성초 77 토너 350ml"
    assert variant_label(display, display) == "350ml"
    label = variant_label(display, display + " 더블기획 (+어성초 크림 20ml)")
    assert label.startswith("350ml · 더블기획")


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
