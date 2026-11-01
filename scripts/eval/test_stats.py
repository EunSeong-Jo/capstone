"""stats.py 검증 — 손으로 계산 가능한 값으로 확인한다. 실행: python3 scripts/eval/test_stats.py"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import stats  # noqa: E402


def close(a, b, tol=1e-3):
    assert abs(a - b) <= tol, f"{a} != {b}"


def test_wilson():
    # 알려진 값: 10/20 → (0.299, 0.701), 0/10 → 하한 0, 6/6 → 하한 약 0.610
    p, lo, hi = stats.wilson(10, 20)
    close(p, 0.5), close(lo, 0.2993), close(hi, 0.7007)
    p, lo, hi = stats.wilson(0, 10)
    close(lo, 0.0), assert_true(hi > 0.2)
    p, lo, hi = stats.wilson(6, 6)
    close(lo, 0.6097), close(hi, 1.0)
    assert math.isnan(stats.wilson(0, 0)[0])


def assert_true(c):
    assert c


def test_kappa():
    close(stats.cohen_kappa([0, 1, 0, 1], [0, 1, 0, 1]), 1.0)
    close(stats.cohen_kappa([0, 0, 1, 1], [1, 1, 0, 0]), -1.0)
    # 교과서 예: 관측일치 .7, 우연일치 .5 → kappa .4
    x = [1] * 20 + [1] * 5 + [0] * 10 + [0] * 15
    y = [1] * 20 + [0] * 5 + [1] * 10 + [0] * 15
    close(stats.cohen_kappa(x, y), 0.4, 0.01)
    # 가중 kappa 는 인접 등급 불일치에 덜 엄하다
    a, b = [0, 1, 2, 0, 1, 2], [1, 2, 2, 0, 1, 1]
    assert stats.cohen_kappa(a, b, "quadratic") > stats.cohen_kappa(a, b)


def test_ndcg():
    close(stats.ndcg([2, 1, 0], [2, 1, 0], 10), 1.0)
    assert stats.ndcg([0, 1, 2], [2, 1, 0], 10) < 1.0
    assert math.isnan(stats.ndcg([0, 0], [0, 0], 10))


def test_auroc():
    close(stats.auroc([0.9, 0.8], [0.1, 0.2]), 1.0)
    close(stats.auroc([0.1], [0.9]), 0.0)
    close(stats.auroc([0.5], [0.5]), 0.5)


def test_bootstrap_reproducible_and_covering():
    vals = [1.0] * 30 + [0.0] * 30
    a = stats.bootstrap_ci(vals, n_boot=2000, seed=1)
    b = stats.bootstrap_ci(vals, n_boot=2000, seed=1)
    assert a == b                               # 같은 seed → 같은 결과
    assert a[1] < 0.5 < a[2]                    # 구간이 참값을 덮는다
    r = stats.paired_bootstrap([1.0] * 40, [0.0] * 40, n_boot=500, seed=1)
    close(r["diff"], 1.0), assert_true(r["p_le0"] == 0.0)
    r = stats.paired_bootstrap([0.5, 0.4, 0.6] * 10, [0.5, 0.4, 0.6] * 10, n_boot=500, seed=1)
    assert r["lo"] <= 0 <= r["hi"]              # 차이 없음 → 구간이 0 포함


def test_paired_bootstrap_empty():
    r = stats.paired_bootstrap([], [], n_boot=10)     # 연기 테스트에서 ZeroDivisionError 로 발견됨
    assert r["n"] == 0 and math.isnan(r["diff"])


def test_percentile_confusion():
    close(stats.percentile([1, 2, 3, 4], 50), 2.5)
    c = stats.confusion(["a", "a", "b"], ["a", "b", "b"])
    assert c["matrix"] == [[1, 1], [0, 1]]


if __name__ == "__main__":
    n = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            n += 1
            print("ok", name)
    print(f"{n} tests passed")
