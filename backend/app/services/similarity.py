"""성분 유사도 계산 (Task 3).

DB를 모른다. 자료구조만 받아 숫자를 돌려준다 — 테스트를 공용 Neon에 붙이지
않기 위해서다(backend/tests/conftest.py는 실 DB에 접속한다).
적재는 scripts/compute_similarities.py, 조회는 app/api/recommendations.py.

세 방식을 나란히 두는 이유
--------------------------
전성분에서 상위 6종이 사실상 모든 제품에 들어 있다.

    글리세린 85% · 정제수 84% · 1,2-헥산다이올 81%
    부틸렌글라이콜 80% · 에틸헥실글리세린 66% · 소듐하이알루로네이트 51%

그래서 단순 교집합(Jaccard)만 쓰면 아무 두 제품이나 비슷해 보인다. IDF로
가중해야 판테놀·나이아신아마이드·마데카소사이드 같은 변별 성분이 점수를
지배한다. tfidf가 주 방식이고 jaccard는 그 차이를 드러내는 기준선이다.

rbo는 순서까지 본다. 화장품 전성분은 함량 내림차순 표기가 원칙이라
product_ingredients.position 자체가 정보다. 다만 쌍마다 선형 시간이 들어
전 쌍에 돌릴 수 없다 — tfidf 상위 후보를 재순위하는 용도로만 쓴다.
"""
from __future__ import annotations

import re

import numpy as np
from scipy.sparse import csr_matrix

# 기획세트 구분자가 성분명 앞에 붙어 들어온 경우:
#   '[보송 선스틱] 부틸렌글라이콜다이카프릴레이트' → '부틸렌글라이콜다이카프릴레이트'
# 396개 제품에 1,139회 나타난다. 근거로 보여줄 때는 방해만 되므로 떼어낸다.
# (원본 정리는 적재 파이프라인의 몫이라 여기서는 표시만 손본다.)
_SET_LABEL = re.compile(r"^\s*\[[^\]]*\]\s*")

# 성분 목록을 position 오름차순으로 담은 제품 하나. 값은 ingredient_id.
Doc = list[int]

METHODS = ("tfidf", "jaccard", "rbo")


def build_vocab(docs: list[Doc]) -> dict[int, int]:
    """ingredient_id → 열 번호. 등장한 성분만 열을 차지한다.

    사전에는 25,923종이 있지만 실제 제품에 붙은 것은 6,403종뿐이라
    전체 사전 크기로 행렬을 잡으면 4분의 3이 빈 열이 된다.
    """
    vocab: dict[int, int] = {}
    for doc in docs:
        for ing in doc:
            if ing not in vocab:
                vocab[ing] = len(vocab)
    return vocab


def compute_idf(docs: list[Doc], vocab: dict[int, int]) -> np.ndarray:
    """log(N / df). 스무딩 없이 그대로 쓴다.

    df는 '제품 수'라 0이 될 수 없고(vocab이 docs에서 나왔다), N과 같아도
    log(1)=0이 되어 '모든 제품에 있는 성분은 변별력 0'이라는 뜻이 된다.
    정제수(84%)에 0.17, 1건짜리 성분에 8.3 정도가 붙는다.
    """
    df = np.zeros(len(vocab), dtype=np.float64)
    for doc in docs:
        for ing in set(doc):
            df[vocab[ing]] += 1.0
    n = len(docs)
    return np.log(n / np.maximum(df, 1.0))


def build_matrix(
    docs: list[Doc], vocab: dict[int, int], idf: np.ndarray
) -> csr_matrix:
    """L2 정규화된 문서×성분 희소 행렬.

    TF는 이진이다. product_ingredients가 (product_id, ingredient_id) 유일이라
    한 제품 안에 같은 성분이 두 번 들어가지 않는다 — 셀 빈도가 항상 1이다.

    미리 정규화해 두면 이후 코사인 유사도가 그냥 내적이 된다.
    """
    indptr = [0]
    indices: list[int] = []
    data: list[float] = []
    for doc in docs:
        cols = sorted({vocab[i] for i in doc})
        w = idf[cols]
        norm = float(np.linalg.norm(w))
        if norm > 0:
            w = w / norm
        indices.extend(cols)
        data.extend(w.tolist())
        indptr.append(len(indices))
    return csr_matrix(
        (np.asarray(data), np.asarray(indices), np.asarray(indptr)),
        shape=(len(docs), len(vocab)),
        dtype=np.float64,
    )


