import sentry_sdk
import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.logging_config import configure_logging
from app.api.chat import router as chat_router
from app.api.products import router as products_router

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


app.include_router(chat_router)
app.include_router(products_router)


@app.on_event("startup")
async def startup() -> None:
    log.info("server_started", env=settings.APP_ENV, version="0.1.0")


@app.on_event("shutdown")
async def shutdown() -> None:
    log.info("server_stopped")


# ── 헬스체크 ─────────────────────────────────────────────
@app.get("/health", tags=["system"])
async def health_check():
    log.info("health_check", status="ok")
    return {"status": "ok", "version": "0.1.0", "env": settings.APP_ENV}
