#!/usr/bin/env bash
# 운영(AWS) DB 덤프·복원·검증 도우미. 전체 절차와 배경은 docs/aws-db-migration.md.
#
#   scripts/aws_db.sh dump               로컬 DB → ~/swappy-dumps/ 에 덤프 2개(기준 데이터, 조은성 데모 계정)
#   scripts/aws_db.sh verify             AWS DB의 행 수를 로컬 DB와 견준다(읽기 전용)
#   scripts/aws_db.sh restore --yes      덤프를 **빈** AWS DB에 복원한다
#   scripts/aws_db.sh migrate --yes      AWS DB에 alembic upgrade head (백엔드 컨테이너로 실행)
#   scripts/aws_db.sh demo --yes         조은성 데모 계정을 지우고 최신 데모 덤프로 다시 올린다(다른 계정은 건드리지 않음)
#
# AWS 접속 정보는 저장소 루트의 `.env.aws`(커밋 금지, .gitignore에 있음)에서만 읽는다:
#     AWS_DATABASE_DSN=postgresql://사용자:URL인코딩한_비밀번호@호스트:5432/Master_database_name?sslmode=require
# 이 스크립트는 접속 정보를 출력하지 않는다(호스트 이름만 보여 준다). 채팅·이슈·PR에 붙여 넣지 마세요.
set -euo pipefail
cd "$(dirname "$0")/.."

DUMP_DIR="${DUMP_DIR:-$HOME/swappy-dumps}"
ENV_FILE="${AWS_ENV_FILE:-.env.aws}"
PG_IMAGE="${PG_IMAGE:-postgres:16-alpine}"       # pg_restore·psql 클라이언트(로컬 docker에 이미 있는 이미지)
LOCAL_DB_CONTAINER="${LOCAL_DB_CONTAINER:-swappy_postgres}"
DEMO_EMAIL="${DEMO_EMAIL:-eunseong@swappy.app}"

# 사용자 데이터 테이블 — 기준 데이터 덤프에서는 **구조만** 넣고 행은 뺀다(테스트 계정·세션이 운영에 섞이지 않게).
USER_TABLES="users profiles refresh_tokens diagnoses diagnosis_ranks closet_items cart_items likes orders order_items point_transactions recently_viewed reviews review_photos scan_results skin_analyses skin_analysis_images subscriptions user_consents gifts"
# 복원 뒤 행 수를 견주는 기준 데이터 테이블
CHECK_TABLES="products product_ingredients similarities product_skin_fit ingredient_functions ingredients brands categories quiz_questions quiz_options quiz_versions"

die() { echo "오류: $*" >&2; exit 1; }

local_psql() {
  local u d
  u=$(docker exec "$LOCAL_DB_CONTAINER" printenv POSTGRES_USER); d=$(docker exec "$LOCAL_DB_CONTAINER" printenv POSTGRES_DB)
  docker exec "$LOCAL_DB_CONTAINER" psql -U "$u" -d "$d" -X -At "$@"
}

# 대상 DSN을 읽고, 로컬·Neon이면 거부한다(잘못된 DB에 복원하는 사고 방지). 호스트 이름만 보여 준다.
load_target() {
  [ -f "$ENV_FILE" ] || die "$ENV_FILE 이 없습니다. AWS_DATABASE_DSN=... 한 줄을 적어 주세요(docs/aws-db-migration.md 3절)."
  AWS_DSN=$(grep -m1 '^AWS_DATABASE_DSN=' "$ENV_FILE" | cut -d= -f2- | tr -d '"'"'" || true)
  [ -n "$AWS_DSN" ] || die "$ENV_FILE 에 AWS_DATABASE_DSN 이 없습니다."
  HOST=$(printf '%s' "$AWS_DSN" | sed -E 's#^[a-z+]+://[^@]*@([^:/?]+).*#\1#')
  case "$HOST" in
    *neon.tech*) die "대상이 Neon입니다($HOST). 이 스크립트는 AWS 운영 DB 전용입니다." ;;
    localhost|127.*|postgres|*swappy_postgres*) [ "${ALLOW_LOCAL:-0}" = 1 ] || die "대상이 로컬($HOST)입니다. 시험할 때만 ALLOW_LOCAL=1을 주세요." ;;
  esac
  export PGDSN="${AWS_DSN/postgresql+asyncpg:/postgresql:}"
  echo "대상 DB 호스트: $HOST"
}

