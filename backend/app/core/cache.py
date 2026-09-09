"""Redis 캐시 헬퍼.

Redis가 죽어 있어도 API가 500을 내면 안 된다 — 모든 함수는 예외를 삼키고
None/no-op을 반환해 호출부가 조용히 DB 경로로 폴백하게 한다.
연결 자체는 지연 생성(lazy pool)이라 Redis가 안 떠 있어도 import는 안전하다
(app/db/session.py의 engine과 같은 패턴).

넓게 Exception을 잡는 이유: RedisError만 잡으면 예상 못한 예외(잘못된
인코딩 등)가 그대로 500으로 새어나갈 위험이 있다. 캐시는 있으면 빠르고
없으면 그냥 DB로 가는 가속기일 뿐, 요청을 막는 존재가 되면 안 된다.
"""
from __future__ import annotations

import structlog
from redis import asyncio as redis

from app.config import settings

log = structlog.get_logger()

VERSION_KEY = "products:cache_version"

_client: redis.Redis = redis.from_url(
    settings.REDIS_URL,
    socket_connect_timeout=0.5,
    socket_timeout=0.5,
    decode_responses=True,
)


async def cache_get(key: str) -> str | None:
    try:
        return await _client.get(key)
    except Exception as exc:  # noqa: BLE001 — 캐시 장애가 요청을 막으면 안 된다
        log.warning("cache_get_failed", key=key, error=str(exc)[:200])
        return None


async def cache_set(key: str, value: str, ttl: int) -> None:
    try:
        await _client.set(key, value, ex=ttl)
    except Exception as exc:  # noqa: BLE001
        log.warning("cache_set_failed", key=key, error=str(exc)[:200])


async def get_cache_version() -> int:
    """products:cache_version 조회. 없거나 실패하면 0(콜드 스타트)."""
    try:
        raw = await _client.get(VERSION_KEY)
        return int(raw) if raw is not None else 0
    except Exception as exc:  # noqa: BLE001
        log.warning("cache_version_read_failed", error=str(exc)[:200])
        return 0
