"""얼굴 사진 AI 피부 분석 — 동의·구독·이용 한도.

    GET  /api/v1/me/consents/face-photo     얼굴 사진 수집 동의 상태
    PUT  /api/v1/me/consents/face-photo     동의·철회 (촬영 직전 재동의도 여기로)
    GET  /api/v1/me/subscription            AI 피부관리 구독 상태
    POST /api/v1/me/subscription            구독 시작 (**결제 없음 — 데모 활성화**)
    DEL  /api/v1/me/subscription            구독 해지 (기간 끝까지는 유지)
    GET  /api/v1/me/skin-analysis/quota     이번 달 이용 한도
    POST /api/v1/skin-analysis/check        사진 사전 검증 — 분석 아님, 한도를 쓰지 않는다
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

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.deps import get_current_user
from app.core.rate_limit import allow_daily
from app.db.session import get_db
from app.models.skin_photo import FACE_PHOTO, SkinAnalysis, Subscription, UserConsent
from app.models.user import User
from app.services import skin_images
from app.schemas.skin_photo import (
    AnalysisIn,
    AnalysisOut,
    PhotoCheckItemOut,
    PhotoCheckOut,
    AxesOut,
    ConcernOut,
    ConsentIn,
    ConsentOut,
    QuotaOut,
    SkinTypesOut,
    SubscriptionOut,
)
from app.services.face_gate import check_face, inspect_photo, prepare_photo
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

    철회해도 이미 만든 분석 결과(점수·이미지)는 지우지 않는다 — 새 분석만 막힌다.
    원본 사진은 애초에 저장하지 않고, 결과 삭제는 계정 삭제와 함께 CASCADE로 이뤄진다.
    """
    now = datetime.now(timezone.utc)
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
    await db.commit()
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


def _analysis_out(
    row: SkinAnalysis, images: list[str], remaining: int | None = None
) -> AnalysisOut:
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
        images=images,
        remaining=remaining,
    )


# 사전 검증은 한도를 쓰지 않아 서버 CPU만 든다 — 하루 이 횟수까지(촬영·재촬영을 충분히 허용한다).
PRECHECK_DAILY_LIMIT = 100


@router.post("/api/v1/skin-analysis/check", response_model=PhotoCheckOut,
             summary="사진 사전 검증 (분석 아님)")
async def precheck_photo(
    body: AnalysisIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PhotoCheckOut:
    """촬영한 사진이 분석에 맞는지 **미리** 알려 준다 — 분석 때 쓰는 것과 같은 검증(`face_gate`)이다.

    Perfect Corp을 부르지 않고 한도도 쓰지 않으며, 사진은 저장하지 않는다. 부적합하면 이유를 한 문장으로
    돌려주고(`ok=false`), 화면이 분석 전에 다시 찍게 안내한다. 얼굴 사진 수집에 동의한 사람만 쓸 수 있다.
    """
    quota = await get_quota(db, user.id)
    if not quota.consent_granted:
        raise HTTPException(
            status_code=403, detail="얼굴 사진 수집·이용에 동의해야 사진 분석을 쓸 수 있어요"
        )
    if not await allow_daily("skin_precheck", str(user.id), PRECHECK_DAILY_LIMIT):
        raise HTTPException(status_code=429, detail="오늘 사진 확인 횟수를 모두 썼어요")

    try:
        _, data = decode_photo(body.image)
        photo = prepare_photo(data, MIN_SHORT_SIDE.get(settings.PERFECT_CORP_MODE, 480))
    except HTTPException as exc:
        if exc.status_code != 422:
            raise
        return PhotoCheckOut(ok=False, code="image_unusable", message=str(exc.detail))
    result = await inspect_photo(photo)
    return PhotoCheckOut(
        ok=result.ok,
        code=result.code,
        message=result.message,
        metrics=result.metrics,
        items=[
            PhotoCheckItemOut(key=i.key, label=i.label, ok=i.ok, message=i.message)
            for i in result.items or []
        ],
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

    # 분석 이미지를 받아 DB에 둔다(내려받기가 실패해도 점수 분석은 성공이다).
    analysis_id = uuid.uuid4()
    masks = skin_images.valid_images(await fetch_masks(output, quota.concerns))
    saved = sorted(masks)

    row = SkinAnalysis(
        id=analysis_id,
        user_id=user.id,
        quota_kind=quota.quota_kind,
        concern_set=quota.concern_set,
        provider_mode="mock" if settings.PERFECT_CORP_MOCK else settings.PERFECT_CORP_MODE,
        metrics={"axes": axes, **parsed, "images": saved},
    )
    db.add(row)
    await db.flush()                                  # 이미지 FK가 가리킬 분석 행을 먼저 만든다
    skin_images.add_images(db, user.id, analysis_id, masks)
    await db.commit()
    await db.refresh(row)
    return _analysis_out(row, saved, remaining=quota.remaining - 1)


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
    rows = list(rows)
    keys = await skin_images.keys_for(db, [r.id for r in rows])
    return [_analysis_out(r, keys.get(r.id, [])) for r in rows]


@router.get("/api/v1/skin-analysis/{analysis_id}/images/{key}",
            summary="내 사진 분석 이미지 (PNG)", response_class=Response)
async def analysis_image(
    analysis_id: uuid.UUID,
    key: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """항목별 분석 결과 이미지(얼굴 사진 없는 투명 PNG). **본인 것만** 받을 수 있다(남의 id는 404)."""
    owned = await db.scalar(
        select(SkinAnalysis.id).where(
            SkinAnalysis.id == analysis_id, SkinAnalysis.user_id == user.id
        )
    )
    png = await skin_images.get_image(db, analysis_id, key) if owned else None
    if png is None:
        raise HTTPException(status_code=404, detail="분석 이미지가 없어요")
    return Response(png, media_type="image/png", headers={"Cache-Control": "private, max-age=300"})


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
    return _analysis_out(row, (await skin_images.keys_for(db, [row.id])).get(row.id, []))
