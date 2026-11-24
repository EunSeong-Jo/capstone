"""피부 궁합 판정 테스트.

이 파일은 **DB·Redis 없이 도는 쪽**(tests/unit)이다. DB가 필요한 테스트는 `tests/integration/test_skin_fit.py`에 있다.

서비스(services/skin/skin_fit.py)는 DB 없이 합성 라벨로 검증한다 — 공용 DB 상태에 흔들리지 않게.
마지막 절은 엔드포인트 계약만 본다(라벨이 적재된 환경에서만 판정 내용을 요구한다).
"""
from __future__ import annotations

from app.services.skin.skin_fit import evaluate

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