# 대상 DB 클라이언트(pg_restore·psql)는 docker 이미지로 실행한다. DSN은 환경 변수로만 넘겨 명령줄·로그에 남지 않게 한다.
# 긴 복원 중 네트워크 구간이 연결을 끊는 일이 있어(SSL SYSCALL error: EOF) TCP keepalive를 켠다.
keepalive() { case "$1" in *\?*) printf '%s&keepalives=1&keepalives_idle=20&keepalives_interval=10&keepalives_count=6' "$1" ;; *) printf '%s?keepalives=1&keepalives_idle=20&keepalives_interval=10&keepalives_count=6' "$1" ;; esac; }
dk() { docker run --rm -i -e PGDSN ${DOCKER_NET:+--network "$DOCKER_NET"} "$@"; }
psql_remote() { dk "$PG_IMAGE" sh -c 'psql "$PGDSN" -X -At -v ON_ERROR_STOP=1 "$@"' _ "$@"; }
# 읽기 전용 조회 한 번을 연결이 끊겨도 최대 6번까지 다시 시도한다(결과는 표준출력으로)
q_remote() { local i out; for i in 1 2 3 4 5 6; do if out=$(psql_remote "$@" </dev/null 2>/dev/null); then printf '%s' "$out"; return 0; fi; sleep 2; done; return 1; }
# pg_restore 인자... — 덤프는 /dump로 마운트해 파일로 읽는다(표준입력이 아니라 탐색 가능)
restore_remote() { dk -v "$DUMP_FILE:/dump:ro" "$PG_IMAGE" sh -c 'pg_restore -d "$PGDSN" --no-owner --no-privileges --exit-on-error "$@" /dump' _ "$@"; }

latest() { ls -t "$DUMP_DIR"/$1 2>/dev/null | head -1; }

cmd_dump() {
  mkdir -p "$DUMP_DIR"; chmod 700 "$DUMP_DIR"
  local stamp; stamp=$(date +%Y%m%d)
  local u d ex=""; u=$(docker exec "$LOCAL_DB_CONTAINER" printenv POSTGRES_USER); d=$(docker exec "$LOCAL_DB_CONTAINER" printenv POSTGRES_DB)
  for t in $USER_TABLES; do ex="$ex --exclude-table-data=$t"; done
  local cat="$DUMP_DIR/swappy_catalog_$stamp.dump"
  # shellcheck disable=SC2086
  docker exec "$LOCAL_DB_CONTAINER" pg_dump -U "$u" -d "$d" -Fc --no-owner --no-privileges $ex > "$cat"
  chmod 600 "$cat"
  echo "✔ 기준 데이터: $cat ($(du -h "$cat" | cut -f1))"

  # 데모 계정 한 명의 모든 데이터(로그인 세션 refresh_tokens만 뺀다). 적용할 때 먼저 그 계정을 지우므로 여러 번 돌려도 된다.
  local demo="$DUMP_DIR/swappy_demo_${DEMO_EMAIL%%@*}_$stamp.sql" me="(select id from users where email='$DEMO_EMAIL')"
  [ -n "$(local_psql -c "select 1 from users where email='$DEMO_EMAIL'")" ] || die "로컬 DB에 $DEMO_EMAIL 계정이 없습니다."
  {
    echo "-- $DEMO_EMAIL 계정의 모든 데이터(세션 제외). 기준 데이터 덤프를 복원한 뒤 적용한다. 비밀번호 해시가 있으니 공유 금지."
    echo "BEGIN;"
    echo "DELETE FROM users WHERE email='$DEMO_EMAIL';"      # 자식 행은 ON DELETE CASCADE
    for spec in "users|select * from users where email='$DEMO_EMAIL'" \
                "profiles|select * from profiles where user_id=$me" \
                "diagnoses|select * from diagnoses where user_id=$me order by id" \
                "diagnosis_ranks|select * from diagnosis_ranks where diagnosis_id in (select id from diagnoses where user_id=$me) order by diagnosis_id, rank" \
                "closet_items|select * from closet_items where user_id=$me order by id" \
                "cart_items|select * from cart_items where user_id=$me order by id" \
                "orders|select * from orders where user_id=$me order by id" \
                "order_items|select * from order_items where order_id in (select id from orders where user_id=$me) order by id" \
                "point_transactions|select * from point_transactions where user_id=$me order by id" \
                "recently_viewed|select * from recently_viewed where user_id=$me" \
                "scan_results|select * from scan_results where user_id=$me order by id" \
                "user_consents|select * from user_consents where user_id=$me" \
                "subscriptions|select * from subscriptions where user_id=$me" \
                "skin_analyses|select * from skin_analyses where user_id=$me order by created_at" \
                "skin_analysis_images|select * from skin_analysis_images where user_id=$me order by analysis_id, key"; do
      echo "COPY ${spec%%|*} FROM stdin;"
      local_psql -c "COPY (${spec#*|}) TO STDOUT"
      echo '\.'
    done
    echo "COMMIT;"
  } > "$demo"
  chmod 600 "$demo"
  echo "✔ 데모 계정: $demo"
}

