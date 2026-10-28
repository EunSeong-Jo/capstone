"""유사도 계산 단위 테스트.

**DB에 붙지 않는다.** conftest.py의 client 픽스처는 공용 Neon에 접속하는데,
계산 로직까지 거기에 묶으면 팀원이 DB를 정리하는 중에 테스트가 흔들린다.
여기서는 합성 데이터만 쓴다.

이 파일의 존재 이유는 하나다 — **IDF가 실제로 동작하는지 고정하는 것.**
전성분은 상위 6종이 거의 모든 제품에 들어 있어, 가중이 없으면 아무 두
제품이나 비슷해 보인다. test_common_ingredients_score_low가 그 경계를 지킨다.
"""
from __future__ import annotations

import numpy as np
import pytest

from app.services.similarity import (
    apply_curated,
    build_form_matrix,
    dedupe_topk,
    detect_form,
    variant_body,
    build_profile_matrix,
    build_role_matrix,
    shared_functions,
    topk_blend,
    build_matrix,
    build_vocab,
    compute_idf,
    is_bundle,
    min_ingredients,
    shared_top,
    topk_cosine,
)

# 흔한 성분 3종(정제수·글리세린·1,2-헥산다이올)과 변별 성분들.
# 실제 분포를 흉내낸다 — 앞 3개는 모든 제품에, 뒤는 일부에만.
WATER, GLYCERIN, HEXANEDIOL = 1, 2, 3
PANTHENOL, NIACINAMIDE, MADECASSOSIDE, RETINOL = 10, 11, 12, 13

COMMON = [WATER, GLYCERIN, HEXANEDIOL]


def _corpus() -> list[list[int]]:
    """10개 제품. 전부 흔한 3종을 갖고, 변별 성분만 다르다."""
    return [
        COMMON + [PANTHENOL, NIACINAMIDE],    # 0
        COMMON + [PANTHENOL, NIACINAMIDE],    # 1  0과 동일
        COMMON + [PANTHENOL],                 # 2
        COMMON + [MADECASSOSIDE],             # 3
        COMMON + [RETINOL],                   # 4
        COMMON,                               # 5  흔한 성분뿐
        COMMON,                               # 6  흔한 성분뿐
        COMMON + [NIACINAMIDE],               # 7
        COMMON + [MADECASSOSIDE, RETINOL],    # 8
        COMMON + [PANTHENOL, MADECASSOSIDE],  # 9
    ]


def _cosine(docs: list[list[int]]) -> np.ndarray:
    vocab = build_vocab(docs)
    idf = compute_idf(docs, vocab)
    mat = build_matrix(docs, vocab, idf)
    return (mat @ mat.T).toarray()


# ── IDF가 실제로 일하는지 ────────────────────────────────────────────

def test_idf_is_zero_for_universal_ingredient():
    """모든 제품에 있는 성분의 IDF는 0이다 — 변별력이 없다는 뜻."""
    docs = _corpus()
    vocab = build_vocab(docs)
    idf = compute_idf(docs, vocab)
    assert idf[vocab[WATER]] == pytest.approx(0.0)
    assert idf[vocab[GLYCERIN]] == pytest.approx(0.0)
    # 10건 중 1건에만 있는 성분은 log(10) ≈ 2.30
    assert idf[vocab[RETINOL]] > 1.0


def test_common_ingredients_score_low():
    """흔한 성분만 겹치는 쌍은 점수가 0이어야 한다.

    이 테스트가 깨지면 홈·상세의 '비슷한 제품'이 정제수가 겹친다는 이유로
    아무거나 추천하게 된다. 이 파일에서 가장 중요한 단언이다.
    """
    docs = _corpus()
    sim = _cosine(docs)
    # 4(레티놀)와 3(마데카소사이드)는 흔한 3종만 공유한다
    assert sim[4][3] == pytest.approx(0.0, abs=1e-9)
    # 5와 6은 성분이 완전히 같지만 전부 IDF 0이라 벡터가 영벡터가 된다
    assert sim[5][6] == pytest.approx(0.0, abs=1e-9)


def test_identical_documents_score_one():
    docs = _corpus()
    assert _cosine(docs)[0][1] == pytest.approx(1.0)


def test_partial_overlap_ranks_between():
    """변별 성분을 더 많이 공유할수록 점수가 높다."""
    docs = _corpus()
    sim = _cosine(docs)
    # 0(판테놀+나이아신아마이드) 기준: 1(동일) > 2(판테놀만) > 3(무관)
    assert sim[0][1] > sim[0][2] > sim[0][3]


# ── top-k ───────────────────────────────────────────────────────────

