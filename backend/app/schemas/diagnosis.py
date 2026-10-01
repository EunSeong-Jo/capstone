"""진단 스키마 (Task 13.6·13.7)."""
from __future__ import annotations

from datetime import datetime

from app.schemas.product import _CamelModel


class QuizOptionOut(_CamelModel):
    """선택지. **weights는 내보내지 않는다** — 채점 기준을 알면 원하는 결과를
    만들어 낼 수 있고, 그러면 진단 자체가 의미를 잃는다."""

    order_no: int
    label: str


class QuizQuestionOut(_CamelModel):
    code: str
    axis: str
    body: str
    order_no: int
    options: list[QuizOptionOut]


class QuizOut(_CamelModel):
    version: str
    questions: list[QuizQuestionOut]


class DiagnosisIn(_CamelModel):
    """응답. {문항 code: 선택지 order_no}.

    진단은 로그인 이후에만 할 수 있다. 예전에는 비회원도 `guestToken`을
    붙여 제출하고 나중에 계정에 붙이는 Soft-gate였는데, 주인을 찾지 못한
    게스트 진단이 남는 문제가 있어 걷어냈다.
    """

    answers: dict[str, int]


class RankOut(_CamelModel):
    rank: int
    skin_type: str
    # 상위 3개 안에서의 근사도 비중(합이 1). 화면이 백분율로 그린다.
    score: float


class DiagnosisOut(_CamelModel):
    id: int
    skin_type: str
    scores: dict[str, int]
    ranks: list[RankOut]
    # 1·2순위가 붙어 있으면 True. "OO에 가깝지만 XX 성향도 있어요".
    borderline: bool
    created_at: datetime
