from pathlib import Path
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

from pydantic_settings import BaseSettings

_BACKEND_DIR = Path(__file__).resolve().parents[1]   # backend/
_REPO_ROOT = _BACKEND_DIR.parent                      # 리포 루트

# asyncpg가 이해하지 못하는 libpq 전용 쿼리 파라미터.
# Neon DSN은 "?sslmode=require&channel_binding=require"로 끝나는데,
# 이걸 그대로 asyncpg에 넘기면 연결이 실패한다. SSL은 connect_args로 따로 준다.
_LIBPQ_ONLY_PARAMS = {"sslmode", "channel_binding", "options", "target_session_attrs"}


def _swap_driver(dsn: str, driver: str) -> str:
    """postgres:// · postgresql:// → postgresql+<driver>://"""
    scheme, rest = dsn.split("://", 1)
    return f"postgresql+{driver}://{rest}"


def _strip_libpq_params(dsn: str) -> str:
    parts = urlsplit(dsn)
    kept = [(k, v) for k, v in parse_qsl(parts.query) if k not in _LIBPQ_ONLY_PARAMS]
    return urlunsplit(parts._replace(query=urlencode(kept)))


class Settings(BaseSettings):
    # 앱
    APP_ENV: str = "development"
    SECRET_KEY: str = "dev-secret-key-change-in-production"

    # 인증 (Task 12)
    #
    # 액세스 토큰을 30분으로 짧게 두고 리프레시를 14일로 잡는다. 액세스는
    # 무효화할 방법이 없으므로(서명만 검증한다) 짧아야 하고, 리프레시는
    # refresh_tokens 테이블에 해시로 남아 revoked_at으로 즉시 끊을 수 있다.
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 14

    # DB
    # DATABASE_DSN이 있으면 그쪽이 우선한다 (Neon 등 관리형 DB).
    # 비어 있으면 아래 POSTGRES_* 를 조립한다 (Docker·로컬 설치).
    DATABASE_DSN: str = ""
    POSTGRES_HOST: str = "postgres"   # Docker 컨테이너명. 로컬은 localhost
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "swappy"
    POSTGRES_USER: str = "swappy"
    POSTGRES_PASSWORD: str = "swappy_dev"

    @property
    def DATABASE_URL(self) -> str:
        """앱 런타임용 (async). asyncpg는 libpq 파라미터를 받지 못한다."""
        if self.DATABASE_DSN:
            return _strip_libpq_params(_swap_driver(self.DATABASE_DSN, "asyncpg"))
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def DATABASE_URL_SYNC(self) -> str:
        """Alembic·적재 스크립트용 (sync). psycopg2는 sslmode를 그대로 쓴다."""
        if self.DATABASE_DSN:
            return _swap_driver(self.DATABASE_DSN, "psycopg2")
        return (
            f"postgresql+psycopg2://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def DB_REQUIRES_SSL(self) -> bool:
        """관리형 DB(Neon 등)는 SSL 필수. asyncpg에 connect_args로 전달한다."""
        return "sslmode=require" in self.DATABASE_DSN or "sslmode=verify" in self.DATABASE_DSN

    # Redis
    REDIS_HOST: str = "redis"
    REDIS_PORT: int = 6379

    @property
    def REDIS_URL(self) -> str:
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}"

    # CORS
    FRONTEND_URL: str = "http://localhost:3000"

    # Sentry (P0 모니터링 — DSN 없으면 비활성)
    SENTRY_DSN: str = ""

    # 로그
    LOG_LEVEL: str = "INFO"

    # LLM (챗봇)
    LLM_PROVIDER: str = "openai"          # "openai" | "claude"
    LLM_MODEL: str = "gpt-4o-mini"        # Claude 전환 시: "claude-sonnet-4-20250514"
    OPENAI_API_KEY: str = ""              # OpenAI API 키
    ANTHROPIC_API_KEY: str = ""           # Claude 전환 시 사용

    # 날씨 (홈 대시보드) — https://openweathermap.org 무료 티어 키
    OPENWEATHER_API_KEY: str = ""

    # 사진으로 화장품 찾기 (POST /products/scan) — 네이버 CLOVA OCR(General).
    # 측정 스크립트는 scripts/CLOVA_OCR/.env를 읽지만 백엔드는 이 설정(.env)을 읽는다.
    # 비어 있으면 스캔 API가 503을 낸다(화면은 제품명 검색으로 안내한다).
    CLOVA_OCR_SECRET: str = ""
    CLOVA_OCR_INVOKE_URL: str = ""

    # 호출 제한이 쓰는 클라이언트 IP. 프록시·로드밸런서 뒤에 둘 때만 true로 —
    # 그러면 X-Forwarded-For의 첫 주소를 쓴다(core/rate_limit.py).
    TRUST_PROXY_HEADERS: bool = False

    # 비회원 챗봇 하루 답변 수(IP 기준). 화면도 같은 수만큼 열어 둔다.
    GUEST_CHAT_DAILY_LIMIT: int = 3

    # env_file은 실행 위치가 아니라 파일 위치 기준으로 찾는다.
    # backend/ 에서 uvicorn을 띄우든 리포 루트에서 스크립트를 돌리든
    # 같은 .env를 읽어야 하기 때문. (Docker는 환경변수를 직접 주입하므로 무관)
    model_config = {
        "env_file": (str(_REPO_ROOT / ".env"), str(_BACKEND_DIR / ".env")),
        "extra": "ignore",
    }


settings = Settings()
