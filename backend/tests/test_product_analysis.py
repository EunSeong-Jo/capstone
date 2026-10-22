"""내 제품 성분 분석 테스트 — 서비스는 DB 없이 합성 라벨로, 엔드포인트는 계약만."""
from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient

from app.services.product_analysis import (
    caution_kind,
    cautions,
    closet_position,
    cosine,
    skin_state,
    skin_state_summary,
    function_strengths,
    key_ingredients,
)

L = {
    1: ("S", "a", "", 3), 2: ("S", "a", "", 3), 3: ("B", "a", "", 3),
    4: ("H", "e", "", 3), 5: ("P", "a", "", 3),
    6: ("", "x", "FA", 3),      # 고시 목록 향료
    7: ("", "x", "F", 3),       # 향료
    8: ("", "s", "IL", 3),      # 알코올 + 자극
    9: ("", "x", "I", 3),
    10: ("", "x", "F", 2),      # 확신도 2 → 근거 아님
    11: ("S", "a", "", 1),      # 확신도 1 → 근거 아님
}
N = {i: f"성분{i}" for i in L}


def test_strengths_use_active_and_emollient_only_and_decay_with_position():
    s = function_strengths([1, 2, 3, 4], L)
    assert s["S"]["count"] == 2 and s["B"]["count"] == 1 and s["H"]["count"] == 1
    assert s["S"]["value"] > s["B"]["value"] > 0
    assert s["U"] == {"value": 0, "count": 0}
    # 같은 성분이라도 뒤로 갈수록 약하다
    late = function_strengths([6] * 30 + [1], {**L}, positions=[*range(1, 31), 31])
    assert late["S"]["value"] < s["B"]["value"]


def test_low_confidence_labels_are_not_evidence():
    assert function_strengths([11, 11], L)["S"]["count"] == 0


def test_key_ingredients_are_leading_actives_with_functions():
    keys = key_ingredients([6, 1, 4, 3, 2, 5], L, N)
    assert [k["name"] for k in keys] == ["성분1", "성분3", "성분2", "성분5"]   # 에몰리언트·향료는 제외
    assert keys[0]["position"] == 2 and keys[0]["functions"] == ["진정"]


def test_each_ingredient_belongs_to_one_caution_group_by_priority():
    assert caution_kind(L[6]) == "listed"
    assert caution_kind(L[7]) == "fragrance"
    assert caution_kind(L[8]) == "alcohol"          # IL → 알코올이 우선
    assert caution_kind(L[9]) == "irritant"
    assert caution_kind(L[10]) is None              # 확신도 2는 주의 근거가 아니다
    groups = cautions([1, 6, 7, 8, 9, 10], L, N)
    assert [g["kind"] for g in groups] == ["listed", "fragrance", "alcohol", "irritant"]
    seen = [i["position"] for g in groups for i in g["ingredients"]]
    assert len(seen) == len(set(seen)) == 4


def test_cosine_of_identical_profiles_is_one_and_disjoint_is_zero():
    a = function_strengths([1, 2], L)
    b = function_strengths([5], L)
    assert cosine(a, a) == pytest.approx(1.0)
    assert cosine(a, b) == 0.0


def test_closet_position_overlaps_gaps_and_similar():
    mine = function_strengths([1, 2, 1, 2], L)                  # 진정이 강하다
    twin = function_strengths([1, 2, 2], L)                     # 진정이 강한 보유 제품
    other = function_strengths([5, 5, 5], L)                    # 피지
    pos = closet_position(mine, [(10, "쌍둥이", twin), (11, "피지템", other)], "yuriguseul")
    assert [o["name"] for o in pos["overlaps"]] == ["진정"]
    assert pos["overlaps"][0]["products"] == [{"id": 10, "name": "쌍둥이"}]
    # 유리구슬이 중요하게 보는 장벽(1.0)은 아무 제품도 갖지 못해 부족한 기능이다
    assert "장벽" in [g["name"] for g in pos["gaps"]]
    assert "진정" not in [g["name"] for g in pos["gaps"]]
    assert pos["similar"][0]["id"] == 10 and pos["owned_count"] == 2


def test_gaps_are_empty_without_a_skin_type():
    mine = function_strengths([1], L)
    assert closet_position(mine, [], None)["gaps"] == []


AXES = {"moisture": 3, "oil": 2, "sensitivity": 8, "pigmentation": 1, "trouble": 1}


def test_skin_state_orders_by_concern_and_reads_axis_direction():
    st = function_strengths([1, 2, 3, 4, 1, 2], L)                  # 진정·장벽·보습 위주, 피지·미백 없음
    state = skin_state(AXES, st, [])
    by = {s["axis"]: s for s in state}
    assert by["moisture"]["concern"] == "focus"                     # 수분 3 → 건조 → 신경 쓸 부분
    assert by["sensitivity"]["concern"] == "focus"
    assert by["oil"]["concern"] == "fine"                           # 유분 2 → 지성 아님
    assert by["moisture"]["status"] != "lack" and by["sensitivity"]["status"] == "good"
    assert [s["concern"] for s in state][:2] == ["focus", "focus"]  # 신경 쓸 부분이 앞에 온다


def test_skin_state_flags_lacking_function_and_summarizes():
    st = function_strengths([5], L)                                 # 피지 성분뿐
    state = skin_state(AXES, st, [])
    by = {s["axis"]: s for s in state}
    assert by["sensitivity"]["status"] == "lack" and by["moisture"]["status"] == "lack"
    assert "충분히 돕지는 못" in skin_state_summary(state)


def test_skin_state_warns_about_cautions_only_on_guarded_axes():
    st = function_strengths([1, 2, 3], L)
    groups = cautions([6, 8], L, N)
    by = {s["axis"]: s for s in skin_state(AXES, st, groups)}
    assert by["sensitivity"]["risk"] and "알레르기" in by["sensitivity"]["risk"]
    assert by["moisture"]["risk"] is None


def test_skin_state_needs_axes_and_ignores_missing():
    assert skin_state({}, function_strengths([1], L), []) == []
    assert skin_state_summary([]) is None


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
