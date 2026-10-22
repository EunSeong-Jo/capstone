"""피부 궁합 판정 테스트.

서비스(services/skin_fit.py)는 DB 없이 합성 라벨로 검증한다 — 공용 DB 상태에 흔들리지 않게.
마지막 절은 엔드포인트 계약만 본다(라벨이 적재된 환경에서만 판정 내용을 요구한다).
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient

from app.services.skin_fit import evaluate

# 합성 성분 id → (functions, role, flags, confidence)
L = {
    1: ("S", "a", "", 3),      # 진정 활성
    2: ("S", "a", "", 3),
    3: ("B", "a", "", 3),      # 장벽 활성
    4: ("H", "e", "", 3),      # 보습 에몰리언트
    5: ("H", "a", "", 3),      # 보습 활성
    6: ("P", "a", "", 3),      # 피지 활성
    7: ("", "x", "F", 3),      # 향료
    8: ("", "x", "L", 3),      # 건조 알코올
    9: ("W", "a", "", 3),      # 미백
    10: ("A", "a", "", 3),     # 주름
    11: ("S", "a", "", 1),     # 확신도 1 → 근거 제외
}
N = {i: f"성분{i}" for i in L}


def fit(doc, skin_type, axes=None):
    return evaluate(doc, L, N, skin_type, axes)


def test_sensitive_skin_likes_soothing_and_barrier():
    r = fit([1, 2, 3, 1, 2, 3, 4, 5, 1, 2, 3, 1], "yuriguseul")
    assert r.verdict == "good" and r.score >= 66
    assert any(x.kind == "plus" and "진정" in x.text for x in r.reasons)


def test_sensitive_skin_gets_caution_for_fragrance_and_alcohol():
    r = fit([1, 2, 3, 7, 8], "yuriguseul")
    assert r.verdict == "caution"
    texts = " ".join(x.text for x in r.reasons if x.kind == "minus")
    assert "향료" in texts and "알코올" in texts


def test_same_product_differs_by_skin_type():
    doc = [6, 6, 6, 3, 4]    # 피지 성분 위주
    assert fit(doc, "mulgae").score > fit(doc, "samak").score


def test_dry_skin_loses_more_to_drying_alcohol_than_oily_skin():
    clean, alcohol = [4, 5, 3, 6, 1], [4, 5, 3, 6, 1, 8]
    drop_dry = fit(clean, "samak").score - fit(alcohol, "samak").score
    drop_oily = fit(clean, "mulgae").score - fit(alcohol, "mulgae").score
    assert drop_dry > drop_oily


def test_few_evidence_ingredients_is_unknown_not_ok():
    r = fit([1, 2], "yuriguseul")
    assert r.verdict == "unknown" and r.score is None


def test_low_confidence_and_unlabeled_ingredients_are_not_evidence():
    r = fit([11, 11, 11, 99, 98], "yuriguseul")
    assert r.verdict == "unknown"


def test_unknown_skin_type():
    assert fit([1, 2, 3], "nope").verdict == "unknown"


def test_high_sensitivity_axis_makes_fragrance_cost_more():
    clean, scented = [4, 5, 6], [4, 5, 6, 7]
    base = fit(clean, "ondalsam").score - fit(scented, "ondalsam").score
    axes = {"sensitivity": 9}
    sens = fit(clean, "ondalsam", axes).score - fit(scented, "ondalsam", axes).score
    assert sens > base


def test_score_is_bounded():
    for t in ("ondalsam", "mulgae", "subuji", "hwasan", "samak", "injeolmi", "yuriguseul", "memilmuk"):
        for doc in ([1, 2, 3, 4, 5] * 4, [7, 8, 7, 8, 1, 2, 3]):
            r = fit(doc, t)
            assert r.score is None or 0 <= r.score <= 100


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


def test_each_ingredient_is_reported_under_one_flag_only():
    """에탄올(L+I)·유제놀(F+I)이 '알코올'과 '자극' 이유에 두 번 잡히지 않는다 (감점도 한 번)."""
    labels = dict(L)
    labels[40] = ("", "s", "IL", 3)      # 에탄올 같은 성분: 알코올 + 자극
    labels[41] = ("", "x", "IF", 3)      # 유제놀 같은 성분: 향료 + 자극
    labels[42] = ("", "x", "I", 3)       # 자극만 있는 성분
    names = {**N, 40: "에탄올", 41: "유제놀", 42: "고농도산"}
    r = evaluate([1, 2, 3, 40, 41, 42], labels, names, "yuriguseul")
    minus = [x for x in r.reasons if x.kind == "minus"]
    positions = [p for x in minus for p, _ in x.ingredients]
    assert len(positions) == len(set(positions)) == 3           # 세 성분이 각각 정확히 한 번
    by = {x.text: {n for _, n in x.ingredients} for x in minus}
    assert by["향료 성분이 들어 있어요"] == {"유제놀"}
    assert by["건조를 부르는 알코올이 들어 있어요"] == {"에탄올"}
    assert by["그 밖에 자극이 될 수 있는 성분이 들어 있어요"] == {"고농도산"}


def test_flag_penalty_is_not_doubled_for_multi_flag_ingredients():
    labels = dict(L)
    labels[40] = ("", "s", "IL", 3)
    names = {**N, 40: "에탄올"}
    one = evaluate([1, 2, 3, 40], labels, names, "yuriguseul").score
    labels2 = dict(L)
    labels2[40] = ("", "s", "L", 3)
    only_l = evaluate([1, 2, 3, 40], labels2, names, "yuriguseul").score
    assert one == only_l        # I가 겹쳐 붙어 있다고 더 깎이지 않는다
