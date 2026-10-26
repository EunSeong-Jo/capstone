"""내 계정·프로필 (Task 12.5).

    GET   /api/v1/me            계정 기본 정보
    PATCH /api/v1/me            닉네임·이메일 수정
    GET   /api/v1/me/profile    피부타입·예산·관심 도메인
    PATCH /api/v1/me/profile    부분 수정

프로필을 `users`와 나눠 둔 이유는 모델 주석에 있다 — `profiles.skin_type`은
최신 진단 1순위를 복사해 둔 비정규화 캐시이고, 원본은 `diagnosis_ranks`다.
그래서 여기서 skin_type을 직접 고칠 수 있게 두었다: 진단을 다시 받지 않고
"내 타입은 이미 안다"고 지정하는 경로(GitHub 이슈 #8의 '타입 미리 정하기')가
필요하기 때문이다.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.security import verify_password
from app.db.session import get_db
from app.models.user import Profile, User
from app.schemas.user import MeIn, ProfileIn, ProfileOut, UserOut

router = APIRouter(prefix="/api/v1/me", tags=["me"])

# 진단 8타입. 아무 문자열이나 받으면 화면이 모르는 코드로 캐릭터를 찾다가
# 깨지므로 여기서 막는다. skin_type_rules의 skin_type과 같은 집합이다.
# 꾸미기 장식 id. frontend/public/mascot/decoration_*.png 파일 번호와 같다.
# 없는 번호를 받으면 화면이 깨진 이미지를 그리므로 여기서 막는다.
DECORATION_IDS = frozenset(range(1, 8))

SKIN_TYPES = frozenset(
    {
        "ondalsam",
        "mulgae",
        "subuji",
        "hwasan",
        "samak",
        "injeolmi",
        "yuriguseul",
        "memilmuk",
    }
)


def _to_user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        nickname=user.nickname,
        provider=user.provider,
        created_at=user.created_at,
        skin_type=user.profile.skin_type if user.profile else None,
    )


async def _get_or_create_profile(db: AsyncSession, user: User) -> Profile:
    """가입 경로가 여럿이라(시드 스크립트 포함) 프로필이 없을 수 있다."""
    profile = await db.scalar(select(Profile).where(Profile.user_id == user.id))
    if profile is None:
        profile = Profile(user_id=user.id)
        db.add(profile)
        await db.flush()
    return profile


@router.get("", response_model=UserOut, summary="내 계정")
async def read_me(user: User = Depends(get_current_user)) -> UserOut:
    return _to_user_out(user)


@router.delete(
    "",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="회원 탈퇴",
)
async def delete_me(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """계정을 **즉시 삭제**한다 (소프트 삭제가 아니다).

    `is_active=False`로 두면 `users.email` UNIQUE 때문에 같은 이메일로 다시
    가입할 수 없다. 그래서 행을 지운다. 프로필·진단·리프레시 토큰·화장대·
    장바구니·주문·후기·동의·구독·피부 분석은 모두 `ON DELETE CASCADE`라 함께
    사라지고, 내가 받은 선물의 `recipient_user_id`만 SET NULL이 된다.
    이미 발급된 액세스 토큰은 `get_current_user`가 사용자 행을 다시 읽으므로
    다음 요청부터 401이다.
    """
    # ORM의 db.delete(user)는 관계를 먼저 NULL로 바꾸려 해서 CASCADE를 DB에 맡기지
    # 못한다. 행 단위 DELETE 한 번으로 DB의 ON DELETE CASCADE가 처리하게 한다.
    await db.execute(delete(User).where(User.id == user.id))
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("", response_model=UserOut, summary="닉네임·이메일 수정")
async def update_me(
    body: MeIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    if body.nickname is not None:
        nickname = body.nickname.strip()
        if not nickname:
            raise HTTPException(status_code=422, detail="닉네임을 입력해 주세요")
        user.nickname = nickname

    if body.email is not None:
        # 이메일은 로그인 id다. 소문자로 맞춰 저장하는 것은 signup·login과
        # 같은 규칙이다 — 안 맞추면 대문자로 가입한 사람이 못 들어온다.
        email = body.email.strip().lower()
        if email != user.email:
            # 잠깐 자리를 비운 사이 기기를 만진 사람이 로그인 주소를 자기
            # 것으로 바꿔 계정을 통째로 가져가는 경로를 막는다.
            if not verify_password(body.current_password or "", user.password_hash):
                raise HTTPException(
                    status_code=401, detail="현재 비밀번호가 올바르지 않습니다"
                )
            user.email = email

    try:
        await db.commit()
    except IntegrityError:
        # email UNIQUE 위반. signup과 같은 응답으로 맞춘다.
        await db.rollback()
        raise HTTPException(status_code=409, detail="이미 사용 중인 이메일입니다")

    await db.refresh(user, ["profile"])
    return _to_user_out(user)


@router.get("/profile", response_model=ProfileOut, summary="내 프로필")
async def read_profile(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProfileOut:
    profile = await _get_or_create_profile(db, user)
    await db.commit()
    return ProfileOut(
        skin_type=profile.skin_type,
        scores=profile.scores,
        budget_min=profile.budget_min,
        budget_max=profile.budget_max,
        domains=profile.domains,
        decoration_id=profile.decoration_id,
    )


@router.patch("/profile", response_model=ProfileOut, summary="프로필 수정")
async def update_profile(
    body: ProfileIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProfileOut:
    profile = await _get_or_create_profile(db, user)

    if body.skin_type is not None:
        if body.skin_type not in SKIN_TYPES:
            raise HTTPException(status_code=422, detail="알 수 없는 피부타입입니다")
        profile.skin_type = body.skin_type

    if body.budget_min is not None:
        profile.budget_min = body.budget_min
    if body.budget_max is not None:
        profile.budget_max = body.budget_max

    # 예산 범위가 뒤집히면 구매 가이드(Task 15)가 빈 결과만 낸다. 저장 시점에 막는다.
    lo, hi = profile.budget_min, profile.budget_max
    if lo is not None and hi is not None and lo > hi:
        raise HTTPException(status_code=422, detail="최소 예산이 최대 예산보다 큽니다")

    if body.domains is not None:
        profile.domains = body.domains

    if body.decoration_id is not None:
        # 0은 "장식 해제"다. None(안 보냄)과 구분하려고 0을 쓴다.
        if body.decoration_id == 0:
            profile.decoration_id = None
        elif body.decoration_id not in DECORATION_IDS:
            raise HTTPException(status_code=422, detail="없는 장식입니다")
        else:
            profile.decoration_id = body.decoration_id

    await db.commit()
    return ProfileOut(
        skin_type=profile.skin_type,
        scores=profile.scores,
        budget_min=profile.budget_min,
        budget_max=profile.budget_max,
        domains=profile.domains,
        decoration_id=profile.decoration_id,
    )
