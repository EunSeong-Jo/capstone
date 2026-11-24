"""사진으로 찾기 후보에서 같은 제품의 용량·기획 변형을 한 후보로 접는다.

이 파일은 **DB·Redis 없이 도는 쪽**(tests/unit)이다. DB가 필요한 테스트는 `tests/integration/test_product_variants.py`에 있다.
"""
from __future__ import annotations

import pytest

from app.services.matching.product_variants import (
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
