"""피부타입 진단 API 계약 테스트 (Task 13).

가장 중요한 불변식 둘.

  1. **채점 기준이 응답에 새지 않는다.** `quiz_options.weights`를 알면 원하는
     타입이 나오도록 답을 고를 수 있고, 그러면 진단 자체가 의미를 잃는다.
  2. **8타입 전부 도달 가능하다.** 어떤 타입이 어떤 응답으로도 안 나오면
     그 캐릭터는 존재하지 않는 것과 같다(Task 13.8).
"""
from __future__ import annotations

import itertools
import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import delete, select

from app.db.session import AsyncSessionLocal
from app.models.diagnosis import Diagnosis, QuizOption, QuizQuestion, QuizVersion
from app.models.user import User
from app.services.diagnosis import (
    PROFILES,
    blend_partial,
    rank_types,
    score_answers,
    touched_axes,
)

pytestmark = pytest.mark.asyncio(loop_scope="session")

QUIZ = "/api/v1/profile/skin-quiz"
AUTH = "/api/v1/auth"
PASSWORD = "swappy1234"


@pytest_asyncio.fixture(loop_scope="session")
async def codes(client: AsyncClient) -> list[str]:
    res = await client.get(f"{QUIZ}/questions")
    assert res.status_code == 200, "scripts/seed_quiz.py를 실행했는지 확인하세요"
    return [q["code"] for q in res.json()["questions"]]


@pytest_asyncio.fixture(loop_scope="session")
async def account(client: AsyncClient):
    email = f"pytest-{uuid.uuid4().hex[:12]}@example.com"
    res = await client.post(f"{AUTH}/signup", json={"email": email, "password": PASSWORD})
    assert res.status_code == 201
    yield {"headers": {"Authorization": f"Bearer {res.json()['accessToken']}"}}

    async with AsyncSessionLocal() as db:
        await db.execute(delete(User).where(User.email == email))
        await db.commit()


# ── 문항 ──────────────────────────────────────────────────────


async def test_questions_are_ordered_and_complete(client: AsyncClient) -> None:
    body = (await client.get(f"{QUIZ}/questions")).json()
    assert body["version"]
    questions = body["questions"]
    assert questions, "활성 버전에 문항이 있어야 한다"

    assert [q["orderNo"] for q in questions] == sorted(q["orderNo"] for q in questions)
    for q in questions:
        assert q["code"] and q["body"]
        # 축이 5개 중 하나여야 한다. 오타가 나면 채점에서 조용히 무시된다.
        assert q["axis"] in ("moisture", "oil", "sensitivity", "pigmentation", "trouble")
        assert len(q["options"]) >= 2
        assert [o["orderNo"] for o in q["options"]] == list(range(len(q["options"])))


async def test_questions_never_expose_weights(client: AsyncClient) -> None:
    """채점 기준이 새면 원하는 결과를 만들어 낼 수 있다."""
    body = (await client.get(f"{QUIZ}/questions")).json()
    for q in body["questions"]:
        for option in q["options"]:
            assert "weights" not in option
            assert set(option) == {"orderNo", "label"}


# ── 제출 ──────────────────────────────────────────────────────


async def test_submit_returns_ranks(
    client: AsyncClient, codes: list[str], account
) -> None:
    answers = {c: 0 for c in codes}
    res = await client.post(QUIZ, json={"answers": answers}, **account)
    assert res.status_code == 201

    body = res.json()
    assert body["skinType"] in PROFILES
    # 이슈 #8의 "2·3순위 표시"가 여기에 달려 있다.
    assert [r["rank"] for r in body["ranks"]] == [1, 2, 3]
    assert body["ranks"][0]["skinType"] == body["skinType"]
    # 상위 3개 안에서 정규화하므로 합이 1이다(반올림 오차 허용).
    assert abs(sum(r["score"] for r in body["ranks"]) - 1.0) < 0.02
    # 5축이 모두 0~10 범위에 있어야 한다.
    assert set(body["scores"]) == {"moisture", "oil", "sensitivity", "pigmentation", "trouble"}
    assert all(0 <= v <= 10 for v in body["scores"].values())


async def test_submit_rejects_empty_answers(client: AsyncClient, account) -> None:
    res = await client.post(QUIZ, json={"answers": {}}, **account)
    assert res.status_code == 422


