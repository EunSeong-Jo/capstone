"""예산 구매 가이드 (Task 15).

앞쪽은 DB 없이 도는 순수 함수(조합 탐색 · 1~3안 선택 · 사유) 테스트이고,
뒤쪽은 실제 카탈로그에 대고 API 계약과 규칙을 본다.
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.services.budget_guide import (
    Candidate,
    Combination,
    build_reason,
    search_combinations,
    search_partial,
    select_options,
)

URL = "/api/v1/recommendations/budget"


def _c(pid: int, step: str, price: int, score: float = 0.5, matched: int = 1) -> Candidate:
    return Candidate(product_id=pid, step=step, price=price, score=score, matched=matched, rating=4.5)


# ── 조합 탐색 ────────────────────────────────────────────────


def test_combinations_never_exceed_budget() -> None:
    steps = [
        [_c(1, "toner", 10_000), _c(2, "toner", 30_000)],
        [_c(3, "essence", 15_000), _c(4, "essence", 25_000)],
    ]
    combos = search_combinations(steps, budget_max=40_000)
    assert combos, "조합이 하나는 있어야 한다"
    assert all(c.total <= 40_000 for c in combos)
    assert {tuple(x.product_id for x in c.items) for c in combos} == {(1, 3), (1, 4)}


def test_one_product_per_step_in_routine_order() -> None:
    steps = [[_c(1, "toner", 1)], [_c(2, "essence", 1)], [_c(3, "cream", 1)]]
    (combo,) = search_combinations(steps, budget_max=10)
    assert [x.step for x in combo.items] == ["toner", "essence", "cream"]


def test_empty_step_means_no_combination() -> None:
    assert search_combinations([[_c(1, "toner", 1)], []], budget_max=100) == []


def test_budget_too_small_means_no_combination() -> None:
    steps = [[_c(1, "toner", 10_000)], [_c(2, "essence", 10_000)]]
    assert search_combinations(steps, budget_max=19_999) == []


def test_partial_drops_later_steps_first() -> None:
    """예산이 모자라면 뒤쪽 단계(선크림)부터 빼고 앞쪽(토너)을 남긴다."""
    steps = [
        [_c(1, "toner", 10_000)],
        [_c(2, "essence", 10_000)],
        [_c(3, "cream", 10_000)],
        [_c(4, "sunscreen", 10_000)],
    ]
    covered, combos = search_partial(steps, budget_max=25_000)
    assert covered == 2
    assert [x.step for x in combos[0].items] == ["toner", "essence"]


def test_partial_full_routine_when_affordable() -> None:
    steps = [[_c(1, "toner", 1)], [_c(2, "essence", 1)]]
    covered, _ = search_partial(steps, budget_max=10)
    assert covered == 2


def test_partial_nothing_when_first_step_unaffordable() -> None:
    assert search_partial([[_c(1, "toner", 10_000)], [_c(2, "essence", 1)]], budget_max=5_000) == (0, [])


# ── 1~3안 선택 ───────────────────────────────────────────────


def _combo(total: int, score: float, ids: tuple[int, ...]) -> Combination:
    return Combination(tuple(_c(i, "toner", 0) for i in ids), total, score)


def test_options_fall_into_bands() -> None:
    combos = [
        _combo(52_000, 0.6, (1,)),
        _combo(65_000, 0.7, (2,)),
        _combo(78_000, 0.8, (3,)),
    ]
    options = select_options(combos, 50_000, 80_000)
    assert [(label, c.total, below) for label, c, below in options] == [
        ("알뜰", 52_000, False),
        ("균형", 65_000, False),
        ("여유", 78_000, False),
    ]


def test_bands_start_from_cheapest_affordable_total() -> None:
    """가장 싼 조합이 이미 위쪽에 몰려 있어도 세 안으로 나눈다.

    예산 1~2만원에 조합이 19,500원부터라면, min부터 나누면 '여유' 하나만 나왔다.
    """
    combos = [
        _combo(19_500, 0.6, (1,)),
        _combo(19_750, 0.6, (2,)),
        _combo(20_000, 0.6, (3,)),
    ]
    options = select_options(combos, 10_000, 20_000)
    assert [label for label, _, _ in options] == ["알뜰", "균형", "여유"]


def test_single_option_is_called_recommended() -> None:
    options = select_options([_combo(19_500, 0.6, (1,))], 10_000, 20_000)
    assert [(label, below) for label, _, below in options] == [("추천 조합", False)]


def test_options_prefer_new_products() -> None:
    """앞 안과 겹치는 제품이 적은 조합을 고른다 — 세 안이 같은 제품을 돌려 쓰지 않게."""
    first = _combo(52_000, 0.70, (1, 2))
    same_again = _combo(65_000, 0.71, (1, 3))   # 1번 제품이 겹친다
    fresh = _combo(66_000, 0.69, (4, 5))         # 점수는 조금 낮지만 새 제품
    options = select_options([first, same_again, fresh], 50_000, 80_000)
    assert options[1][1] is fresh


def test_below_range_when_everything_is_cheaper() -> None:
    combos = [_combo(20_000, 0.6, (1,)), _combo(30_000, 0.7, (2,))]
    ((label, combo, below),) = select_options(combos, 50_000, 80_000)
    assert below is True
    assert label == "추천 조합"
    assert combo.total == 30_000


def test_no_options_without_combinations() -> None:
    assert select_options([], 0, 100_000) == []


# ── 추천 사유 ────────────────────────────────────────────────


def test_reason_mentions_matched_tag() -> None:
    combo = Combination((_c(1, "toner", 30_000, matched=3), _c(2, "essence", 40_000, matched=0)), 70_000, 0.6)
    reason = build_reason(combo, "울긋불긋 화산", "피지·모공 항염")
    assert reason == "울긋불긋 화산 타입에 맞는 피지·모공 항염 성분이 1개 제품에 들어 있어요"


def test_reason_leaves_rating_and_budget_to_the_screen() -> None:
    """별점·남는 예산은 화면이 안마다 따로 보여 준다. 문장에 또 쓰지 않는다."""
    combo = Combination((_c(1, "toner", 30_000, matched=1),), 30_000, 0.6)
    reason = build_reason(combo, "울긋불긋 화산", "피지·모공 항염")
    assert "별점" not in reason and "남아요" not in reason
    assert "모든 제품에" in reason


def test_reason_without_skin_type() -> None:
    combo = Combination((_c(1, "toner", 30_000),), 30_000, 0.6)
    assert build_reason(combo, None, None).startswith("별점과 리뷰가 많은 제품")


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
async def test_api_rejects_inverted_range(client: AsyncClient) -> None:
    res = await client.post(URL, json={"budgetMin": 90_000, "budgetMax": 60_000})
    assert res.status_code == 422


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
