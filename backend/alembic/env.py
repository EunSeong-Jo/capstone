"""Alembic 환경 설정.

접속은 동기(psycopg2)로 한다. 마이그레이션은 요청당 동시성이 필요 없고,
Neon이 요구하는 sslmode를 psycopg2는 URL에서 그대로 읽기 때문이다.
(asyncpg는 sslmode를 이해하지 못해 별도 처리가 필요하다 — app/config.py 참고)
"""
from logging.config import fileConfig
from pathlib import Path
import sys

from alembic import context
from sqlalchemy import engine_from_config, pool

# backend/ 를 import 경로에 추가 (alembic은 backend/ 에서 실행)
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import settings  # noqa: E402
from app.models import Base  # noqa: E402  — 전 모델 import가 여기서 일어난다

config = context.config
# configparser는 %를 보간 문법으로 읽는다 — URL 인코딩된 비밀번호(%2B 등)가 있으면 %%로 이스케이프해야 한다.
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL_SYNC.replace("%", "%%"))

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=settings.DATABASE_URL_SYNC,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,        # 컬럼 타입 변경도 감지
            compare_server_default=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
