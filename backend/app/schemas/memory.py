"""AI 기억 요청·응답 (퍼스널 AI 3단계)."""
from __future__ import annotations

from datetime import datetime

from pydantic import Field

from app.schemas.product import _CamelModel


class AiMemoryStateOut(_CamelModel):
    enabled: bool
    version: str
    agreed_at: datetime | None = None
    count: int = 0
    limit: int


class AiMemoryStateIn(_CamelModel):
    enabled: bool


class MemoryOut(_CamelModel):
    id: int
    text: str = Field(validation_alias="content")
    kind: str
    source: str
    enabled: bool
    updated_at: datetime


class MemoryIn(_CamelModel):
    text: str = Field(min_length=1, max_length=200)


class MemoryPatch(_CamelModel):
    text: str | None = Field(default=None, min_length=1, max_length=200)
    enabled: bool | None = None
