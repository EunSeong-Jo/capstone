"""내 성분 취향 — 설명 가능한 개인 모델 (퍼스널 AI 3단계).

이 파일은 **DB·Redis 없이 도는 쪽**(tests/unit)이다. DB가 필요한 테스트는 `tests/integration/test_preference.py`에 있다.

계산(`build_profile`·`score`·`explain`)은 DB 없이, 신호 읽기와 API·홈 추천 연동은 로컬 DB로 확인한다.
"""
from __future__ import annotations

import math

import pytest
from app.services.personal_ai import preference as pf

pytestmark = pytest.mark.asyncio(loop_scope="session")

# 성분 id: 1 정제수(흔함) · 2 판테놀 · 3 병풀 · 4 알코올 · 5 향료
IDF = {1: 0.1, 2: 3.0, 3: 3.0, 4: 2.0, 5: 2.0}
LABELS = {1: ("", "s", "", 3), 2: ("HB", "a", "", 3), 3: ("S", "a", "", 3), 4: ("", "x", "L", 3), 5: ("", "x", "F", 3)}


def sig(pid: int, w: float, src: str = "review") -> pf.Signal:
    return pf.Signal(pid, w, (src,))


# ── 신호 합치기 ───────────────────────────────────────────────────────────


def test_combine_signals_sums_clamps_and_drops_zero() -> None:
    got = pf.combine_signals([sig(1, 1.0), sig(1, 0.8, "repeat"), sig(2, 0.6), sig(2, -0.6), sig(3, -0.6)])
    assert got[1].weight == 1.0 and got[1].sources == ("repeat", "review")      # 합이 1을 넘으면 1로
    assert 2 not in got                                                         # 상쇄돼 0이면 취향에 쓰지 않는다
    assert got[3].weight == -0.6


def test_review_weights_cover_ratings() -> None:
    assert pf.REVIEW_WEIGHT[5] > pf.REVIEW_WEIGHT[4] > 0 == pf.REVIEW_WEIGHT[3] > pf.REVIEW_WEIGHT[2] > pf.REVIEW_WEIGHT[1]


# ── 프로필 ────────────────────────────────────────────────────────────────


def _profile(signals: dict[int, float], docs: dict[int, list[int]]) -> pf.PreferenceProfile:
    return pf.build_profile({p: sig(p, w) for p, w in signals.items()}, docs, LABELS, IDF)


DOCS = {10: [1, 2, 3], 11: [1, 2, 3], 12: [1, 2], 20: [1, 4, 5], 30: [1, 2, 3], 31: [1, 4, 5]}


def test_cold_start_stays_inactive_below_min_signals() -> None:
    p = _profile({10: 1.0, 11: 1.0}, DOCS)             # 신호 2개 < MIN_SIGNALS
    assert not p.active and p.signal_count == 2
    assert pf.score(p, DOCS[30], LABELS, IDF) == 0.0     # 꺼져 있으면 점수 0


def test_needs_at_least_one_liked_product() -> None:
    p = _profile({20: -1.0, 31: -0.6, 10: -0.6}, DOCS)   # 별로였던 것만 있다
    assert not p.active


def test_active_profile_prefers_liked_ingredients_and_avoids_disliked() -> None:
    p = _profile({10: 1.0, 11: 0.6, 12: 1.0, 20: -1.0}, DOCS)
    assert p.active and p.signal_count == 4
    like_like = pf.score(p, DOCS[30], LABELS, IDF)       # 판테놀·병풀 — 좋아한 제품과 같은 성분
    dislike_like = pf.score(p, DOCS[31], LABELS, IDF)    # 알코올·향료 — 별로였던 제품과 같은 성분
    assert like_like > 0.5 and dislike_like < 0.05 and like_like > dislike_like


def test_vectors_are_l2_normalized() -> None:
    p = _profile({10: 1.0, 11: 1.0, 12: 1.0, 20: -1.0}, DOCS)
    assert math.isclose(sum(v * v for v in p.pos.values()), 1.0, rel_tol=1e-9)
    assert math.isclose(sum(v * v for v in p.neg.values()), 1.0, rel_tol=1e-9)


def test_common_ingredient_barely_matters() -> None:
    """정제수(IDF 0.1)만 겹치는 제품은 취향과 거의 무관하다 — IDF가 흔한 성분을 지운다."""
    p = _profile({10: 1.0, 11: 1.0, 12: 1.0}, DOCS)
    only_water = pf.score(p, [1], LABELS, IDF)
    assert only_water < 0.1


def test_explain_names_overlapping_ingredients_in_contribution_order() -> None:
    p = _profile({10: 1.0, 11: 1.0, 12: 1.0, 20: -1.0}, DOCS)
    likes, dislikes = pf.explain(p, [1, 2, 3, 4], LABELS, IDF)
    assert set(likes) <= {2, 3, 1} and 2 in likes and 3 in likes
    assert dislikes and dislikes[0] == 4
    assert pf.explain(p, [], LABELS, IDF) == ([], [])


def test_normalize_pool_is_relative_and_nonnegative() -> None:
    got = pf.normalize_pool({1: 0.4, 2: 0.2, 3: -0.3})
    assert got == {1: 1.0, 2: 0.5, 3: 0.0}
    assert pf.normalize_pool({1: -0.1, 2: 0.0}) == {1: 0.0, 2: 0.0}
    assert pf.normalize_pool({}) == {}


def test_product_without_ingredient_info_is_not_a_usable_signal() -> None:
    p = pf.build_profile({10: sig(10, 1.0), 99: sig(99, 1.0), 11: sig(11, 1.0), 12: sig(12, 1.0)}, DOCS, LABELS, IDF)
    assert p.signal_count == 3 and p.active                         # 99는 성분 정보가 없어 세지 않는다
