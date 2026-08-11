"""비동기 DB 세션.

FastAPI 핸들러는 get_db()를 의존성으로 받아 쓴다.
"""
from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import settings

# Neon 등 관리형 DB는 SSL이 필수인데, asyncpg는 URL의 sslmode를 읽지 못한다.
# config.DATABASE_URL이 해당 파라미터를 떼어내므로 여기서 별도로 넘긴다.
_connect_args: dict = {"ssl": "require"} if settings.DB_REQUIRES_SSL else {}

engine = create_async_engine(
    settings.DATABASE_URL,
    connect_args=_connect_args,
    # Neon 무료 티어는 유휴 시 컴퓨트를 절전시킨다. 끊긴 커넥션을
    # 재사용하면 첫 쿼리가 실패하므로 사용 직전에 살아있는지 확인한다.
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=5,
    echo=settings.APP_ENV == "development" and False,  # 쿼리 로깅이 필요하면 True
)

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