def test_topk_excludes_self():
    docs = _corpus()
    vocab = build_vocab(docs)
    idf = compute_idf(docs, vocab)
    idx, _ = topk_cosine(build_matrix(docs, vocab, idf), k=3)
    for row in range(len(docs)):
        assert row not in idx[row]


def test_topk_is_sorted_desc():
    docs = _corpus()
    vocab = build_vocab(docs)
    idf = compute_idf(docs, vocab)
    _, score = topk_cosine(build_matrix(docs, vocab, idf), k=4)
    for row in score:
        positive = row[row > 0]
        assert list(positive) == sorted(positive, reverse=True)


def test_topk_marks_empty_slots_with_minus_one():
    """대체품이 될 만한 게 없으면 -1로 비운다. 0번 제품을 넣지 않는다."""
    docs = _corpus()
    vocab = build_vocab(docs)
    idf = compute_idf(docs, vocab)
    idx, score = topk_cosine(build_matrix(docs, vocab, idf), k=9)
    # 5번은 흔한 성분뿐이라 어떤 제품과도 유사도가 0이다
    assert set(idx[5].tolist()) == {-1}
    assert score[5].sum() == pytest.approx(0.0)


def test_topk_handles_k_larger_than_corpus():
    docs = _corpus()[:2]
    vocab = build_vocab(docs)
    idf = compute_idf(docs, vocab)
    idx, _ = topk_cosine(build_matrix(docs, vocab, idf), k=20)
    assert idx.shape == (2, 1)  # 자기 자신을 빼면 후보는 1개뿐


def test_block_size_does_not_change_result():
    """블록 분할은 메모리 대책일 뿐 결과를 바꾸면 안 된다."""
    docs = _corpus()
    vocab = build_vocab(docs)
    idf = compute_idf(docs, vocab)
    mat = build_matrix(docs, vocab, idf)
    a_idx, a_score = topk_cosine(mat, k=3, block=512)
    b_idx, b_score = topk_cosine(mat, k=3, block=2)
    assert np.array_equal(a_idx, b_idx)
    assert np.allclose(a_score, b_score)


# ── 경계 입력 ────────────────────────────────────────────────────────

@pytest.mark.parametrize("doc", [[], [WATER]])
def test_degenerate_documents_do_not_raise(doc):
    docs = [doc, COMMON + [PANTHENOL]]
    vocab = build_vocab(docs)
    idf = compute_idf(docs, vocab)
    mat = build_matrix(docs, vocab, idf)
    idx, score = topk_cosine(mat, k=1)
    assert idx.shape == (2, 1)
    assert np.all(score >= 0.0)


# ── 근거 표시 ────────────────────────────────────────────────────────

def test_shared_top_prefers_rare_ingredients():
    """근거로 정제수를 보여주면 사용자가 신뢰하지 않는다."""
    docs = _corpus()
    vocab = build_vocab(docs)
    idf = compute_idf(docs, vocab)
    names = {
        WATER: "정제수", GLYCERIN: "글리세린", HEXANEDIOL: "1,2-헥산다이올",
        PANTHENOL: "판테놀", NIACINAMIDE: "나이아신아마이드",
    }
    got = shared_top(docs[0], docs[1], vocab, idf, names, limit=3)
    assert got[0] in ("나이아신아마이드", "판테놀")
    assert "정제수" not in got[:2]


def test_shared_top_empty_when_nothing_in_common():
    docs = [[PANTHENOL], [RETINOL]]
    vocab = build_vocab(docs)
    idf = compute_idf(docs, vocab)
    assert shared_top(docs[0], docs[1], vocab, idf, {}) == []


# ── 제외 규칙 ────────────────────────────────────────────────────────

def test_bundle_detection():
    """'N종 택1'은 호수별 전성분을 이어 붙여 원본 개수가 부푼다."""
    assert is_bundle(unique_count=141, raw_count=1978) is True
    assert is_bundle(unique_count=37, raw_count=37) is False
    assert is_bundle(unique_count=37, raw_count=None) is False
    # 경계: 정확히 2배는 묶음으로 보지 않는다
    assert is_bundle(unique_count=20, raw_count=40) is False
    assert is_bundle(unique_count=20, raw_count=41) is True


def test_min_ingredients_filter():
    assert min_ingredients(5) is True
    assert min_ingredients(4) is False


# ── hybrid: 성분 기능 라벨을 쓰는 유사도 ─────────────────────────────────
# 라벨 = (functions, role, flags, confidence)
SOOTH_A, SOOTH_B, HUMECT, BASE_SURF, JUNK = 20, 21, 22, 23, 24
LABELS = {
    PANTHENOL: ("BHS", "a", "", 3),
    SOOTH_A: ("S", "a", "", 3),
    SOOTH_B: ("S", "a", "", 3),     # SOOTH_A와 다른 성분이지만 같은 기능
    HUMECT: ("H", "a", "", 3),
    BASE_SURF: ("", "f", "", 3),
    JUNK: ("", "j", "", 3),
}


