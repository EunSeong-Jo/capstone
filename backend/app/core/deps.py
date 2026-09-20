"""인증 의존성 (Task 12.4).

두 가지를 내놓는다.

  get_current_user    로그인이 **필수**인 경로. 없거나 틀리면 401.
  get_optional_user   로그인이 **선택**인 경로. 없으면 None.

선택 인증이 따로 있는 이유는 PRD의 Soft-gate 정책 때문이다. 비회원도 둘러보고
진단까지 할 수 있어야 하는데, 같은 엔드포인트가 로그인 상태면 개인화된 결과를
내야 한다. 401로 막으면 그 흐름이 성립하지 않는다.
"""
from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.user import User

_UNAUTHORIZED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="로그인이 필요합니다",
    headers={"WWW-Authenticate": "Bearer"},
)


def _bearer(request: Request) -> str | None:
    """Authorization 헤더에서 토큰만 꺼낸다.

    fastapi.security.OAuth2PasswordBearer를 쓰지 않는 이유: 그쪽은 토큰이
    없으면 자동으로 401을 내서 선택적 인증을 만들 수 없다(auto_error=False로
    끌 수는 있으나, 그러면 이 함수와 하는 일이 같아진다).
    """
    header = request.headers.get("Authorization")
    if not header:
        return None
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    return token


async def get_optional_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User | None:
    token = _bearer(request)
    if token is None:
        return None

    user_id = decode_access_token(token)
    if user_id is None:
        return None

    user = await db.scalar(
        select(User).where(User.id == user_id).options(joinedload(User.profile))
    )
    # 비활성 계정(탈퇴 등)은 토큰이 아직 살아 있어도 통과시키지 않는다.
    if user is None or not user.is_active:
        return None
    return user


async def get_current_user(
    user: User | None = Depends(get_optional_user),
) -> User:
    if user is None:
        raise _UNAUTHORIZED
    return user
