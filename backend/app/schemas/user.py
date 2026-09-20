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


class ProfileIn(_CamelModel):
    """부분 수정. 보내지 않은 필드는 건드리지 않는다."""

    skin_type: str | None = None
    budget_min: int | None = Field(default=None, ge=0)
    budget_max: int | None = Field(default=None, ge=0)
    domains: list[str] | None = None


class MeIn(_CamelModel):
    nickname: str | None = Field(default=None, max_length=20)
