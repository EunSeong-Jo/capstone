"""피부타입 진단 API (Task 13.6·13.7).

    GET  /api/v1/profile/skin-quiz/questions   활성 버전 문항
    POST /api/v1/profile/skin-quiz             응답 제출 → 결과 저장
    GET  /api/v1/profile/skin-quiz/latest      내 최신 진단

로그인은 **선택**이다. PRD의 Soft-gate 정책상 비회원도 진단을 끝까지 할 수
있어야 하고, 그 결과는 `diagnoses.guest_token`으로 남았다가 가입 시 계정에
붙는다. 컬럼이 처음부터 그 용도로 설계돼 있다.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.diagnosis import (
    Diagnosis,
    DiagnosisRank,
    QuizOption,
    QuizQuestion,
    QuizVersion,
)
from app.models.user import Profile, User
from app.schemas.diagnosis import (
    DiagnosisIn,
    DiagnosisOut,
    QuizOptionOut,
    QuizOut,
    QuizQuestionOut,
    RankOut,
)
from app.services.diagnosis import is_borderline, rank_types, score_answers

router = APIRouter(prefix="/api/v1/profile/skin-quiz", tags=["diagnosis"])


async def _active_version(db: AsyncSession) -> QuizVersion:
    version = await db.scalar(
        select(QuizVersion)
        .where(QuizVersion.is_active.is_(True))
        .order_by(QuizVersion.created_at.desc())
    )
    if version is None:
        # 문항이 없으면 진단을 할 수 없다. 빈 문항을 내보내 화면이 조용히
        # 빈 화면을 그리게 두지 않는다.
        raise HTTPException(
            status_code=503, detail="진단 문항이 준비되지 않았습니다"
        )
    return version


@router.get("/questions", response_model=QuizOut, summary="진단 문항")
async def read_questions(db: AsyncSession = Depends(get_db)) -> QuizOut:
    version = await _active_version(db)
    questions = list(
        await db.scalars(
            select(QuizQuestion)
            .where(QuizQuestion.version_id == version.id)
            .order_by(QuizQuestion.order_no)
            .options(selectinload(QuizQuestion.options))
        )
    )
    return QuizOut(
        version=version.label,
        questions=[
            QuizQuestionOut(
                code=q.code,
                axis=q.axis,
                body=q.body,
                order_no=q.order_no,
                options=[
                    QuizOptionOut(order_no=o.order_no, label=o.label)
                    for o in sorted(q.options, key=lambda x: x.order_no)
                ],
            )
            for q in questions
        ],
    )


def _to_out(diagnosis: Diagnosis, ranks: list[DiagnosisRank]) -> DiagnosisOut:
    ordered = sorted(ranks, key=lambda r: r.rank)
    as_dicts = [{"rank": r.rank, "skin_type": r.skin_type, "score": r.score} for r in ordered]
    return DiagnosisOut(
        id=diagnosis.id,
        skin_type=ordered[0].skin_type if ordered else "",
        scores=diagnosis.scores,
        ranks=[RankOut(rank=r.rank, skin_type=r.skin_type, score=r.score) for r in ordered],
        borderline=is_borderline(as_dicts),
        created_at=diagnosis.created_at,
    )


@router.post("", response_model=DiagnosisOut, status_code=201, summary="진단 제출")
async def submit(
    body: DiagnosisIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DiagnosisOut:
    """진단은 **로그인 이후에만** 할 수 있다.

    예전에는 비회원도 `guestToken`을 붙여 제출하고 나중에 계정에 붙이는
    Soft-gate였다. 그런데 토큰이 생기기 전에 저장된 게스트 진단이 주인을
    찾지 못한 채 브라우저에 남아, 둘러보기만 한 사람에게 "당신은 수부지"가
    계속 보이는 일이 있었다. 결과를 누구 것인지 확실히 할 수 없는 기록은
    만들지 않는다.
    """
    if not body.answers:
        raise HTTPException(status_code=422, detail="응답이 비어 있습니다")

    version = await _active_version(db)

    # 채점 가중치는 DB에서 읽는다. 문항이 바뀌어도 코드를 고치지 않는다.
    rows = await db.execute(
        select(QuizQuestion.code, QuizOption.order_no, QuizOption.weights)
        .join(QuizOption, QuizOption.question_id == QuizQuestion.id)
        .where(QuizQuestion.version_id == version.id)
    )
    weights = {(code, order_no): w for code, order_no, w in rows}

    scores = score_answers(body.answers, weights)
    ranks = rank_types(scores)

    diagnosis = Diagnosis(
        user_id=user.id,
        guest_token=None,
        version_id=version.id,
        answers=body.answers,
        scores=scores,
    )
    db.add(diagnosis)
    await db.flush()

    rank_rows = [
        DiagnosisRank(
            diagnosis_id=diagnosis.id,
            rank=r["rank"],
            skin_type=r["skin_type"],
            score=r["score"],
        )
        for r in ranks
    ]
    db.add_all(rank_rows)

    # profiles.skin_type은 최신 1순위를 복사해 둔 캐시다(모델 주석 참고).
    # 매 요청마다 diagnoses를 조회하지 않기 위한 것이다.
    profile = await db.scalar(select(Profile).where(Profile.user_id == user.id))
    if profile is None:
        profile = Profile(user_id=user.id)
        db.add(profile)
    profile.skin_type = ranks[0]["skin_type"]
    profile.scores = scores

    await db.commit()
    await db.refresh(diagnosis)
    return _to_out(diagnosis, rank_rows)


@router.get("/latest", response_model=DiagnosisOut, summary="내 최신 진단")
async def latest(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DiagnosisOut:
    diagnosis = await db.scalar(
        select(Diagnosis)
        .where(Diagnosis.user_id == user.id)
        .order_by(Diagnosis.created_at.desc())
        .options(selectinload(Diagnosis.ranks))
    )
    if diagnosis is None:
        raise HTTPException(status_code=404, detail="진단 기록이 없습니다")
    return _to_out(diagnosis, diagnosis.ranks)
