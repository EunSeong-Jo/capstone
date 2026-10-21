import asyncio
import contextlib
import sys
from urllib.parse import urlsplit

# Windows 기본 ProactorEventLoop는 asyncpg의 DNS 조회에서
# "OSError: [Errno 42] Illegal byte sequence"를 일으킨다 (Neon 같은 원격 호스트 접속 시).
# 팀은 평소 Docker(Linux 컨테이너)로 백엔드를 띄워서 이 문제를 겪지 않았을 뿐이다.
# 로컬 Windows에서 맨몸으로 uvicorn을 띄울 때만 필요한 우회.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import sentry_sdk
import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy import text

from app.api.care_tip import router as care_tip_router
from app.api.auth import router as auth_router
from app.api.chat import router as chat_router
from app.api.diagnosis import router as diagnosis_router
from app.api.me import router as me_router
from app.api.personal import (
    gifts_router,
    orders_router,
    reviews_router,
    router as personal_router,
)
from app.api.products import router as products_router
from app.api.recommendations import router as recommendations_router
from app.api.recommendations_main import router as reco_main_router
from app.api.skin_photo import router as skin_photo_router
from app.api.weather import router as weather_router
from app.config import settings
from app.db.session import engine, keepalive_loop
from app.logging_config import configure_logging

# ── 로깅 초기화 (P0: structlog) ─────────────────────────
configure_logging()
log = structlog.get_logger()

# ── Sentry 초기화 (P0: DSN 설정 시 활성화) ──────────────
if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        traces_sample_rate=0.1,
        environment=settings.APP_ENV,
    )
    log.info("sentry_initialized", dsn_set=True)

# ── FastAPI 앱 ───────────────────────────────────────────
app = FastAPI(
    title="swappy API",
    version="0.1.0",
    description="AI 기반 프로필 맞춤 제품 추천 및 성분 유사도 대체품 매칭 서비스",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(auth_router)
app.include_router(me_router)
app.include_router(diagnosis_router)
app.include_router(skin_photo_router)
app.include_router(personal_router)
app.include_router(orders_router)
app.include_router(gifts_router)
app.include_router(reviews_router)
app.include_router(chat_router)
app.include_router(products_router)
app.include_router(recommendations_router)
app.include_router(reco_main_router)
app.include_router(weather_router)
app.include_router(care_tip_router)


async def _check_db() -> None:
    """기동 시 DB에 한 번 붙어 본다.

    실패해도 서버는 계속 띄운다. 여기서 죽이면 compose의
    restart: unless-stopped와 맞물려 재시작 루프에 빠진다.
    대신 무엇을 고쳐야 하는지 로그에 크게 남긴다 — 지금까지는 요청이
    올 때가 돼서야 500이 나서 원인을 찾기 어려웠다.
    """
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001 - 어떤 연결 오류든 안내로 바꾼다
        log.error("db_unreachable", error=str(exc)[:200])
        if not settings.DATABASE_DSN:
            print(
                "\n" + "=" * 68
                + "\n  DB에 연결할 수 없습니다 - DATABASE_DSN이 비어 있습니다."
                "\n"
                "\n  리포 루트의 .env에 Neon 연결 문자열을 넣어 주세요."
                "\n      cp .env.example .env"
                "\n      DATABASE_DSN=postgresql://...@ep-xxxx.neon.tech/neondb?sslmode=require"
                "\n"
                "\n  Neon 조직 'dmu' 초대를 받으면 콘솔에서 확인할 수 있습니다."
                "\n  서버는 계속 뜨지만 제품 API는 모두 실패합니다."
                + "\n" + "=" * 68 + "\n",
                flush=True,
            )
        else:
            print(
                "\n" + "=" * 68
                + "\n  DB에 연결할 수 없습니다 - DATABASE_DSN은 설정돼 있습니다."
                "\n"
                f"\n  오류: {str(exc)[:160]}"
                "\n"
                "\n  확인할 것"
                "\n    - Neon 프로젝트가 살아 있는지 (콘솔에서 상태 확인)"
                "\n    - DSN을 그대로 붙여넣었는지 (sslmode=require 포함)"
                "\n    - 네트워크·방화벽"
                + "\n" + "=" * 68 + "\n",
                flush=True,
            )
        return

    # 비밀번호가 로그에 남지 않도록 호스트만 남긴다.
    host = urlsplit(settings.DATABASE_URL).hostname or "?"
    log.info("db_connected", host=host, dsn_configured=bool(settings.DATABASE_DSN))


_keepalive_task: asyncio.Task | None = None


@app.on_event("startup")
async def startup() -> None:
    global _keepalive_task
    log.info("server_started", env=settings.APP_ENV, version="0.1.0")
    await _check_db()
    # 기본은 끈다 — 30초 핑이 Neon의 scale-to-zero를 막아 CU-hrs를 소모한다(config.DB_KEEPALIVE).
    if settings.DB_KEEPALIVE:
        _keepalive_task = asyncio.create_task(keepalive_loop())


@app.on_event("shutdown")
async def shutdown() -> None:
    if _keepalive_task is not None:
        _keepalive_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await _keepalive_task
    log.info("server_stopped")


# ── 헬스체크 ─────────────────────────────────────────────
@app.get("/health", tags=["system"])
async def health_check():
    log.info("health_check", status="ok")
    return {"status": "ok", "version": "0.1.0", "env": settings.APP_ENV}