cmd_restore() {
  [ "${1:-}" = "--yes" ] || die "운영 DB에 쓰는 작업입니다. 대상을 확인한 뒤 --yes를 붙여 다시 실행하세요."
  load_target
  PGDSN=$(keepalive "$PGDSN"); export PGDSN
  local cat demo; cat=$(latest 'swappy_catalog_*.dump'); demo=$(latest 'swappy_demo_*.sql')
  [ -n "$cat" ] || die "기준 데이터 덤프가 없습니다. 먼저 scripts/aws_db.sh dump"
  DUMP_FILE=$(cd "$(dirname "$cat")" && pwd)/$(basename "$cat"); export DUMP_FILE
  echo "덤프: $(basename "$cat")${demo:+, $(basename "$demo")}"
  # 빈 DB에만 복원한다. 이미 테이블이 있으면 중단한다(덮어쓰기·중복 방지).
  local n; n=$(psql_remote -c "select count(*) from information_schema.tables where table_schema='public'" </dev/null)
  [ "$n" = "0" ] || die "대상 DB에 이미 테이블이 $n개 있습니다. 빈 DB에만 복원합니다(새 DB를 만들거나 직접 비우세요)."

  # 목차에서 데이터가 있는 테이블과 시퀀스를 뽑는다
  local toc tables seqs; toc=$(docker run --rm -v "$DUMP_FILE:/dump:ro" "$PG_IMAGE" pg_restore --list /dump)
  tables=$(printf '%s\n' "$toc" | awk '/ TABLE DATA public /{print $(NF-1)}')
  seqs=$(printf '%s\n' "$toc" | awk '/ SEQUENCE SET public /{print $(NF-1)}')

  echo "▶ 1/3 구조(테이블·시퀀스) 만드는 중…"
  restore_remote --section=pre-data </dev/null || die "구조 생성에 실패했습니다. 대상 DB를 비운 뒤 다시 시도하세요."

  echo "▶ 2/3 데이터를 테이블 단위로 올리는 중(연결이 끊기면 그 테이블만 비우고 다시 올립니다)…"
  local t tries ok
  for t in $tables; do
    ok=0
    for tries in 1 2 3 4 5; do
      psql_remote -c "TRUNCATE TABLE public.\"$t\" CASCADE" </dev/null >/dev/null 2>&1 || true
      if restore_remote --section=data -t "$t" </dev/null >/dev/null 2>&1; then ok=1; break; fi
      echo "   · $t 실패($tries/5) — 비우고 재시도"; sleep 3
    done
    [ "$ok" = 1 ] || die "$t 를 올리지 못했습니다(5회). 네트워크 상태를 확인하세요."
    printf "   ✔ %-24s %s행\n" "$t" "$(q_remote -c "select count(*) from public.\"$t\"")"
  done
  for t in $seqs; do restore_remote --section=data -t "$t" </dev/null >/dev/null 2>&1 || echo "   · 시퀀스 $t 값 복원 실패(무시 가능, 5절 점검)"; done

  echo "▶ 3/3 인덱스·제약조건 만드는 중…"
  restore_remote --section=post-data </dev/null || die "인덱스·제약조건 생성에 실패했습니다. 대상 DB를 비운 뒤 처음부터 다시 시도하세요."

  if [ -n "$demo" ]; then echo "▶ 데모 계정 적용 중…"; psql_remote -q -f - < "$demo" >/dev/null; fi
  echo "✔ 복원 완료"; cmd_verify_inner
}