def _blend(docs, alpha=0.65, beta=0.35):
    vocab = build_vocab(docs)
    idf = compute_idf(docs, vocab)
    role = build_role_matrix(docs, vocab, idf, LABELS)
    prof = build_profile_matrix(docs, LABELS)
    return (alpha * (role @ role.T) + beta * (prof @ prof.T)).toarray()


def test_hybrid_rewards_same_function_with_different_ingredients():
    # 0과 1은 성분이 겹치지 않지만 둘 다 진정, 2는 보습뿐
    docs = [COMMON + [SOOTH_A], COMMON + [SOOTH_B], COMMON + [HUMECT]]
    m = _blend(docs)
    assert m[0, 1] > m[0, 2]


def test_hybrid_ignores_base_only_overlap():
    # 계면활성제만 같은 쌍은, 활성이 같은 쌍보다 낮아야 한다
    docs = [
        COMMON + [BASE_SURF, SOOTH_A], COMMON + [BASE_SURF, HUMECT],
        COMMON + [SOOTH_A],
    ]
    m = _blend(docs)
    assert m[0, 2] > m[0, 1]


def test_hybrid_junk_ingredient_has_no_weight():
    docs = [COMMON + [JUNK, SOOTH_A], COMMON + [JUNK, HUMECT]]
    m_with = _blend(docs)
    m_without = _blend([COMMON + [SOOTH_A], COMMON + [HUMECT]])
    assert m_with[0, 1] == pytest.approx(m_without[0, 1], abs=1e-9)


def test_hybrid_unlabeled_ingredient_still_counts():
    docs = [COMMON + [99], COMMON + [99], COMMON + [98]]
    m = _blend(docs)
    assert m[0, 1] > m[0, 2]


def test_topk_blend_matches_manual_blend_and_excludes_self():
    docs = [COMMON + [SOOTH_A], COMMON + [SOOTH_B], COMMON + [HUMECT]]
    vocab = build_vocab(docs)
    idf = compute_idf(docs, vocab)
    role = build_role_matrix(docs, vocab, idf, LABELS)
    prof = build_profile_matrix(docs, LABELS)
    idx, score = topk_blend([(role, 0.65), (prof, 0.35)], k=2)
    full = _blend(docs)
    assert 0 not in idx[0]
    assert idx[0][0] == 1
    assert score[0][0] == pytest.approx(full[0, 1])
    assert (score <= 1.0).all()


def test_shared_functions_needs_both_sides_and_ignores_low_confidence():
    labels = dict(LABELS)
    labels[30] = ("W", "a", "", 1)          # 확신도 1 → 근거에서 제외
    a = [SOOTH_A, HUMECT, 30]
    b = [SOOTH_B, 30]
    assert shared_functions(a, b, labels) == ["진정"]


# ── 제형·변형·판정 보정 ──────────────────────────────────────────────────


@pytest.mark.parametrize("name,form", [
    ("토코보 선스틱 SPF50+ PA++++", "스틱"),
    ("라운드랩 자작나무 수분 선쿠션 15g", "쿠션"),
    ("아누아 어성초 포어 컨트롤 클렌징오일 200ml", "오일"),
    ("바이오더마 센시비오 H2O 500ml", "워터"),
    ("메디힐 모공톡스 탄산 버블 시트 10매", "시트"),
    ("그라운드플랜 앰플 40ml", "앰플세럼"),
    ("아무 이름", None),
])
def test_detect_form(name, form):
    assert detect_form(name) == form


def test_form_matrix_unknown_form_contributes_nothing():
    m = build_form_matrix(["스틱", None, "스틱"]).toarray()
    assert (m @ m.T)[0, 2] == 1.0 and (m @ m.T)[0, 1] == 0.0 and m[1].sum() == 0.0


def test_variant_body_strips_size_and_count():
    assert variant_body("어나더페이스 마스크팩 4매") == variant_body("어나더페이스 마스크팩 1매")
    assert variant_body("바이오더마 아토덤 밤 500ml") == variant_body("바이오더마 아토덤 밤 200ml")
    assert variant_body("토리든 마스크 20매") != variant_body("토리든 앰플 20매")


