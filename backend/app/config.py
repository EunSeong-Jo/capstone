from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # 앱
    APP_ENV: str = "development"
    SECRET_KEY: str = "dev-secret-key-change-in-production"

    # DB
    POSTGRES_HOST: str = "postgres"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "swappy"
    POSTGRES_USER: str = "swappy"
    POSTGRES_PASSWORD: str = "swappy_dev"

    @property
    def DATABASE_URL(self) -> str:
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

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

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
