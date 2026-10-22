"""성분 유사도 계산 (Task 3).

DB를 모른다. 자료구조만 받아 숫자를 돌려준다 — 테스트를 공용 Neon에 붙이지
않기 위해서다(backend/tests/conftest.py는 실 DB에 접속한다).
적재는 scripts/compute_similarities.py, 조회는 app/api/recommendations.py.

방식
----
전성분에서 상위 6종이 사실상 모든 제품에 들어 있다.

    글리세린 85% · 정제수 84% · 1,2-헥산다이올 81%
    부틸렌글라이콜 80% · 에틸헥실글리세린 66% · 소듐하이알루로네이트 51%

그래서 단순 교집합만 쓰면 아무 두 제품이나 비슷해 보인다. IDF로 가중해야
판테놀·나이아신아마이드·마데카소사이드 같은 변별 성분이 점수를 지배한다.

  tfidf   IDF 가중 코사인. 라벨이 없는 환경의 기준선이자 hybrid 미적재 시 대체.
  hybrid  tfidf에 성분 기능 라벨(역할·기능)을 더한 기본 방식. 아래 절 참고.

jaccard(단순 교집합)와 rbo(표기 순서)는 gold 평가(scripts/eval_similarity.py,
시드 30·판정 245)에서 nDCG@10 0.603 / 0.344로 tfidf 0.734보다 낮아 제거했다.
결과는 docs/similarity.md.
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

METHODS = ("tfidf", "hybrid")


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


# ---------------------------------------------------------------------------
# hybrid — 성분 기능 라벨(ingredient_functions)을 쓰는 유사도
#
# tfidf의 한계: 존재 여부만 보고 기능을 모른다. 꼬리 성분(향료·식물추출물)이
# IDF 때문에 벡터를 지배하고, 같은 보습 성분이라도 종류가 다르면 겹침이 0이다.
# 그래서 두 신호를 섞는다.
#   ① 역할 가중 tfidf  — 활성·에몰리언트 성분을 크게, 베이스(용매·계면활성·점증·방부)
#                         와 오염 이름은 작게/0으로 본 성분 일치도
#   ② 기능 프로필 코사인 — 제품이 어떤 기능(보습·진정·미백…)을 얼마나 갖는지의 분포
# 라벨 없는 성분은 ①에서 UNLABELED_WEIGHT로만 기여하고 ②에는 들어가지 않는다.
# ---------------------------------------------------------------------------

# (functions, role, flags, confidence) — scripts/seed_ingredient_functions.py 어휘
Label = tuple[str, str, str, int]

FUNC_ORDER = "HBSWAOPEU"
FUNC_NAMES = {
    "H": "보습", "B": "장벽", "S": "진정", "W": "미백", "A": "주름·탄력",
    "O": "항산화", "P": "피지·모공", "E": "각질·클렌징", "U": "자외선차단",
}
# 프로필 차원: 기능 9 + 제형 성격을 보여 주는 역할 3(에몰리언트·계면활성·점증)
_PROFILE_ROLES = "eft"
# 자외선 차단제 유형: 무기(징크옥사이드·티타늄디옥사이드)와 유기(그 밖의 U 성분).
# 같은 선케어라도 무기자차와 유기자차는 사용감·자극이 달라 대체품이 못 된다.
_UV_DIMS = 2
PROFILE_DIMS = len(FUNC_ORDER) + len(_PROFILE_ROLES) + _UV_DIMS

ROLE_WEIGHT = {
    "a": 1.0, "e": 0.6, "x": 0.35, "f": 0.25, "t": 0.25, "s": 0.2, "p": 0.2, "j": 0.0,
}
UNLABELED_WEIGHT = 0.6
# 기능 프로필에서 역할이 기여하는 정도(활성이 주, 베이스는 거의 0)
PROFILE_ROLE_WEIGHT = {"a": 1.0, "e": 0.5, "x": 0.15, "f": 0.05, "t": 0.05, "s": 0.05, "p": 0.0, "j": 0.0}
# 확신도 1은 검수 대상이라 기능 근거에서 뺀다
MIN_CONFIDENCE = 2
# 앞 성분일수록(함량이 많을수록) 크게. 15번째에서 0.5
POSITION_HALF = 15.0

DEFAULT_ALPHA = 0.65   # 역할 가중 tfidf
DEFAULT_BETA = 0.35    # 기능 프로필
DEFAULT_GAMMA = 0.20   # 제형 일치 (gold 평가에서 nDCG@10 0.68 → 0.80)
# 변형을 접고 나서 k개를 채우려면 넉넉히 뽑아야 한다
DEDUPE_POOL = 60


def column_weights(vocab: dict[int, int], labels: dict[int, Label]) -> np.ndarray:
    """vocab 열 순서의 성분별 가중(역할 기반). 오염 이름은 0."""
    w = np.full(len(vocab), UNLABELED_WEIGHT, dtype=np.float64)
    for ing, col in vocab.items():
        lab = labels.get(ing)
        if lab is not None:
            w[col] = ROLE_WEIGHT.get(lab[1], UNLABELED_WEIGHT)
    return w


def build_role_matrix(
    docs: list[Doc], vocab: dict[int, int], idf: np.ndarray, labels: dict[int, Label]
) -> csr_matrix:
    """역할 가중을 곱한 IDF로 만든 L2 정규화 행렬."""
    return build_matrix(docs, vocab, idf * column_weights(vocab, labels))


def function_profile(
    doc: Doc, labels: dict[int, Label], inorganic_uv: frozenset[int] | set[int] = frozenset()
) -> np.ndarray:
    """제품 하나의 기능 분포 벡터(L2 정규화 전). 길이 PROFILE_DIMS."""
    vec = np.zeros(PROFILE_DIMS, dtype=np.float64)
    for pos, ing in enumerate(doc):
        lab = labels.get(ing)
        if lab is None:
            continue
        funcs, role, _flags, conf = lab
        if conf < MIN_CONFIDENCE:
            continue
        w = PROFILE_ROLE_WEIGHT.get(role, 0.0) / (1.0 + pos / POSITION_HALF)
        if w <= 0:
            continue
        for f in funcs:
            k = FUNC_ORDER.find(f)
            if k >= 0:
                vec[k] += w
        r = _PROFILE_ROLES.find(role)
        if r >= 0:
            vec[len(FUNC_ORDER) + r] += w
        if "U" in funcs:
            vec[len(FUNC_ORDER) + len(_PROFILE_ROLES) + (0 if ing in inorganic_uv else 1)] += w
    return vec


def build_profile_matrix(
    docs: list[Doc], labels: dict[int, Label],
    inorganic_uv: frozenset[int] | set[int] = frozenset(),
) -> csr_matrix:
    """기능 프로필 행렬. 제곱근으로 눌러 한 기능이 지배하지 않게 한 뒤 L2 정규화."""
    m = np.vstack([function_profile(d, labels, inorganic_uv) for d in docs]) if docs else np.zeros((0, PROFILE_DIMS))
    m = np.sqrt(m)
    norms = np.linalg.norm(m, axis=1, keepdims=True)
    np.divide(m, norms, out=m, where=norms > 0)
    return csr_matrix(m)


def topk_blend(
    parts: list[tuple[csr_matrix, float]], k: int, block: int = 512
) -> tuple[np.ndarray, np.ndarray]:
    """여러 코사인의 가중합 상위 k (자기 제외). 가중치 합이 1이면 점수는 0~1."""
    n = parts[0][0].shape[0]
    k = max(0, min(k, n - 1))
    idx_out = np.full((n, k), -1, dtype=np.int64)
    score_out = np.zeros((n, k), dtype=np.float64)
    if k == 0:
        return idx_out, score_out
    ts = [(m, m.T.tocsc(), w) for m, w in parts]
    for start in range(0, n, block):
        stop = min(start + block, n)
        sim = np.zeros((stop - start, n), dtype=np.float64)
        for m, mt, w in ts:
            sim += w * (m[start:stop] @ mt).toarray()
        sim[np.arange(stop - start), np.arange(start, stop)] = -1.0
        part = np.argpartition(-sim, kth=k - 1, axis=1)[:, :k]
        ps = np.take_along_axis(sim, part, axis=1)
        order = np.argsort(-ps, axis=1)
        idx_out[start:stop] = np.take_along_axis(part, order, axis=1)
        score_out[start:stop] = np.take_along_axis(ps, order, axis=1)
    idx_out[score_out <= 0.0] = -1
    score_out[score_out <= 0.0] = 0.0
    np.clip(score_out, 0.0, 1.0, out=score_out)
    return idx_out, score_out


def hybrid_topk(
    docs: list[Doc],
    names: list[str],
    vocab: dict[int, int],
    idf: np.ndarray,
    labels: dict[int, Label],
    k: int,
    alpha: float = DEFAULT_ALPHA,
    beta: float = DEFAULT_BETA,
    gamma: float = DEFAULT_GAMMA,
    inorganic_uv: frozenset[int] | set[int] = frozenset(),
    dedupe: bool = True,
) -> tuple[np.ndarray, np.ndarray]:
    """hybrid 상위 k. 배치와 평가가 같은 경로를 쓰도록 한곳에 둔다."""
    parts = [
        (build_role_matrix(docs, vocab, idf, labels), alpha),
        (build_profile_matrix(docs, labels, inorganic_uv), beta),
    ]
    if gamma > 0:
        parts.append((build_form_matrix([detect_form(n) for n in names]), gamma))
    total = sum(w for _, w in parts)
    parts = [(m, w / total) for m, w in parts]
    idx, score = topk_blend(parts, k=DEDUPE_POOL if dedupe else k)
    if dedupe:
        idx, score = dedupe_topk(idx, score, names, docs, k)
    return idx, score


# 성분 전문가(AI)가 직접 판정한 쌍의 점수 보정. 판정 0=대체 불가는 크게 내리고
# 2=대체 가능은 올린다. 판정은 일부 제품(조회가 많은 제품과 평가 시드)에만 있다.
CURATED_DELTA = {0: -0.15, 1: 0.0, 2: 0.10}


def apply_curated(
    idx: np.ndarray,
    score: np.ndarray,
    ids: list[int],
    curated: dict[tuple[int, int], int],
    k: int,
) -> tuple[np.ndarray, np.ndarray]:
    """판정이 있는 쌍의 점수를 보정하고 다시 정렬해 상위 k만 남긴다.

    쌍의 유사도는 대칭이므로 (a, b) 판정은 (b, a)에도 적용한다. 판정이 없는 쌍은 그대로다.
    """
    n, width = idx.shape
    out_i = np.full((n, k), -1, dtype=np.int64)
    out_s = np.zeros((n, k), dtype=np.float64)
    for i in range(n):
        rows = []
        for j, sc in zip(idx[i], score[i]):
            if j < 0:
                continue
            g = curated.get((ids[i], ids[j]))
            if g is None:
                g = curated.get((ids[j], ids[i]))
            adj = sc + CURATED_DELTA.get(g, 0.0) if g is not None else sc
            rows.append((min(1.0, max(0.0, adj)), int(j)))
        rows.sort(key=lambda x: (-x[0], ids[x[1]]))
        rows = [r for r in rows if r[0] > 0][:k]
        for c, (sc, j) in enumerate(rows):
            out_i[i, c], out_s[i, c] = j, sc
    return out_i, out_s


def shared_functions(a: Doc, b: Doc, labels: dict[int, Label], limit: int = 4) -> list[str]:
    """두 제품이 함께 가진 기능(한글). 양쪽 모두 활성/에몰리언트 근거가 있는 기능만."""
    def active(doc: Doc) -> dict[str, float]:
        out: dict[str, float] = {}
        for pos, ing in enumerate(doc):
            lab = labels.get(ing)
            if lab is None or lab[3] < MIN_CONFIDENCE or lab[1] not in "ae":
                continue
            for f in lab[0]:
                out[f] = out.get(f, 0.0) + 1.0 / (1.0 + pos / POSITION_HALF)
        return out
    fa, fb = active(a), active(b)
    common = [f for f in fa if f in fb and f in FUNC_NAMES]
    common.sort(key=lambda f: -min(fa[f], fb[f]))
    return [FUNC_NAMES[f] for f in common[:limit]]


# ---------------------------------------------------------------------------
# 제형(사용 형태)과 같은 제품의 변형
#
# 성분이 비슷해도 스틱과 크림, 오일과 폼은 서로의 대체품이 못 된다. 판정 풀에서
# 이 불일치가 가장 흔한 0점 원인이었다. 이름 키워드로 제형을 뽑아 일치할 때
# 점수를 올린다(알 수 없으면 중립). 같은 제품의 용량·매수 변형은 후보 자리를
# 여럿 차지해 다양성을 가리므로 하나로 접는다.
# ---------------------------------------------------------------------------

_FORM_RULES: list[tuple[str, str]] = [
    ("스틱", r"스틱|선밤|stick"),
    ("쿠션", r"쿠션|팩트|파우더"),
    ("패드", r"패드|pad|티슈"),
    ("시트", r"시트|마스크|하이드로겔|겔\s*마스크|필름|패치"),
    ("워시오프팩", r"클레이|머드|워시오프|코팩|슬리핑|필오프|랩핑|팩\b"),
    ("워터", r"클렌징\s*워터|미셀라|리무버|H2O"),
    ("밀크", r"클렌징\s*밀크|클렌징\s*로션"),
    ("오일", r"오일(?!\s*(?:투|to))"),
    ("밤", r"클렌징\s*밤|오일밤|밤\b|버터"),
    ("폼", r"폼|거품|버블|무스|워시|워싱|비누|세안|클렌저"),
    ("미스트", r"미스트|스프레이"),
    ("앰플세럼", r"앰플|세럼|에센스|부스터|serum|ampoule|컨센트레이트|드롭|원액"),
    ("토너", r"토너|스킨|워터|화장수|토닉|스웹|스왑"),
    ("로션", r"로션|에멀전|에멀젼|유액|emulsion|lotion"),
    ("크림", r"크림|cream"),
    ("젤", r"젤(?!리)|gel"),
    ("선", r"선"),
]
_FORM_RX = [(f, re.compile(rx, re.I)) for f, rx in _FORM_RULES]
FORMS = [f for f, _ in _FORM_RULES]


def detect_form(name: str) -> str | None:
    """제품명에서 제형. 앞 규칙이 우선한다. 못 찾으면 None(중립)."""
    for form, rx in _FORM_RX:
        if rx.search(name):
            return form
    return None


def build_form_matrix(forms: list[str | None]) -> csr_matrix:
    """제형 원-핫 행렬. 제형을 모르는 행은 0벡터라 점수에 기여하지 않는다."""
    rows, cols = [], []
    for i, f in enumerate(forms):
        if f is not None:
            rows.append(i)
            cols.append(FORMS.index(f))
    return csr_matrix(
        (np.ones(len(rows)), (rows, cols)), shape=(len(forms), len(FORMS)), dtype=np.float64
    )


_VOLUME = re.compile(
    r"[\s(\[]*\d+(?:\.\d+)?\s*(?:ml|mL|ML|g|G|l|L|매입?|ea|EA|개입?|입|정|p|P|호)\b[^,]*$|"
    r"\([^)]*(?:매|ml|mL|g|입|ea)[^)]*\)|리필|기획|단품|\d+\s*(?:개|입|세트)|\*",
)


def variant_body(name: str) -> str:
    """용량·매수·리필 표기를 뗀 제품명 몸통. 같은 제품의 변형끼리 같은 값이 된다."""
    prev = None
    out = name
    while prev != out:
        prev = out
        out = _VOLUME.sub("", out)
    return re.sub(r"\s+", "", out).lower()


def variant_keys(name: str, doc: Doc) -> tuple[str, tuple[str, frozenset[int]]]:
    """(이름 몸통, (브랜드 추정, 성분 집합)). 둘 중 하나라도 같으면 같은 제품의 변형."""
    first = re.sub(r"\s+", " ", name.strip()).split(" ")[0].lower() if name.strip() else ""
    return variant_body(name), (first, frozenset(doc))


def dedupe_topk(
    idx: np.ndarray,
    score: np.ndarray,
    names: list[str],
    docs: list[Doc],
    k: int,
    seed_variants_max: int = 3,
) -> tuple[np.ndarray, np.ndarray]:
    """후보에서 같은 제품의 변형을 접고 상위 k만 남긴다(점수 내림차순 유지).

    기준 제품의 변형(용량만 다른 같은 제품)은 프론트가 '다른 용량'으로 따로 보여 주므로
    최대 seed_variants_max개까지는 남기고, 그 밖의 후보는 변형 그룹마다 최고점 하나만 둔다.
    """
    n, width = idx.shape
    keys = [variant_keys(names[i], docs[i]) for i in range(n)]
    out_i = np.full((n, k), -1, dtype=np.int64)
    out_s = np.zeros((n, k), dtype=np.float64)
    for i in range(n):
        seed_body, (seed_brand, seed_set) = keys[i]
        seen_body: set[str] = set()
        seen_set: set[tuple[str, frozenset[int]]] = set()
        seed_kept = 0
        c = 0
        for j, sc in zip(idx[i], score[i]):
            if j < 0 or c >= k:
                continue
            body, bs = keys[j]
            is_seed_variant = body == seed_body or bs == (seed_brand, seed_set)
            if is_seed_variant:
                if seed_kept >= seed_variants_max:
                    continue
                seed_kept += 1
            else:
                if body in seen_body or bs in seen_set:
                    continue
                seen_body.add(body)
                seen_set.add(bs)
            out_i[i, c], out_s[i, c] = j, sc
            c += 1
    return out_i, out_s


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
    "shared_top",
    "Label",
    "FUNC_NAMES",
    "column_weights",
    "build_role_matrix",
    "function_profile",
    "build_profile_matrix",
    "topk_blend",
    "shared_functions",
    "detect_form",
    "build_form_matrix",
    "variant_body",
    "variant_keys",
    "dedupe_topk",
    "hybrid_topk",
    "apply_curated",
    "CURATED_DELTA",
    "DEFAULT_GAMMA",
    "FORMS",
    "DEFAULT_ALPHA",
    "DEFAULT_BETA",
    "is_bundle",
    "min_ingredients",
]
