"""내 제품 성분 분석 테스트 — 서비스는 DB 없이 합성 라벨로, 엔드포인트는 계약만."""
from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient

from app.services.product_analysis import (
    caution_kind,
    cautions,
    closet_position,
    concern_state,
    concern_summary,
    josa,
    parse_concerns,
    skin_state,
    skin_state_summary,
    FOCUS_AT,
    MILD_AT,
    CONCERN_FOCUS_BELOW,
    CONCERN_MILD_BELOW,
    function_strengths,
    health_of,
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


def test_closet_position_overlaps_gaps_and_similar():
    mine = function_strengths([1, 2, 1, 2], L)                  # 진정이 강하다
    twin = function_strengths([1, 2, 2], L)                     # 진정이 강한 보유 제품
    other = function_strengths([5, 5, 5], L)                    # 피지
    pos = closet_position(
        mine, [(10, "쌍둥이", twin), (11, "피지템", other)], "yuriguseul", {10: 0.61, 99: 0.9}
    )
    assert [o["name"] for o in pos["overlaps"]] == ["진정"]
    assert pos["overlaps"][0]["products"] == [{"id": 10, "name": "쌍둥이"}]
    # 유리구슬이 중요하게 보는 장벽(1.0)은 아무 제품도 갖지 못해 부족한 기능이다
    assert "장벽" in [g["name"] for g in pos["gaps"]]
    assert "진정" not in [g["name"] for g in pos["gaps"]]
    # 비슷한 정도는 넘겨받은 hybrid 유사도 그대로(61%)이고, 점수가 없는 제품은 목록에 없다
    assert pos["similar"] == [{"id": 10, "name": "쌍둥이", "percent": 61}] and pos["owned_count"] == 2


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


def test_health_score_uses_same_color_boundaries_as_photo_concerns():
    # 문답 신경 쓸 정도(0~10)를 100점으로 환산해도 사진 분석과 같은 70/80 경계로 색이 갈린다
    scores = [health_of(c) for c in range(11)]
    assert scores == sorted(scores, reverse=True)                  # 신경 쓸수록 점수가 낮다
    for c in range(11):
        level = "focus" if c >= FOCUS_AT else "mild" if c >= MILD_AT else "fine"
        h = health_of(c)
        photo = "focus" if h < CONCERN_FOCUS_BELOW else "mild" if h < CONCERN_MILD_BELOW else "fine"
        assert level == photo, c


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


def test_josa_follows_final_consonant():
    assert josa("다크서클", "은는") == "다크서클은" and josa("트러블", "은는") == "트러블은"
    assert josa("광채", "은는") == "광채는" and josa("피지·모공", "을를") == "피지·모공을"
    assert josa("알코올", "이가") == "알코올이" and josa("향료 성분", "이가") == "향료 성분이"
    rows = concern_state({"acne": 20, "pore": 20}, function_strengths([1], L), [])
    assert "은(는)" not in (concern_summary(rows) or "")


def test_parse_concerns_keeps_only_known_keys_and_valid_scores():
    assert parse_concerns("oiliness:79, moisture:74,foo:50,acne:101,pore:x,wrinkle:-5") == {"oiliness": 79, "moisture": 74}
    assert parse_concerns(None) == {} and parse_concerns("") == {}


def test_concern_state_scores_higher_is_better_and_marks_unaddressable_items():
    st = function_strengths([1, 2, 3, 4, 1, 2], L)
    rows = concern_state(
        {"redness": 50, "moisture": 90, "eye_bag": 40, "acne": 75, "pore": 30}, st, []
    )
    by = {r["key"]: r for r in rows}
    assert by["redness"]["concern"] == "focus" and by["redness"]["status"] == "good"      # 진정·장벽 성분이 충분
    assert by["moisture"]["concern"] == "fine" and by["moisture"]["status"] == "fine"      # 90점 = 좋은 편
    assert by["acne"]["concern"] == "mild"
    assert by["pore"]["status"] == "lack"                                                  # 피지·각질 성분 없음
    assert by["eye_bag"]["status"] == "na" and by["eye_bag"]["addressable"] is False       # 성분으로 바뀌기 어렵다
    assert [r["concern"] for r in rows][:3] == ["focus", "focus", "focus"]                 # 신경 쓸 부분이 앞, 낮은 점수 먼저
    assert rows[0]["score"] <= rows[1]["score"]


def test_concern_summary_ignores_unaddressable_focus_items():
    st = function_strengths([1, 2, 3], L)
    rows = concern_state({"eye_bag": 20, "redness": 60}, st, [])
    assert "눈밑" not in (concern_summary(rows) or "")
    assert concern_summary(concern_state({"moisture": 95}, st, [])) is None


def test_concern_state_risk_only_on_guarded_items():
    st = function_strengths([1, 2, 3], L)
    groups = cautions([6, 8], L, N)
    by = {r["key"]: r for r in concern_state({"redness": 50, "moisture": 50}, st, groups)}
    assert by["redness"]["risk"] and by["moisture"]["risk"] is None


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


def test_fine_items_still_report_how_much_the_product_helps():
    st = function_strengths([1, 2, 3, 4, 1, 2], L)
    by = {r["key"]: r for r in concern_state({"moisture": 90, "pore": 95, "eye_bag": 95}, st, [])}
    # 신경 쓸 필요가 적어도(status는 fine) 제품이 돕는 정도는 따로 말한다
    assert by["moisture"]["status"] == "fine" and by["moisture"]["help"] in {"good", "some", "lack"}
    assert by["pore"]["status"] == "fine" and by["pore"]["help"] == "lack"      # 피지·각질 성분 없음
    assert by["eye_bag"]["help"] is None                                         # 성분으로 바뀌기 어려운 항목
