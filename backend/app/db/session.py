"""비동기 DB 세션.

FastAPI 핸들러는 get_db()를 의존성으로 받아 쓴다.
"""
from __future__ import annotations

import asyncio
from collections.abc import AsyncGenerator

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import settings

log = structlog.get_logger()

# Neon 등 관리형 DB는 SSL이 필수인데, asyncpg는 URL의 sslmode를 읽지 못한다.
# config.DATABASE_URL이 해당 파라미터를 떼어내므로 여기서 별도로 넘긴다.
_connect_args: dict = {"ssl": "require"} if settings.DB_REQUIRES_SSL else {}

engine = create_async_engine(
    settings.DATABASE_URL,
    connect_args=_connect_args,
    # pre_ping은 체크아웃마다 확인 왕복을 하나 더 태워 매 요청을 늦춘다
    # (실측: 살아있는 연결 재사용 0.2~0.3s인데 pre_ping 체크아웃은 1.2~1.4s).
    # 대신 pool_recycle로 일정 시간 지난 연결은 확인 없이 선제 폐기하고,
    # keepalive_loop()가 요청 경로 밖에서 주기적으로 연결을 데워 둔다 —
    # 이 둘이 같이 있으면 정상 요청이 죽은 연결을 붙잡을 일이 거의 없다.
    pool_pre_ping=False,
    pool_recycle=240,
    pool_size=5,
    max_overflow=5,
    echo=settings.APP_ENV == "development" and False,  # 쿼리 로깅이 필요하면 True
)

KEEPALIVE_INTERVAL = 30  # Neon/PgBouncer의 유휴 타임아웃보다 짧게 잡는다


async def keepalive_loop() -> None:
    """풀의 커넥션을 주기적으로 사용해 유휴 상태로 끊기지 않게 한다.

    pool_pre_ping을 껐으므로 요청 경로에서는 더 이상 "살아있나" 확인을
    하지 않는다 — 대신 여기서 백그라운드로 미리 확인해 둔다. main.py의
    startup/shutdown 훅이 이 태스크를 띄우고 종료 시 취소한다.
    """
    while True:
        try:
            await asyncio.sleep(KEEPALIVE_INTERVAL)
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 — 킵얼라이브 실패가 서버를 죽이면 안 된다
            log.warning("keepalive_failed", error=str(exc)[:200])

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,  # 커밋 후에도 응답 직렬화 중 속성 접근이 가능하도록
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI 의존성. 요청 1건당 세션 1개."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
