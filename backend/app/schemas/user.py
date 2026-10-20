"""인증·프로필 스키마 (Task 12.3).

`product.py`의 `_CamelModel`을 그대로 쓴다. 저장소의 모든 응답이 camelCase라
여기만 snake_case면 프론트가 필드마다 예외를 만들어야 한다.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import EmailStr, Field, field_validator

from app.core.security import PASSWORD_MAX_BYTES
from app.schemas.product import _CamelModel

# 최소 8자. 상한은 bcrypt가 받는 72바이트에서 온다 — 넘으면 해싱이 실패하므로
# 500이 아니라 422로 돌려준다.
PASSWORD_MIN_LENGTH = 8


class SignupIn(_CamelModel):
    email: EmailStr
    password: str = Field(min_length=PASSWORD_MIN_LENGTH)
    nickname: str | None = Field(default=None, max_length=20)
    # (선택) 얼굴 사진 수집·이용 동의. 체크하지 않아도 가입된다 — 사진 분석을 쓰지
    # 않는 사용자에게 민감 정보 동의를 가입 조건으로 강제하지 않기 위해서다.
    # 안 했거나 기존 회원이면 촬영 직전에 PUT /me/consents/face-photo로 다시 받는다.
    face_consent: bool = False

    @field_validator("password")
    @classmethod
    def _fits_bcrypt(cls, v: str) -> str:
        if len(v.encode("utf-8")) > PASSWORD_MAX_BYTES:
            raise ValueError(f"비밀번호는 {PASSWORD_MAX_BYTES}바이트를 넘을 수 없습니다")
        return v


class LoginIn(_CamelModel):
    email: EmailStr
    password: str


class RefreshIn(_CamelModel):
    refresh_token: str


class PasswordChangeIn(_CamelModel):
    """비밀번호 변경.

    현재 비밀번호를 함께 받는다. 액세스 토큰만으로 바꾸게 두면 잠깐 자리를
    비운 사이 기기를 만진 사람이 비밀번호를 갈아치울 수 있다.
    """

    current_password: str
    new_password: str = Field(min_length=PASSWORD_MIN_LENGTH)

    @field_validator("new_password")
    @classmethod
    def _fits_bcrypt(cls, v: str) -> str:
        if len(v.encode("utf-8")) > PASSWORD_MAX_BYTES:
            raise ValueError(f"비밀번호는 {PASSWORD_MAX_BYTES}바이트를 넘을 수 없습니다")
        return v


class UserOut(_CamelModel):
    id: uuid.UUID
    email: EmailStr
    nickname: str | None = None
    provider: str
    created_at: datetime
    # 최신 진단 1순위. profiles가 없으면 None이다(진단 전 가입).
    skin_type: str | None = None


class TokenOut(_CamelModel):
    """로그인·갱신 공통 응답.

    accessExpiresIn은 초 단위다. 프론트가 만료 시각을 직접 계산하지 않도록
    (시계가 어긋난 기기가 있다) 남은 시간으로 준다.
    """

    access_token: str
    refresh_token: str
    access_expires_in: int
    user: UserOut


class ProfileOut(_CamelModel):
    skin_type: str | None = None
    scores: dict | None = None
    budget_min: int | None = None
    budget_max: int | None = None
    domains: list | None = None
    # 캐릭터 꾸미기 장식. None이면 장식 없음.
    decoration_id: int | None = None


class ProfileIn(_CamelModel):
    """부분 수정. 보내지 않은 필드는 건드리지 않는다."""

    skin_type: str | None = None
    budget_min: int | None = Field(default=None, ge=0)
    budget_max: int | None = Field(default=None, ge=0)
    domains: list[str] | None = None
    # 0을 "장식 없음"으로 쓴다. None은 "안 보냈다"라서 해제와 구분되지 않는다.
    decoration_id: int | None = Field(default=None, ge=0)


class MeIn(_CamelModel):
    nickname: str | None = Field(default=None, max_length=20)
    # 로그인 id이기도 하다. 바꾸면 그 순간부터 새 주소로 로그인해야 한다.
    email: EmailStr | None = None
    # 이메일을 바꿀 때만 필요하다. 로그인 id를 바꾸는 일은 비밀번호를 바꾸는
    # 것만큼 민감해서, 액세스 토큰만으로는 통과시키지 않는다.
    current_password: str | None = None