async def test_submit_requires_login(client: AsyncClient, codes: list[str]) -> None:
    """진단은 로그인 이후에만 한다.

    예전에는 guestToken만 붙이면 비회원도 제출할 수 있었다(Soft-gate).
    그때 만들어진 주인 없는 진단이 브라우저에 남아, 둘러보기만 한 사람에게
    "당신은 수부지"가 계속 보이는 일이 있었다.
    """
    answers = {c: 0 for c in codes}
    assert (await client.post(QUIZ, json={"answers": answers})).status_code == 401
    # guestToken을 붙여도 마찬가지다 — 스키마가 그 필드를 더 받지 않는다.
    res = await client.post(QUIZ, json={"answers": answers, "guestToken": "deadbeef"})
    assert res.status_code == 401


async def test_unknown_answers_are_ignored_not_fatal(
    client: AsyncClient, account
) -> None:
    """문항이 바뀐 뒤 옛 응답이 들어올 수 있다. 오류로 막으면 진단이 통째로 실패한다."""
    res = await client.post(
        QUIZ, json={"answers": {"q999": 3}}, **account
    )
    assert res.status_code == 201
    # 아무것도 반영되지 않았으므로 전 축이 기본값이다.
    assert set(res.json()["scores"].values()) == {5}


async def test_logged_in_submit_updates_profile(
    client: AsyncClient, codes: list[str], account
) -> None:
    """profiles.skin_type은 최신 1순위를 복사해 둔 캐시다."""
    result = await client.post(QUIZ, json={"answers": {c: 0 for c in codes}}, **account)
    assert result.status_code == 201
    skin_type = result.json()["skinType"]

    profile = await client.get("/api/v1/me/profile", **account)
    assert profile.json()["skinType"] == skin_type

    me = await client.get("/api/v1/me", **account)
    assert me.json()["skinType"] == skin_type


async def test_latest_requires_login(client: AsyncClient) -> None:
    assert (await client.get(f"{QUIZ}/latest")).status_code == 401


async def test_latest_returns_most_recent(
    client: AsyncClient, codes: list[str], account
) -> None:
    await client.post(QUIZ, json={"answers": {c: 0 for c in codes}}, **account)
    second = await client.post(QUIZ, json={"answers": {c: 3 for c in codes}}, **account)

    latest = await client.get(f"{QUIZ}/latest", **account)
    assert latest.status_code == 200
    assert latest.json()["id"] == second.json()["id"]


async def test_latest_404_without_history(client: AsyncClient, account) -> None:
    fresh_email = f"pytest-{uuid.uuid4().hex[:12]}@example.com"
    signup = await client.post(
        f"{AUTH}/signup", json={"email": fresh_email, "password": PASSWORD}
    )
    headers = {"Authorization": f"Bearer {signup.json()['accessToken']}"}
    try:
        assert (await client.get(f"{QUIZ}/latest", headers=headers)).status_code == 404
    finally:
        async with AsyncSessionLocal() as db:
            await db.execute(delete(User).where(User.email == fresh_email))
            await db.commit()


# ── 채점 로직 (DB 불필요) ─────────────────────────────────────


async def test_every_skin_type_is_reachable() -> None:
    """**8타입 전부 도달 가능해야 한다** (Task 13.8).

    어떤 타입이 어떤 응답으로도 안 나오면 그 캐릭터는 존재하지 않는 것과
    같다. 프로필 값이나 문항 가중치를 바꾸면 이 테스트가 먼저 깨진다.
    """
    async with AsyncSessionLocal() as db:
        version = await db.scalar(
            select(QuizVersion).where(QuizVersion.is_active.is_(True))
        )
        assert version is not None
        rows = await db.execute(
            select(QuizQuestion.code, QuizOption.order_no, QuizOption.weights)
            .join(QuizOption, QuizOption.question_id == QuizQuestion.id)
            .where(QuizQuestion.version_id == version.id)
        )
        weights = {(code, no): w for code, no, w in rows}

    codes = sorted({code for code, _ in weights})
    option_counts = [
        max(no for c, no in weights if c == code) + 1 for code in codes
    ]

    reached = set()
    for combo in itertools.product(*(range(n) for n in option_counts)):
        answers = dict(zip(codes, combo))
        reached.add(rank_types(score_answers(answers, weights))[0]["skin_type"])

    missing = set(PROFILES) - reached
    assert not missing, f"어떤 응답으로도 나오지 않는 타입: {sorted(missing)}"


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
