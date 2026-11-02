"""평가 공통 통계 — 신뢰구간·일치도·순위 지표.

외부 라이브러리 없이 표준 라이브러리만 쓴다(평가 스크립트가 어느 환경에서든 돌도록).
모든 무작위 함수는 seed를 받아 재현된다.
"""
from __future__ import annotations

import math
import random
from collections import Counter
from typing import Callable, Sequence

Z95 = 1.959963984540054


def wilson(k: int, n: int, z: float = Z95) -> tuple[float, float, float]:
    """비율 k/n 의 Wilson 구간. (점추정, 하한, 상한). n=0 이면 (nan, 0, 1)."""
    if n <= 0:
        return (float("nan"), 0.0, 1.0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (p, max(0.0, c - h), min(1.0, c + h))


def bootstrap_ci(
    values: Sequence[float],
    stat: Callable[[Sequence[float]], float] | None = None,
    n_boot: int = 5000,
    seed: int = 20261101,
    alpha: float = 0.05,
) -> tuple[float, float, float]:
    """단위(시드·질문 등)를 다시 뽑는 percentile 부트스트랩. (점추정, 하한, 상한)."""
    stat = stat or (lambda v: sum(v) / len(v))
    vals = list(values)
    if not vals:
        return (float("nan"), float("nan"), float("nan"))
    rng = random.Random(seed)
    n = len(vals)
    boots = sorted(stat([vals[rng.randrange(n)] for _ in range(n)]) for _ in range(n_boot))
    lo = boots[int((alpha / 2) * n_boot)]
    hi = boots[min(n_boot - 1, int((1 - alpha / 2) * n_boot))]
    return (stat(vals), lo, hi)


def paired_bootstrap(
    a: Sequence[float], b: Sequence[float], n_boot: int = 5000, seed: int = 20261101
) -> dict:
    """같은 단위에서 잰 두 방식의 평균 차이(a-b)와 95% 구간, 단측 p(차이<=0).

    구간이 0을 포함하면 '차이가 있다고 말할 수 없다'로 읽는다.
    """
    if len(a) != len(b):
        raise ValueError("쌍체 비교는 길이가 같아야 합니다")
    diffs = [x - y for x, y in zip(a, b)]
    if not diffs:   # 비교할 쌍이 없으면(예: 모든 시드의 nDCG 가 정의 불가) 멈추지 않고 정의 불가로 돌려준다
        nan = float("nan")
        return {"diff": nan, "lo": nan, "hi": nan, "p_le0": nan, "n": 0}
    est, lo, hi = bootstrap_ci(diffs, n_boot=n_boot, seed=seed)
    rng = random.Random(seed + 1)
    n = len(diffs)
    le0 = sum(
        1 for _ in range(n_boot) if sum(diffs[rng.randrange(n)] for _ in range(n)) / n <= 0
    )
    return {"diff": est, "lo": lo, "hi": hi, "p_le0": le0 / n_boot, "n": n}


def cohen_kappa(x: Sequence, y: Sequence, weights: str | None = None) -> float:
    """Cohen's kappa. weights=None|'linear'|'quadratic' (순서형 등급에서 가중)."""
    if len(x) != len(y) or not x:
        raise ValueError("같은 길이의 비어 있지 않은 목록이 필요합니다")
    cats = sorted(set(x) | set(y))
    idx = {c: i for i, c in enumerate(cats)}
    k, n = len(cats), len(x)
    obs = [[0.0] * k for _ in range(k)]
    for a, b in zip(x, y):
        obs[idx[a]][idx[b]] += 1
    row = [sum(r) for r in obs]
    col = [sum(obs[i][j] for i in range(k)) for j in range(k)]

    def w(i: int, j: int) -> float:
        if weights is None:
            return 0.0 if i == j else 1.0
        d = abs(i - j) / max(1, k - 1)
        return d if weights == "linear" else d * d

    num = sum(w(i, j) * obs[i][j] / n for i in range(k) for j in range(k))
    den = sum(w(i, j) * row[i] * col[j] / (n * n) for i in range(k) for j in range(k))
    if den == 0:
        return 1.0 if num == 0 else 0.0
    return 1.0 - num / den


def confusion(truth: Sequence, pred: Sequence, labels: Sequence | None = None) -> dict:
    labels = list(labels) if labels is not None else sorted(set(truth) | set(pred))
    c = Counter(zip(truth, pred))
    return {"labels": labels, "matrix": [[c[(t, p)] for p in labels] for t in labels]}


def dcg(grades: Sequence[float], k: int) -> float:
    return sum((2**g - 1) / math.log2(i + 2) for i, g in enumerate(list(grades)[:k]))


def ndcg(ranked_grades: Sequence[float], all_grades: Sequence[float], k: int = 10) -> float:
    """ranked_grades: 방식이 낸 순서의 등급, all_grades: 그 시드에서 판정된 모든 등급(이상적 순서 계산용)."""
    ideal = dcg(sorted(all_grades, reverse=True), k)
    return dcg(ranked_grades, k) / ideal if ideal > 0 else float("nan")


def auroc(pos: Sequence[float], neg: Sequence[float]) -> float:
    """정답(pos) 점수가 음성(neg) 점수보다 높을 확률. 동점은 0.5."""
    if not pos or not neg:
        return float("nan")
    s = 0.0
    for p in pos:
        for q in neg:
            s += 1.0 if p > q else 0.5 if p == q else 0.0
    return s / (len(pos) * len(neg))


def percentile(values: Sequence[float], q: float) -> float:
    """선형 보간 백분위(q: 0~100)."""
    v = sorted(values)
    if not v:
        return float("nan")
    pos = (len(v) - 1) * q / 100
    lo, hi = math.floor(pos), math.ceil(pos)
    return v[lo] + (v[hi] - v[lo]) * (pos - lo)
