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
    # True면 30초마다 SELECT 1을 보내 연결을 데워 둔다(요청 경로의 pre_ping 생략).
    # Neon은 유휴 5분이면 컴퓨트를 끄는데(scale to zero), 이 핑이 그것을 막아
    # 서버를 켜 둔 시간만큼 CU-hrs가 쌓인다. 그래서 기본은 False — 끊긴 연결은
    # pool_pre_ping이 요청 때 걸러 낸다. 상시 운영 서버에서만 True로 켠다.
    DB_KEEPALIVE: bool = False

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

    # 프론트엔드 빌드 결과(dist) 위치. 비어 있으면 정적 서빙을 끈다(개발 환경).
    STATIC_DIR: str = ""

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

    # 스캔 호출 한도 — CLOVA 무료 한도를 지키려는 장치(services/ocr_quota.py).
    # 허용 계정(쉼표로 구분한 이메일)은 한도에서 면제, 나머지는 하루(서울 날짜)
    # 계정당·전체 한도를 둔다. 초과하면 429, 화면이 제품명 검색을 안내한다.
    OCR_ALLOWED_EMAILS: str = ""
    OCR_USER_DAILY_LIMIT: int = 3
    OCR_GLOBAL_DAILY_LIMIT: int = 15

    # 얼굴 사진 AI 피부 분석 — Perfect Corp YouCam Skin Analysis (services/skin_photo.py).
    # 호출은 유닛을 쓴다(SD 5~8개 유형 12유닛, 9~12개 14유닛). 개발·테스트는 MOCK으로 돌린다.
    # 키가 없고 MOCK도 아니면 분석 API가 503을 낸다(화면은 QnA만으로 진단을 이어 간다).
    PERFECT_CORP_API_KEY: str = ""
    PERFECT_CORP_BASE_URL: str = "https://yce-api-01.makeupar.com/s2s/v2.0"
    PERFECT_CORP_MODE: str = "sd"          # "sd" | "hd" — 같은 사진에서 점수 거의 동일, SD가 더 싸다
    PERFECT_CORP_MOCK: bool = False        # True면 저장해 둔 응답을 쓴다(외부 호출·유닛 소모 없음)

    # 사진 분석 이용 한도 (services/skin_quota.py). 월 경계는 Asia/Seoul.
    # 무료는 얼굴 사진 수집에 동의한 사용자만, 구독자는 동의 + 활성 구독이 필요하다.
    SKIN_FREE_MONTHLY: int = 1
    SKIN_SUBSCRIBER_MONTHLY: int = 4

    # 사진 점수를 5축으로 옮길 때의 보정(services/skin_photo.to_axes). 건강한 피부는 점수가
    # 한쪽에 몰려 축 값이 낮게 나오므로 실측 뒤 조정한다. 기본값은 보정 없음.
    PHOTO_AXIS_GAIN: float = 1.0
    PHOTO_SKIN_TYPE_NUDGE: float = 1.0

    # 사진 점수를 QnA 점수와 섞는 비중(0~1). 사진을 쓰지 않은 진단은 항상 QnA 100%다.
    PHOTO_BLEND_WEIGHT: float = 0.4

    # 얼굴 사전 필터 임계값 (services/face_gate.py). 거절 로그와 실제 사진으로 조정한다.
    # 폭 비율은 Perfect Corp 요구(60%)보다 느슨하게 시작한다 — 검출기 상자가 얼굴보다
    # 조금 좁게 잡혀서 같은 기준을 쓰면 정상 사진이 걸러진다.
    FACE_MIN_SCORE: float = 0.8
    FACE_MIN_WIDTH_RATIO: float = 0.40
    FACE_MIN_LUMINANCE: float = 50.0

    # 얼굴 사진 수집 동의 문구의 버전. 문구(개인정보 처리방침)를 바꾸면 함께 올린다.
    FACE_CONSENT_VERSION: str = "2026-10-20"

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
