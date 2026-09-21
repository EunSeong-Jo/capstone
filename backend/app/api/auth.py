"""인증 엔드포인트 (Task 12.3).

    POST /api/v1/auth/signup    가입 + 즉시 로그인
    POST /api/v1/auth/login     이메일·비밀번호
    POST /api/v1/auth/refresh   액세스 토큰 재발급 (회전)
    POST /api/v1/auth/logout    리프레시 토큰 폐기

리프레시 토큰을 회전시키는 이유
-------------------------------
갱신할 때 기존 토큰을 revoke하고 새로 발급한다. 토큰이 유출돼도 정상 사용자가
한 번만 갱신하면 탈취된 쪽은 이미 죽은 토큰을 들고 있게 된다. 회전하지 않으면
14일 내내 유효하다.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.deps import get_current_user
from app.core.security import (
    create_access_token,
    hash_password,
    hash_refresh_token,
    new_refresh_token,
    verify_password,
)
from app.db.session import get_db
from app.models.user import Profile, RefreshToken, User
from app.schemas.user import LoginIn, RefreshIn, SignupIn, TokenOut, UserOut

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def _to_user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        nickname=user.nickname,
        provider=user.provider,
        created_at=user.created_at,
        skin_type=user.profile.skin_type if user.profile else None,
    )


async def _issue(db: AsyncSession, user: User) -> TokenOut:
    """액세스 + 리프레시 발급. 리프레시는 해시만 남는다."""
    access, expires_in = create_access_token(user.id)
    raw, token_hash, expires_at = new_refresh_token()

    db.add(RefreshToken(user_id=user.id, token_hash=token_hash, expires_at=expires_at))
    user.last_login_at = datetime.now(timezone.utc)
    await db.commit()

    return TokenOut(
        access_token=access,
        refresh_token=raw,
        access_expires_in=expires_in,
        user=_to_user_out(user),
    )


@router.post("/signup", response_model=TokenOut, status_code=status.HTTP_201_CREATED,
             summary="회원가입 (가입 즉시 로그인)")
async def signup(body: SignupIn, db: AsyncSession = Depends(get_db)) -> TokenOut:
    user = User(
        email=body.email.lower(),
        password_hash=hash_password(body.password),
        nickname=body.nickname,
        provider="local",
    )
    db.add(user)
    try:
        await db.flush()
    except IntegrityError:
        # email UNIQUE 위반. "이미 가입된 이메일"을 그대로 알린다 —
        # 가입 화면에서 숨겨봐야 로그인 시도로 어차피 드러난다.
        await db.rollback()
        raise HTTPException(status_code=409, detail="이미 가입된 이메일입니다")

    # 진단 전이라 값은 비어 있지만 행은 만들어 둔다. 이후 프로필 수정이
    # UPDATE 한 번으로 끝나고, 화면이 "프로필 없음"을 따로 다루지 않아도 된다.
    db.add(Profile(user_id=user.id))
    await db.flush()
    await db.refresh(user, ["profile"])
    return await _issue(db, user)


@router.post("/login", response_model=TokenOut, summary="로그인")
async def login(body: LoginIn, db: AsyncSession = Depends(get_db)) -> TokenOut:
    user = await db.scalar(
        select(User)
        .where(User.email == body.email.lower())
        .options(joinedload(User.profile))
    )
    # 없는 계정과 틀린 비밀번호를 같은 응답으로 돌려준다. 구분하면 어떤
    # 이메일이 가입돼 있는지 알아낼 수 있다.
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="비활성화된 계정입니다")

    return await _issue(db, user)


@router.post("/refresh", response_model=TokenOut, summary="액세스 토큰 재발급")
async def refresh(body: RefreshIn, db: AsyncSession = Depends(get_db)) -> TokenOut:
    token_hash = hash_refresh_token(body.refresh_token)
    row = await db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )

    now = datetime.now(timezone.utc)
    if row is None or row.revoked_at is not None or row.expires_at <= now:
        raise HTTPException(status_code=401, detail="다시 로그인해 주세요")

    user = await db.scalar(
        select(User).where(User.id == row.user_id).options(joinedload(User.profile))
    )
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="다시 로그인해 주세요")

    # 회전 — 쓴 토큰은 즉시 죽인다.
    row.revoked_at = now
    return await _issue(db, user)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="로그아웃",
)
async def logout(body: RefreshIn, db: AsyncSession = Depends(get_db)) -> Response:
    """리프레시 토큰을 폐기한다.

    액세스 토큰은 서명만 검증하므로 여기서 끊을 수 없다 — 최대 30분 뒤
    만료된다. 인증을 요구하지 않는 이유도 같다. 이미 만료된 액세스 토큰을
    들고 로그아웃하려는 경우가 정상 경로이기 때문이다.
    """
    token_hash = hash_refresh_token(body.refresh_token)
    row = await db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    # 없는 토큰이어도 204. 있는지 없는지 알려줄 이유가 없다.
    if row is not None and row.revoked_at is None:
        row.revoked_at = datetime.now(timezone.utc)
        await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UserOut, summary="내 계정 (토큰 검증용)")
async def me(user: User = Depends(get_current_user)) -> UserOut:
    return _to_user_out(user)
