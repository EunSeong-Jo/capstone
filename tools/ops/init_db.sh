#!/bin/bash
# PostgreSQL 초기화 스크립트
# Docker 컨테이너 최초 실행 시 자동으로 실행됩니다.

set -e

echo "▶ PostgreSQL 초기화 시작..."

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- pg_trgm: 퍼지 검색 (텍스트 검색 API에 필요)
    -- 참고: Alembic 첫 마이그레이션도 같은 확장을 설치한다. Neon 등 관리형 DB는
    -- 이 스크립트를 실행하는 Docker 훅이 없어 마이그레이션이 책임져야 하기 때문.
    -- 여기서도 설치해 두면 Docker 환경에서 마이그레이션 전에 확장이 준비된다.
    CREATE EXTENSION IF NOT EXISTS pg_trgm;

    -- uuid-ossp는 설치하지 않는다.
    -- PostgreSQL 13부터 gen_random_uuid()가 코어에 내장돼 확장이 필요 없다.

    DO \$\$
    BEGIN
        RAISE NOTICE '확장 모듈 설치 완료: pg_trgm';
    END
    \$\$;
EOSQL

echo "✅ PostgreSQL 초기화 완료"
