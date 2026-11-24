"""피부타입 진단 API 계약 테스트 (Task 13).

이 파일은 **DB·Redis 없이 도는 쪽**(tests/unit)이다. DB가 필요한 테스트는 `tests/integration/test_diagnosis.py`에 있다.

가장 중요한 불변식 둘.

  1. **채점 기준이 응답에 새지 않는다.** `quiz_options.weights`를 알면 원하는
     타입이 나오도록 답을 고를 수 있고, 그러면 진단 자체가 의미를 잃는다.
  2. **8타입 전부 도달 가능하다.** 어떤 타입이 어떤 응답으로도 안 나오면
     그 캐릭터는 존재하지 않는 것과 같다(Task 13.8).
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient
from app.services.skin.diagnosis import blend_partial, score_answers, touched_axes

pytestmark = pytest.mark.asyncio(loop_scope="session")

QUIZ = "/api/v1/profile/skin-quiz"


async def test_latest_requires_login(client: AsyncClient) -> None:
    assert (await client.get(f"{QUIZ}/latest")).status_code == 401


async def test_scores_are_clamped() -> None:
    """한 축으로 몰아도 0~10을 벗어나지 않는다. 화면이 그 범위를 가정한다."""
    weights = {("q1", 0): {"oil": 99}, ("q2", 0): {"moisture": -99}}
    scores = score_answers({"q1": 0, "q2": 0}, weights)
    assert scores["oil"] == 10
    assert scores["moisture"] == 0


async def test_partial_blend_keeps_photo_values_on_untouched_axes() -> None:
    weights = {("q1", 0): {"oil": -2, "moisture": -3}, ("q2", 3): {"sensitivity": -2}}
    qna = score_answers({"q1": 0}, weights)             # 수분 2·유분 3, 나머지 5
    photo = {"moisture": 6, "oil": 3, "sensitivity": 1, "pigmentation": 1, "trouble": 3}

    touched = touched_axes({"q1": 0, "q9": 1}, weights)  # 모르는 문항은 무시
    assert touched == {"oil", "moisture"}

    out = blend_partial(qna, photo, touched, 0.5)
    assert out["moisture"] == round(0.5 * 2 + 0.5 * 6)
    assert out["oil"] == 3
    # 건드리지 않은 축은 QnA 기본값 5가 아니라 사진 값이다.
    assert (out["sensitivity"], out["pigmentation"], out["trouble"]) == (1, 1, 3)
    assert blend_partial(qna, photo, set(), 0.5) == photo