cmd_verify_inner() {
  local bad=0 t a b
  for t in $CHECK_TABLES; do
    a=$(local_psql -c "select count(*) from $t"); b=$(q_remote -c "select count(*) from $t")
    printf "  %-22s 로컬 %-8s AWS %-8s %s\n" "$t" "$a" "$b" "$([ "$a" = "$b" ] && echo 일치 || { bad=1; echo 불일치; })"
  done
  echo "  alembic: 로컬 $(local_psql -c 'select version_num from alembic_version') / AWS $(q_remote -c 'select version_num from alembic_version')"
  echo "  AWS 사용자 수: $(q_remote -c 'select count(*) from users')"
  [ "$bad" = 0 ] || die "행 수가 맞지 않는 테이블이 있습니다."
}
cmd_verify() { load_target; cmd_verify_inner; }

cmd_migrate() {
  [ "${1:-}" = "--yes" ] || die "운영 DB의 스키마를 바꾸는 작업입니다. 확인한 뒤 --yes를 붙여 다시 실행하세요."
  load_target
  echo "AWS alembic 현재: $(q_remote -c 'select version_num from alembic_version')"
  # 접속 정보는 환경 변수로만 넘긴다(-e 이름만 쓰면 값이 명령줄에 남지 않는다).
  # 출력은 "Running upgrade" 줄만 보여 준다 — 오류 메시지에 접속 문자열이 섞여 나올 수 있어 나머지는 버린다.
  local out; out=$(DATABASE_DSN="$PGDSN" docker exec -e DATABASE_DSN swappy_backend alembic upgrade head 2>&1) || echo "alembic 실패(출력은 접속 정보가 섞일 수 있어 숨김)"
  printf '%s\n' "$out" | grep -E "^INFO .*Running upgrade" || true
  echo "AWS alembic 이후: $(q_remote -c 'select version_num from alembic_version')"
}

cmd_demo() {
  [ "${1:-}" = "--yes" ] || die "운영 DB의 $DEMO_EMAIL 계정을 지우고 다시 올립니다. 확인한 뒤 --yes를 붙여 다시 실행하세요."
  load_target
  PGDSN=$(keepalive "$PGDSN"); export PGDSN
  local demo; demo=$(latest 'swappy_demo_*.sql'); [ -n "$demo" ] || die "데모 덤프가 없습니다. 먼저 scripts/aws_db.sh dump"
  echo "적용: $(basename "$demo")"
  psql_remote -q -f - < "$demo" >/dev/null
  local me="(select id from users where email='$DEMO_EMAIL')" t
  for t in profiles diagnoses closet_items orders user_consents subscriptions skin_analyses skin_analysis_images; do
    printf "  %-22s AWS %s행\n" "$t" "$(q_remote -c "select count(*) from $t where user_id=$me")"
  done
}

case "${1:-help}" in
  dump)    cmd_dump ;;
  restore) shift; cmd_restore "${1:-}" ;;
  verify)  cmd_verify ;;
  migrate) shift; cmd_migrate "${1:-}" ;;
  demo)    shift; cmd_demo "${1:-}" ;;
  *)       sed -n '2,12p' "$0" ;;
esac