def topk_cosine(
    matrix: csr_matrix, k: int, block: int = 512
) -> tuple[np.ndarray, np.ndarray]:
    """행별 상위 k개 (자기 자신 제외). 반환은 (인덱스, 점수).

    행렬이 L2 정규화돼 있으므로 matrix @ matrix.T가 곧 코사인이다.
    전체를 한 번에 곱하면 4,150×4,150 밀집 배열이 되는데, 카테고리를 나눠
    부르면 최대 2,147²(약 35MB)라 감당은 된다. 그래도 블록으로 끊는 편이
    피크 메모리를 예측 가능하게 만든다.

    k가 후보 수보다 크면 있는 만큼만 채우고 나머지는 -1 / 0.0으로 남긴다.
    """
    n = matrix.shape[0]
    k = max(0, min(k, n - 1))
    idx_out = np.full((n, k), -1, dtype=np.int64)
    score_out = np.zeros((n, k), dtype=np.float64)
    if k == 0:
        return idx_out, score_out

    mat_t = matrix.T.tocsc()
    for start in range(0, n, block):
        stop = min(start + block, n)
        sim = (matrix[start:stop] @ mat_t).toarray()
        # 자기 자신은 항상 1.0이라 그대로 두면 상위권을 하나 잡아먹는다.
        rows = np.arange(stop - start)
        sim[rows, np.arange(start, stop)] = -1.0

        part = np.argpartition(-sim, kth=k - 1, axis=1)[:, :k]
        part_scores = np.take_along_axis(sim, part, axis=1)
        order = np.argsort(-part_scores, axis=1)
        idx_out[start:stop] = np.take_along_axis(part, order, axis=1)
        score_out[start:stop] = np.take_along_axis(part_scores, order, axis=1)

    # 점수 0 이하(겹치는 성분이 하나도 없음)는 대체품이 아니다.
    idx_out[score_out <= 0.0] = -1
    score_out[score_out <= 0.0] = 0.0
    # 성분 집합이 완전히 같으면 코사인이 1.0인데, 부동소수점 반올림으로
    # 1.0000000000000004가 나온다. 저장 계약이 0~1이고 화면에서 백분율로
    # 바꾸면 100.00000000000001%가 되므로 여기서 자른다.
    np.clip(score_out, 0.0, 1.0, out=score_out)
    return idx_out, score_out


def jaccard(a: set[int], b: set[int]) -> float:
    """|A∩B| / |A∪B|. 기준선 용도."""
    if not a or not b:
        return 0.0
    inter = len(a & b)
    if inter == 0:
        return 0.0
    return inter / (len(a) + len(b) - inter)


def rbo(a: Doc, b: Doc, p: float = 0.9) -> float:
    """Rank-Biased Overlap. 앞쪽 순위에 가중을 둔 겹침도.

    p는 상위 편중 정도다. 0.9면 상위 10개가 점수의 약 86%를 결정한다.
    전성분은 앞 10개가 제형을 사실상 결정하므로 이 정도가 맞다.

    꼬리 보정(extrapolation) 없이 관측 구간만 쓰되 (1-p^depth)로 나눠
    정규화한다. 그래서 두 목록이 완전히 같으면 정확히 1.0이 된다.
    """
    if not a or not b:
        return 0.0
    depth = max(len(a), len(b))
    seen_a: set[int] = set()
    seen_b: set[int] = set()
    total = 0.0
    for d in range(depth):
        if d < len(a):
            seen_a.add(a[d])
        if d < len(b):
            seen_b.add(b[d])
        w = p**d
        total += w * len(seen_a & seen_b) / (d + 1)
    if p >= 1.0:
        return total / depth
    return (1 - p) / (1 - p**depth) * total


def shared_top(
    a: Doc, b: Doc, vocab: dict[int, int], idf: np.ndarray, names: dict[int, str],
    limit: int = 5,
) -> list[str]:
    """공통 성분을 IDF 큰 순으로. 화면에 '왜 비슷한지' 근거로 쓴다.

    IDF 순인 이유: 정제수·글리세린을 근거라고 보여주면 사용자가 신뢰하지
    않는다. 흔하지 않은 성분이 겹칠수록 설명력이 있다.
    """
    common = set(a) & set(b)
    if not common:
        return []
    ranked = sorted(common, key=lambda i: -idf[vocab[i]])
    out: list[str] = []
    for i in ranked:
        if i not in names:
            continue
        cleaned = _SET_LABEL.sub("", names[i]).strip()
        if cleaned and cleaned not in out:
            out.append(cleaned)
        if len(out) >= limit:
            break
    return out


def is_bundle(unique_count: int, raw_count: int | None) -> bool:
    """'N종 택1' 기획세트 판정.

    호수별 전성분을 한 셀에 이어 붙이면 같은 성분이 반복돼 원본 개수가
    고유 개수보다 크게 부푼다(최대 사례 1,978 → 141). 이런 제품은 어느
    호수의 성분인지 알 수 없어 유사도의 의미가 없다.

    products.ingredient_count_raw 주석이 이 값을 판단 근거로 명시하고 있다.
    """
    if raw_count is None:
        return False
    return raw_count > unique_count * 2


def min_ingredients(count: int, floor: int = 5) -> bool:
    """성분이 너무 적으면 제외. 4,150건 중 42건.

    3개짜리 제품은 그 3개가 흔한 성분이면 아무 제품과도 1.0에 가까워진다.
    """
    return count >= floor


__all__ = [
    "METHODS",
    "build_vocab",
    "compute_idf",
    "build_matrix",
    "topk_cosine",
    "jaccard",
    "rbo",
    "shared_top",
    "is_bundle",
    "min_ingredients",
]