def test_dedupe_keeps_one_per_variant_group_and_fills_k():
    docs = [[1, 2, 3], [1, 2, 4], [1, 2, 4], [1, 2, 5], [1, 2, 6]]
    names = ["브랜드 시드 100ml", "브랜드 A 1매", "브랜드 A 5매", "브랜드 B 50ml", "브랜드 C 30ml"]
    idx = np.array([[1, 2, 3, 4], [0, 2, 3, 4], [0, 1, 3, 4], [0, 1, 2, 4], [0, 1, 2, 3]])
    score = np.array([[0.9, 0.8, 0.7, 0.6]] * 5)
    out_i, out_s = dedupe_topk(idx, score, names, docs, k=3)
    assert list(out_i[0]) == [1, 3, 4]          # 2번은 1번의 변형이라 접힌다
    assert list(out_s[0]) == [0.9, 0.7, 0.6]


def test_dedupe_keeps_seed_variants_up_to_limit():
    docs = [[1, 2, 3], [1, 2, 3], [1, 2, 3], [1, 2, 3], [1, 2, 3], [1, 2, 9]]
    names = ["브랜드 토너 100ml", "브랜드 토너 200ml", "브랜드 토너 300ml", "브랜드 토너 400ml",
             "브랜드 토너 500ml", "다른 로션"]
    idx = np.array([[1, 2, 3, 4, 5]] + [[0, 2, 3, 4, 5]] * 5)
    score = np.array([[0.99, 0.98, 0.97, 0.96, 0.5]] * 6)
    out_i, _ = dedupe_topk(idx, score, names, docs, k=5, seed_variants_max=3)
    assert list(out_i[0][:4]) == [1, 2, 3, 5]    # 시드 변형은 3개까지, 그 뒤는 다른 제품


def test_apply_curated_demotes_zero_and_promotes_two_symmetrically():
    ids = [10, 20, 30]
    idx = np.array([[1, 2], [0, 2], [0, 1]])
    score = np.array([[0.6, 0.5], [0.6, 0.5], [0.5, 0.5]])
    out_i, out_s = apply_curated(idx, score, ids, {(10, 20): 0, (30, 10): 2}, k=2)
    assert list(out_i[0]) == [2, 1]              # 20은 0점 판정으로 밀리고 30은 2점 판정으로 오른다
    assert out_s[0][0] > 0.5 > out_s[0][1]
    assert list(out_i[1])[1] == 0                # 대칭: (20→10)도 같이 밀린다


# --- 제형 호환(대체품 후보 거르기) ---

from app.services.similarity import form_compatible  # noqa: E402


def test_form_compatible_blocks_different_use():
    assert not form_compatible("아비브 어성초 카밍 토너 200ml", "인삼스네일세럼 30ml")
    assert not form_compatible("에스트라 아토베리어365 크림 80ml", "달바 퍼스트 스프레이 세럼 100ml")
    assert not form_compatible("아누아 선쿠션 25g", "수분 크림 50ml")


def test_form_compatible_allows_same_group():
    assert form_compatible("에스트라 아토베리어365 크림 80ml", "에스트라 아토베리어365 로션 150ml")
    assert form_compatible("아비브 어성초 토너 200ml", "달바 미스트 100ml")
    assert form_compatible("히알루론 세럼 30ml", "나이아신아마이드 앰플 50ml")


def test_form_compatible_passes_unknown_form():
    assert form_compatible("이름에 제형이 없는 제품", "수분 크림 50ml")
    assert form_compatible("수분 크림 50ml", "이름에 제형이 없는 제품")


def test_form_compatible_uses_last_form_in_name():
    # '에센스 토너'는 토너다 — 앞쪽 규칙(앰플세럼)이 아니라 맨 뒤 제형을 본다
    assert form_compatible("마녀공장 판테토인 에센스 토너 200ml", "달바 미스트 100ml")
    assert not form_compatible("마녀공장 판테토인 에센스 토너 200ml", "히알루론 세럼 30ml")
    assert not form_compatible("코스알엑스 오일-프리 모이스쳐라이징 로션 100ml", "클렌징 오일 200ml")


def test_form_compatible_keeps_mask_forms():
    assert form_compatible("듀이셀 마스크팩 1매", "메디힐 시트 마스크 10매")


def test_refill_pouch_is_not_a_mask_pack() -> None:
    """'…토너 200ml 리필팩'의 '팩'은 마스크팩이 아니다 — 같은 제품의 리필이 제형 불일치로 걸러지면 안 된다."""
    from app.services.similarity import detect_form_tail, form_compatible

    assert detect_form_tail("라운드랩 1025 독도 토너 200ml 리필팩") == "토너"
    assert detect_form_tail("에스네이처 아쿠아 스쿠알란 세럼 50ml 리필팩") == "앰플세럼"
    assert form_compatible("라운드랩 1025 독도 토너 200ml", "라운드랩 1025 독도 토너 200ml 리필팩")
    # 진짜 마스크팩은 그대로 팩이다
    assert detect_form_tail("라운드랩 소나무 진정 시카 클레이 팩") == "워시오프팩"
