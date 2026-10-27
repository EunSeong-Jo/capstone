"""피부타입 진단 API (Task 13.6·13.7).

    GET  /api/v1/profile/skin-quiz/questions   활성 버전 문항
    POST /api/v1/profile/skin-quiz             응답 제출 → 결과 저장
    GET  /api/v1/profile/skin-quiz/latest      내 최신 진단

진단은 로그인 이후에만 할 수 있다(`submit` 참고). 얼굴 사진 분석을 했다면 제출에
`analysisId`를 실어 점수에 섞을 수 있다 — 안 실으면 QnA 100%다.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.diagnosis import (
    Diagnosis,
    DiagnosisRank,
    QuizOption,
    QuizQuestion,
    QuizVersion,
)
from app.models.skin_photo import SkinAnalysis
from app.models.user import Profile, User
from app.schemas.diagnosis import (
    ChooseIn,
    DiagnosisIn,
    DiagnosisOut,
    QuizOptionOut,
    QuizOut,
    QuizQuestionOut,
    RankOut,
)
from app.services.diagnosis import (
    blend_partial,
    blend_scores,
    is_borderline,
    rank_types,
    score_answers,
    touched_axes,
)

router = APIRouter(prefix="/api/v1/profile/skin-quiz", tags=["diagnosis"])

# 사진 분석은 이 시간 안에 제출한 진단에만 섞는다. 오래된 분석이 새 QnA에 붙어
# 지금과 다른 피부 상태를 반영하는 것을 막는다.
ANALYSIS_MAX_AGE = timedelta(hours=1)


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
        photo_used=diagnosis.analysis_id is not None,
        photo_only=diagnosis.analysis_id is not None and not diagnosis.answers,
        answered_count=len(diagnosis.answers),
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
    if not body.answers and body.analysis_id is None:
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

    analysis_id = None
    if body.analysis_id is not None:
        analysis = await db.scalar(
            select(SkinAnalysis).where(
                SkinAnalysis.id == body.analysis_id, SkinAnalysis.user_id == user.id
            )
        )
        if analysis is None:
            raise HTTPException(status_code=422, detail="사진 분석 기록을 찾을 수 없어요")
        if datetime.now(timezone.utc) - analysis.created_at > ANALYSIS_MAX_AGE:
            raise HTTPException(
                status_code=422, detail="사진 분석이 오래됐어요. 다시 촬영하거나 건너뛰어 주세요"
            )
        photo = analysis.metrics["axes"]
        question_count = len({code for code, _ in weights})
        touched = touched_axes(body.answers, weights)
        if not touched:
            # 답한 문항이 없거나(사진만으로 진단) 점수에 닿는 문항이 하나도 없다.
            scores = dict(photo)
        elif len({c for c in body.answers if (c, body.answers[c]) in weights}) >= question_count:
            # 모든 문항에 답했다 — 기존 QnA+사진 혼합.
            scores = blend_scores(scores, photo, settings.PHOTO_BLEND_WEIGHT)
        else:
            scores = blend_partial(scores, photo, touched, settings.PHOTO_PARTIAL_WEIGHT)
        analysis_id = analysis.id

    ranks = rank_types(scores)

    diagnosis = Diagnosis(
        user_id=user.id,
        guest_token=None,
        version_id=version.id,
        answers=body.answers,
        scores=scores,
        analysis_id=analysis_id,
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


@router.patch("/latest", response_model=DiagnosisOut, summary="1·2순위 중 내 타입 고르기")
async def choose_type(
    body: ChooseIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DiagnosisOut:
    """결과 화면이 1·2순위를 보여 주고 사용자가 하나를 고른다.

    고를 수 있는 것은 **최신 진단의 1·2순위뿐**이다 — 임의의 타입을 넣을 수 있으면 진단이
    의미를 잃는다(그건 `PATCH /me/profile`의 '타입 미리 정하기'가 맡는다). 2순위를 고르면
    1·2순위 행의 (타입, 점수)를 맞바꿔 고른 타입이 1순위가 되게 한다. 그래야 `latest`·
    프로필 캐시·추천이 모두 같은 값을 보고, 스키마를 바꿀 필요도 없다.
    """
    diagnosis = await db.scalar(
        select(Diagnosis)
        .where(Diagnosis.user_id == user.id)
        .order_by(Diagnosis.created_at.desc())
        .options(selectinload(Diagnosis.ranks))
    )
    if diagnosis is None:
        raise HTTPException(status_code=404, detail="진단 기록이 없습니다")

    by_rank = {r.rank: r for r in diagnosis.ranks}
    first, second = by_rank.get(1), by_rank.get(2)
    if first is None or body.skin_type not in {first.skin_type, getattr(second, "skin_type", None)}:
        raise HTTPException(status_code=422, detail="1순위나 2순위 타입만 고를 수 있어요")

    if body.skin_type != first.skin_type:
        first.skin_type, second.skin_type = second.skin_type, first.skin_type
        first.score, second.score = second.score, first.score

    profile = await db.scalar(select(Profile).where(Profile.user_id == user.id))
    if profile is None:
        profile = Profile(user_id=user.id)
        db.add(profile)
    profile.skin_type = body.skin_type

    await db.commit()
    return _to_out(diagnosis, diagnosis.ranks)


@router.delete("/latest", status_code=204, response_class=Response, summary="방금 한 진단 취소(결과를 고르지 않고 닫았을 때)")
async def discard_latest(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """최신 진단을 지우고 프로필 캐시를 그 전 진단으로 되돌린다.

    결과 화면에서 1·2순위를 고르지 않고 닫으면, 이미 저장된 새 진단의 1순위가 '내 타입'이
    되어 버린다. 확정하지 않은 진단은 없던 일로 하고 **기존 내 피부타입을 그대로 둔다.**
    이전 진단이 없으면(첫 진단) 타입이 비어 진단 전 상태가 된다.
    """
    diagnoses = list(
        await db.scalars(
            select(Diagnosis)
            .where(Diagnosis.user_id == user.id)
            .order_by(Diagnosis.created_at.desc())
            .limit(2)
            .options(selectinload(Diagnosis.ranks))
        )
    )
    if not diagnoses:
        raise HTTPException(status_code=404, detail="진단 기록이 없습니다")
    latest_row = diagnoses[0]
    previous = diagnoses[1] if len(diagnoses) > 1 else None

    profile = await db.scalar(select(Profile).where(Profile.user_id == user.id))
    if profile is not None:
        top = min(previous.ranks, key=lambda r: r.rank) if previous and previous.ranks else None
        profile.skin_type = top.skin_type if top else None
        profile.scores = previous.scores if previous else None

    await db.delete(latest_row)
    await db.commit()
    return Response(status_code=204)
