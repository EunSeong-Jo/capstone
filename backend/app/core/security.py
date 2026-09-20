"""비밀번호 해싱과 JWT 발급·검증 (Task 12.2).

토큰이 둘인 이유
----------------
액세스 토큰은 서명만 검증하므로 **발급 후에는 취소할 수 없다.** 그래서 짧게
(30분) 두고, 긴 수명은 리프레시 토큰이 맡는다. 리프레시는 `refresh_tokens`에
행으로 남아 `revoked_at`을 찍으면 즉시 끊긴다 — 로그아웃과 비밀번호 변경이
실제로 효력을 가지려면 이 구조가 필요하다.

리프레시 토큰을 해시로 저장하는 이유
------------------------------------
DB가 유출되면 평문 토큰은 그대로 남의 계정 접근 수단이 된다. 비밀번호와 같은
이유로 원문을 두지 않는다. 다만 bcrypt가 아니라 SHA-256을 쓰는데, 토큰은
사람이 만든 비밀번호와 달리 256비트 난수라 무차별 대입 대상이 아니고,
매 갱신마다 조회해야 해서 느린 해시가 오히려 병목이 되기 때문이다.

passlib을 쓰지 않는 이유
------------------------
requirements에 passlib 1.7.4가 있지만 bcrypt 5.x와 맞지 않는다. passlib이
백엔드를 탐지할 때 72바이트를 넘는 프로브 문자열을 넣는데, 새 bcrypt가
그걸 ValueError로 거부해 **해싱 자체가 실패한다.** passlib은 2020년 이후
릴리스가 없어 고쳐지길 기다릴 수 없으므로 bcrypt를 직접 쓴다.
해시 형식은 표준 bcrypt라 `scripts/seed_test_users.py`가 만든 것과 호환된다.
"""
from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt

from app.config import settings

# bcrypt가 받는 최대 길이. 넘으면 조용히 잘리는 게 아니라 5.x는 오류를 낸다.
# 스키마에서도 막지만, 잘라서 통과시키면 "긴 비밀번호의 앞 72바이트만 같아도
# 로그인된다"는 함정이 생기므로 여기서도 거부한다.
PASSWORD_MAX_BYTES = 72

ACCESS = "access"


def hash_password(raw: str) -> str:
    data = raw.encode("utf-8")
    if len(data) > PASSWORD_MAX_BYTES:
        raise ValueError("비밀번호가 너무 깁니다")
    return bcrypt.hashpw(data, bcrypt.gensalt()).decode("utf-8")


def verify_password(raw: str, hashed: str | None) -> bool:
    """비밀번호 대조.

    hashed가 None인 계정이 있다(소셜 로그인). 그 계정에 비밀번호 로그인을
    허용하면 안 되므로 여기서 막는다 — 호출 측이 잊어도 안전하도록.
    """
    if not hashed:
        return False
    data = raw.encode("utf-8")
    if len(data) > PASSWORD_MAX_BYTES:
        return False
    try:
        return bcrypt.checkpw(data, hashed.encode("utf-8"))
    except ValueError:
        # 해시 형식이 깨진 경우. 인증 실패로 취급한다.
        return False


def create_access_token(user_id: uuid.UUID) -> tuple[str, int]:
    """(토큰, 만료까지 남은 초)."""
    expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "typ": ACCESS,
        "iat": int(now.timestamp()),
        "exp": int((now + expires).timestamp()),
    }
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return token, int(expires.total_seconds())


def decode_access_token(token: str) -> uuid.UUID | None:
    """유효한 액세스 토큰이면 사용자 id, 아니면 None.

    예외를 올리지 않고 None을 돌려주는 이유: 호출 측이 '선택적 인증'
    (Soft-gate)에서도 같은 함수를 쓰기 때문이다. 만료·위조·형식 오류를
    구분하지 않는다 — 어느 쪽이든 클라이언트가 할 일은 재로그인뿐이다.
    """
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
    except JWTError:
        return None

    # 리프레시 토큰을 Authorization 헤더에 넣어도 통과하면 안 된다.
    if payload.get("typ") != ACCESS:
        return None

    try:
        return uuid.UUID(payload["sub"])
    except (KeyError, ValueError):
        return None


def new_refresh_token() -> tuple[str, str, datetime]:
    """(원문, 해시, 만료시각). 원문은 이 순간에만 존재하고 저장하지 않는다."""
    raw = secrets.token_urlsafe(48)
    expires = datetime.now(timezone.utc) + timedelta(
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )
    return raw, hash_refresh_token(raw), expires


def hash_refresh_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
