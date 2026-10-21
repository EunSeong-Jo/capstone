"""얼굴 사진 AI 피부 분석 — 동의·구독·이용 한도.

    GET  /api/v1/me/consents/face-photo     얼굴 사진 수집 동의 상태
    PUT  /api/v1/me/consents/face-photo     동의·철회 (촬영 직전 재동의도 여기로)
    GET  /api/v1/me/subscription            AI 피부관리 구독 상태
    POST /api/v1/me/subscription            구독 시작 (**결제 없음 — 데모 활성화**)
    DEL  /api/v1/me/subscription            구독 해지 (기간 끝까지는 유지)
    GET  /api/v1/me/skin-analysis/quota     이번 달 이용 한도
    POST /api/v1/skin-analysis              얼굴 사진 분석 (한도 1회 사용)
    GET  /api/v1/skin-analysis              내 분석 이력 (최신순)
    GET  /api/v1/skin-analysis/latest       내 최근 분석
    GET  /api/v1/skin-analysis/{id}/images/{key}   분석 이미지 (본인만, 투명 PNG)

모두 로그인이 필요하다.

분석 순서: 동의(403) → 한도(402) → 사진 정리·EXIF 제거(422) → 얼굴 사전 필터(422) →
Perfect Corp(502/503). **한도는 분석이 성공한 뒤에만 쓴다** — 앞 단계의 거절과 외부
오류는 분석 행을 만들지 않으므로 횟수가 줄지 않는다.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.skin_photo import FACE_PHOTO, SkinAnalysis, Subscription, UserConsent
from app.models.user import User
from app.services import skin_images
from app.schemas.skin_photo import (
    AnalysisIn,
    AnalysisOut,
    AxesOut,
    ConcernOut,
    ConsentIn,
    ConsentOut,
    QuotaOut,
    SkinTypesOut,
    SubscriptionOut,
)
from app.services.face_gate import check_face, prepare_photo
from app.services.review_photos import decode_photo
from app.services.skin_photo import analyze_face, fetch_masks, parse_output, to_axes
from app.services.skin_quota import (
    SUBSCRIPTION_PERIOD_DAYS,
    active_subscription,
    get_quota,
    has_face_consent,
    lock_user,
)

router = APIRouter(tags=["skin-photo"])


# ── 동의 ────────────────────────────────────────────────────────────
async def _consent_out(db: AsyncSession, user: User) -> ConsentOut:
    row = await db.scalar(
        select(UserConsent).where(
            UserConsent.user_id == user.id, UserConsent.consent_type == FACE_PHOTO
        )
    )
    granted = await has_face_consent(db, user.id)
    return ConsentOut(
        granted=granted,
        current_version=settings.FACE_CONSENT_VERSION,
        agreed_at=row.agreed_at if (row is not None and granted) else None,
    )


@router.get("/api/v1/me/consents/face-photo", response_model=ConsentOut,
            summary="얼굴 사진 수집 동의 상태")
async def read_face_consent(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> ConsentOut:
    return await _consent_out(db, user)


@router.put("/api/v1/me/consents/face-photo", response_model=ConsentOut,
            summary="얼굴 사진 수집 동의·철회")
async def set_face_consent(
    body: ConsentIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ConsentOut:
    """동의하면 **현재 문구 버전**으로 기록하고, 철회하면 철회 시각만 남긴다.

    철회하면 **분석 이미지 파일은 바로 지우고**, 이미 만든 분석 결과(점수)는 지우지 않는다 —
    원본 사진은 애초에 저장하지 않고, 점수 삭제는 계정 삭제와 함께 CASCADE로 이뤄진다.
    """
    now = datetime.now(timezone.utc)
    withdrew = False
    row = await db.scalar(
        select(UserConsent).where(
            UserConsent.user_id == user.id, UserConsent.consent_type == FACE_PHOTO
        )
    )
    if body.agreed:
        if row is None:
            row = UserConsent(user_id=user.id, consent_type=FACE_PHOTO,
                              version=settings.FACE_CONSENT_VERSION, agreed_at=now)
            db.add(row)
        else:
            row.version = settings.FACE_CONSENT_VERSION
            row.agreed_at = now
            row.withdrawn_at = None
    elif row is not None and row.withdrawn_at is None:
        row.withdrawn_at = now
        withdrew = True
    await db.commit()
    if withdrew:
        # 분석 이미지는 동의를 근거로 보관한다 — 철회하면 바로 지운다(점수는 남는다).
        await asyncio.to_thread(skin_images.delete_user_images, user.id)
    return await _consent_out(db, user)


# ── 구독 ────────────────────────────────────────────────────────────
def _subscription_out(sub: Subscription | None) -> SubscriptionOut:
    if sub is None:
        return SubscriptionOut(active=False)
    return SubscriptionOut(
        active=True,
        plan=sub.plan,
        status=sub.status,
        current_period_start=sub.current_period_start,
        current_period_end=sub.current_period_end,
    )


@router.get("/api/v1/me/subscription", response_model=SubscriptionOut, summary="구독 상태")
async def read_subscription(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> SubscriptionOut:
    now = datetime.now(timezone.utc)
    return _subscription_out(await active_subscription(db, user.id, now))


@router.post("/api/v1/me/subscription", response_model=SubscriptionOut, status_code=201,
             summary="구독 시작 (결제 없는 데모 활성화)")
async def start_subscription(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> SubscriptionOut:
    """**실제 결제는 일어나지 않는다.** 장바구니 결제처럼 기록만 만든다.

    이미 구독 중이면 그대로 돌려주고(멱등), 해지했지만 기간이 남아 있으면
    해지를 되돌린다. 기간은 활성화 시점부터 30일이다.
    """
    now = datetime.now(timezone.utc)
    sub = await active_subscription(db, user.id, now)
    if sub is None:
        sub = Subscription(
            user_id=user.id,
            current_period_start=now,
            current_period_end=now + timedelta(days=SUBSCRIPTION_PERIOD_DAYS),
        )
        db.add(sub)
    elif sub.status == "cancelled":
        sub.status = "active"
        sub.cancelled_at = None
    await db.commit()
    await db.refresh(sub)
    return _subscription_out(sub)


@router.delete("/api/v1/me/subscription", response_model=SubscriptionOut, summary="구독 해지")
async def cancel_subscription(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> SubscriptionOut:
    """해지해도 `currentPeriodEnd`까지는 구독자로 이용한다."""
    now = datetime.now(timezone.utc)
    sub = await active_subscription(db, user.id, now)
    if sub is None:
        raise HTTPException(status_code=404, detail="구독 중이 아니에요")
    if sub.status != "cancelled":
        sub.status = "cancelled"
        sub.cancelled_at = now
        await db.commit()
        await db.refresh(sub)
    return _subscription_out(sub)


# ── 이용 한도 ───────────────────────────────────────────────────────
@router.get("/api/v1/me/skin-analysis/quota", response_model=QuotaOut,
            summary="이번 달 사진 분석 이용 한도")
async def read_quota(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> QuotaOut:
    q = await get_quota(db, user.id)
    return QuotaOut(
        plan=q.plan,
        allowance=q.allowance,
        used=q.used,
        remaining=q.remaining,
        resets_at=q.resets_at,
        consent_granted=q.consent_granted,
        concern_count=len(q.concerns),
        extended=q.extended,
    )


# ── 분석 ────────────────────────────────────────────────────────────
# 입력 해상도 조건(짧은 변). SD 480px, HD 1080px — Perfect Corp 문서 기준.
MIN_SHORT_SIDE = {"sd": 480, "hd": 1080}


def _analysis_out(row: SkinAnalysis, remaining: int | None = None) -> AnalysisOut:
    m = row.metrics
    types = m.get("skin_types") or {}
    return AnalysisOut(
        analysis_id=row.id,
        created_at=row.created_at,
        axes=AxesOut(**m["axes"]),
        skin_types=SkinTypesOut(
            whole=types.get("whole"), t_zone=types.get("t_zone"), u_zone=types.get("u_zone")
        ),
        concerns=[ConcernOut(key=k, score=v["ui"]) for k, v in m["concerns"].items()],
        extended=row.concern_set == "extended",
        images=skin_images.available_keys(row.user_id, row.id),
        remaining=remaining,
    )


@router.post("/api/v1/skin-analysis", response_model=AnalysisOut, status_code=201,
             summary="얼굴 사진 분석")
async def analyze(
    body: AnalysisIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AnalysisOut:
    # 같은 사용자의 동시 요청이 한도를 함께 넘지 않게, 이 트랜잭션이 끝날 때까지 잠근다.
    await lock_user(db, user.id)
    quota = await get_quota(db, user.id)

    if not quota.consent_granted:
        raise HTTPException(
            status_code=403, detail="얼굴 사진 수집·이용에 동의해야 사진 분석을 쓸 수 있어요"
        )
    if quota.remaining <= 0:
        raise HTTPException(status_code=402, detail="이번 달 사진 분석 횟수를 모두 사용했어요")

    _, data = decode_photo(body.image)
    photo = prepare_photo(data, MIN_SHORT_SIDE.get(settings.PERFECT_CORP_MODE, 480))
    await check_face(photo)

    output = await analyze_face(photo.jpeg, quota.concerns)
    parsed = parse_output(output)
    axes = to_axes(parsed)

    # 분석 이미지를 받아 디스크에 둔다(최선 노력 — 실패해도 점수 분석은 성공이다).
    analysis_id = uuid.uuid4()
    masks = await fetch_masks(output, quota.concerns)
    saved = await skin_images.save_images(user.id, analysis_id, masks)

    row = SkinAnalysis(
        id=analysis_id,
        user_id=user.id,
        quota_kind=quota.quota_kind,
        concern_set=quota.concern_set,
        provider_mode="mock" if settings.PERFECT_CORP_MOCK else settings.PERFECT_CORP_MODE,
        metrics={"axes": axes, **parsed, "images": saved},
    )
    db.add(row)
    try:
        await db.commit()
    except Exception:
        await asyncio.to_thread(skin_images.delete_analysis_images, user.id, analysis_id)
        raise
    await db.refresh(row)
    return _analysis_out(row, remaining=quota.remaining - 1)


@router.get("/api/v1/skin-analysis", response_model=list[AnalysisOut],
            summary="내 사진 분석 이력")
async def analysis_history(
    limit: int = Query(20, ge=1, le=50),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AnalysisOut]:
    """최신순. 이미지는 저장하지 않으므로 점수·분류만 돌려준다."""
    rows = await db.scalars(
        select(SkinAnalysis)
        .where(SkinAnalysis.user_id == user.id)
        .order_by(SkinAnalysis.created_at.desc())
        .limit(limit)
    )
    return [_analysis_out(r) for r in rows]


@router.get("/api/v1/skin-analysis/{analysis_id}/images/{key}",
            summary="내 사진 분석 이미지 (PNG)", response_class=FileResponse)
async def analysis_image(
    analysis_id: uuid.UUID,
    key: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    """항목별 분석 결과 이미지(얼굴 사진 없는 투명 PNG). **본인 것만** 받을 수 있다(남의 id는 404)."""
    owned = await db.scalar(
        select(SkinAnalysis.id).where(
            SkinAnalysis.id == analysis_id, SkinAnalysis.user_id == user.id
        )
    )
    path = skin_images.image_path(user.id, analysis_id, key) if owned else None
    if path is None:
        raise HTTPException(status_code=404, detail="분석 이미지가 없어요")
    return FileResponse(path, media_type="image/png",
                        headers={"Cache-Control": "private, max-age=300"})


@router.get("/api/v1/skin-analysis/latest", response_model=AnalysisOut,
            summary="내 최근 사진 분석")
async def latest_analysis(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> AnalysisOut:
    row = await db.scalar(
        select(SkinAnalysis)
        .where(SkinAnalysis.user_id == user.id)
        .order_by(SkinAnalysis.created_at.desc())
        .limit(1)
    )
    if row is None:
        raise HTTPException(status_code=404, detail="사진 분석 기록이 없어요")
    return _analysis_out(row)
