"""레벨·경험치 (Task 11 캐릭터).

**기록에서 계산한다.** 클라이언트가 행동할 때마다 더해 나가는 방식이었는데,
그러면 값이 브라우저 localStorage에만 쌓여 기기를 바꾸면 0부터 다시
시작하고, 콘솔에서 고쳐도 서버는 모른다.

지금은 근거가 되는 행동이 전부 테이블에 있다(`scan_results`·`reviews`·
`orders`·`gifts`). 세기만 하면 되므로 별도 컬럼도 필요 없고, 과거에 한
행동까지 소급해서 반영된다.

정수만 다룬다 — 경험치에 소수점이 생길 이유가 없다.
"""
from __future__ import annotations

# 행동별 경험치. 손이 많이 가는 일일수록 크게 준다.
EXP_PER_SCAN = 10
EXP_PER_REVIEW = 20
EXP_PER_GIFT = 20
EXP_PER_ORDER = 50

# Lv.N → Lv.N+1 에 N * LEVEL_STEP 만큼 필요하다. 레벨이 오를수록 느려진다.
LEVEL_STEP = 100


def total_exp(*, scans: int, reviews: int, orders: int, gifts: int) -> int:
    return (
        scans * EXP_PER_SCAN
        + reviews * EXP_PER_REVIEW
        + orders * EXP_PER_ORDER
        + gifts * EXP_PER_GIFT
    )


def level_of(exp: int) -> tuple[int, int, int]:
    """경험치 → (레벨, 이번 레벨 안에서의 경험치, 다음 레벨까지의 폭).

    Lv.1은 0부터다. Lv.L에 도달하는 누적 경험치는
    ``LEVEL_STEP * (L-1) * L / 2`` 이다 — 100, 300, 600, 1000 …

    레벨 수에 상한을 두지 않았다. 지금 경험치가 붙는 행동은 손으로 하는
    것들이라 현실적인 범위에서 몇 번 돌지 않는다.
    """
    exp = max(0, exp)
    level = 1
    consumed = 0
    while True:
        span = level * LEVEL_STEP
        if exp - consumed < span:
            return level, exp - consumed, span
        consumed += span
        level += 1
