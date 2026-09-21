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
    build_matrix,
    build_vocab,
    compute_idf,
    is_bundle,
    jaccard,
    min_ingredients,
    rbo,
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


def test_jaccard_scores_the_same_pair_high():
    """같은 쌍을 Jaccard는 높게 본다 — 두 방식의 차이를 고정한다."""
    docs = _corpus()
    a, b = set(docs[4]), set(docs[3])
    assert jaccard(a, b) == pytest.approx(3 / 5)  # 3 공통 / 5 합집합
    # tfidf는 같은 쌍을 0으로 본다. 이 간극이 IDF를 쓰는 이유다.
    assert _cosine(docs)[4][3] < 0.01


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


# ── RBO ─────────────────────────────────────────────────────────────

def test_rbo_identical_is_one():
    assert rbo([1, 2, 3, 4], [1, 2, 3, 4]) == pytest.approx(1.0)


def test_rbo_is_order_sensitive():
    """같은 집합, 다른 순서 → 1.0 미만. 이게 Jaccard와 다른 점이다."""
    order = [1, 2, 3, 4, 5]
    assert rbo(order, list(reversed(order))) < 1.0
    assert jaccard(set(order), set(reversed(order))) == 1.0


def test_rbo_weights_the_top():
    """앞쪽이 겹치는 쪽이 뒤쪽이 겹치는 쪽보다 높다.

    전성분은 함량 내림차순이라 앞 순위가 제형을 결정한다.
    """
    base = [1, 2, 3, 4, 5, 6]
    head_match = [1, 2, 3, 9, 8, 7]
    tail_match = [9, 8, 7, 4, 5, 6]
    assert rbo(base, head_match) > rbo(base, tail_match)


def test_rbo_disjoint_is_zero():
    assert rbo([1, 2, 3], [4, 5, 6]) == pytest.approx(0.0)


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


def test_empty_inputs_return_zero():
    assert jaccard(set(), {1, 2}) == 0.0
    assert rbo([], [1, 2]) == 0.0


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
