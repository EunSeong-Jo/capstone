"""피부타입 진단 채점 (Task 13.4·13.5).

프론트 `src/data/skinTypeScoring.ts`의 로직을 그대로 옮긴 것이다. 같은 계산이
두 곳에 있는 셈인데, 의도한 것이다 — 비회원도 네트워크 없이 진단을 끝낼 수
있어야 하고(PRD의 Soft-gate), 서버는 그 결과를 검증·보관해야 한다.
**둘이 어긋나면 안 되므로 상수를 이 파일과 저 파일에만 둔다.**

5축은 모델과 같다: moisture / oil / sensitivity / pigmentation / trouble.

가중치는 DB에서 읽는다
----------------------
문항별 점수 변화량(DELTAS)은 `quiz_options.weights`에 들어 있다. 문항이
바뀌어도 코드를 고치지 않고 시드만 다시 돌리면 되고, `diagnoses.answers`에
원본 응답이 남아 있어 과거 진단을 재산정할 수도 있다.

반대로 8타입 프로필(PROFILES)은 코드에 둔다. 타입 정의 자체가 바뀌는 일은
문항이 바뀌는 것과 다른 층위의 변경이고, 바뀌면 과거 진단의 해석도 달라진다.
"""
from __future__ import annotations

import math

AXES = ("moisture", "oil", "sensitivity", "pigmentation", "trouble")

# 모든 축은 5에서 시작한다(0~10 스케일의 가운데). 응답하지 않은 문항은
# 아무것도 더하지 않으므로, 중간에 그만두면 '보통'에 가까운 결과가 나온다.
BASE_SCORE = 5
MIN_SCORE = 0
MAX_SCORE = 10

# 8타입 프로필 (5축, 0~10). frontend/src/data/skinTypeScoring.ts의 PROFILES와
# 값이 같아야 한다.
PROFILES: dict[str, dict[str, int]] = {
    "ondalsam":   {"moisture": 7, "oil": 5, "sensitivity": 3, "pigmentation": 3, "trouble": 2},
    "mulgae":     {"moisture": 5, "oil": 9, "sensitivity": 4, "pigmentation": 4, "trouble": 5},
    "subuji":     {"moisture": 3, "oil": 7, "sensitivity": 5, "pigmentation": 4, "trouble": 4},
    "hwasan":     {"moisture": 4, "oil": 7, "sensitivity": 6, "pigmentation": 5, "trouble": 9},
    "samak":      {"moisture": 1, "oil": 2, "sensitivity": 6, "pigmentation": 4, "trouble": 2},
    "injeolmi":   {"moisture": 4, "oil": 4, "sensitivity": 3, "pigmentation": 4, "trouble": 2},
    "yuriguseul": {"moisture": 4, "oil": 4, "sensitivity": 9, "pigmentation": 3, "trouble": 4},
    "memilmuk":   {"moisture": 4, "oil": 5, "sensitivity": 4, "pigmentation": 9, "trouble": 3},
}

SKIN_TYPES = frozenset(PROFILES)

# 몇 순위까지 낼 것인가. 이슈 #8의 "2·3순위 표시"가 이 값에서 온다.
RANK_COUNT = 3

# 1·2순위 근사도가 이 차이 안이면 '경계 타입'으로 본다. 화면이 "OO에
# 가깝지만 XX 성향도 있어요"라고 말할 근거다.
BORDERLINE_GAP = 0.03


def score_answers(
    answers: dict[str, int],
    weights_by_option: dict[tuple[str, int], dict[str, int]],
) -> dict[str, int]:
    """응답 → 5축 점수.

    answers는 {문항 code: 선택지 order_no}. weights_by_option은
    (문항 code, 선택지 order_no) → 축별 증감.
    """
    scores = {axis: BASE_SCORE for axis in AXES}
    for code, option_no in answers.items():
        delta = weights_by_option.get((code, option_no))
        if not delta:
            # 모르는 문항·선택지는 무시한다. 문항이 바뀐 뒤 옛 응답이
            # 들어오는 경우가 있고, 그걸 오류로 막으면 진단이 통째로 실패한다.
            continue
        for axis, amount in delta.items():
            if axis in scores:
                scores[axis] += amount

    return {axis: max(MIN_SCORE, min(MAX_SCORE, v)) for axis, v in scores.items()}


def blend_scores(
    qna: dict[str, int], photo: dict[str, int], weight: float
) -> dict[str, int]:
    """QnA 5축에 사진 5축을 `weight` 비중으로 섞는다 (0이면 QnA, 1이면 사진).

    사진을 쓰지 않은 진단은 이 함수를 거치지 않는다 — QnA 100%는 기존 경로 그대로다.
    사진에 없는 축은 QnA 값을 유지한다.
    """
    w = max(0.0, min(1.0, weight))
    return {
        axis: max(MIN_SCORE, min(MAX_SCORE, round((1 - w) * v + w * photo.get(axis, v))))
        for axis, v in qna.items()
    }


def rank_types(scores: dict[str, int]) -> list[dict]:
    """5축 점수 → 타입 순위.

    각 타입 프로필과의 유클리드 거리를 근사도 1/(1+d)로 바꾸고, 상위
    RANK_COUNT개를 합이 1이 되도록 정규화한다. 거리를 그대로 쓰지 않는 이유는
    화면이 "92%처럼 읽히는 값"을 원하기 때문이고, 정규화 대상을 상위 3개로
    한정하는 이유는 8개 전체로 나누면 1순위도 20%대로 떨어져 낮아 보이기
    때문이다.
    """
    affinity = []
    for skin_type, profile in PROFILES.items():
        distance = math.sqrt(sum((scores[a] - profile[a]) ** 2 for a in AXES))
        affinity.append((skin_type, 1 / (1 + distance)))

    affinity.sort(key=lambda x: x[1], reverse=True)
    top = affinity[:RANK_COUNT]
    total = sum(w for _, w in top) or 1

    return [
        {"rank": i + 1, "skin_type": t, "score": round(w / total, 2)}
        for i, (t, w) in enumerate(top)
    ]


def is_borderline(ranks: list[dict]) -> bool:
    """1·2순위가 붙어 있는가. 화면이 경계 타입을 안내할지 정하는 데 쓴다."""
    if len(ranks) < 2:
        return False
    return abs(ranks[0]["score"] - ranks[1]["score"]) <= BORDERLINE_GAP
