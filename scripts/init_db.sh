#!/bin/bash
# PostgreSQL 초기화 스크립트
# Docker 컨테이너 최초 실행 시 자동으로 실행됩니다.

set -e

echo "▶ PostgreSQL 초기화 시작..."

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- pg_trgm: 퍼지 검색 (텍스트 검색 API에 필요)
    CREATE EXTENSION IF NOT EXISTS pg_trgm;

    -- uuid-ossp: UUID 기본값 생성
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    RAISE NOTICE '확장 모듈 설치 완료: pg_trgm, uuid-ossp';
EOSQL

echo "✅ PostgreSQL 초기화 완료"
