#!/usr/bin/env bash
# 로컬 단독 실행용 데이터 덤프를 운영(AWS) DB에서 만든다(읽기 전용). 결과는 standalone/ 에 둔다.
#
#   scripts/standalone/make_dump.sh
#
# 만드는 것
#   standalone/catalog.dump.part*   제품·성분·유사도·궁합·퀴즈 등 기준 데이터 + 샘플 후기(실제 사용자 후기·계정은 제외)
#   standalone/demo_analysis.dump   조은성 데모 계정의 얼굴 분석 기록·이미지와 진단 이력(가져올 때 새 계정 ID로 바뀐다)
# 접속 정보는 .env.aws 의 AWS_DATABASE_DSN 에서만 읽고 출력하지 않는다(scripts/aws_db.sh 와 같은 규칙).
# 파일이 커서 GitHub 한 파일 제한·push 안정성을 위해 40MB 단위로 나눈다(start.ps1 이 이어 붙인다).
set -euo pipefail
cd "$(dirname "$0")/../.."

ENV_FILE="${AWS_ENV_FILE:-.env.aws}"
PG_IMAGE="${PG_IMAGE:-postgres:16-alpine}"
DEMO_EMAIL="${DEMO_EMAIL:-eunseong@swappy.app}"
OUT=standalone
TMP_NAME=swappy_standalone_tmp
TMP_PORT=55999
PART_SIZE=40m

# 사용자 데이터 테이블: 구조만 두고 행은 뺀다. reviews 는 샘플 후기만 따로 넣는다.
USER_TABLES="users profiles refresh_tokens diagnoses diagnosis_ranks closet_items cart_items likes orders order_items point_transactions recently_viewed reviews review_photos scan_results skin_analyses skin_analysis_images subscriptions user_consents gifts user_memories"

die() { echo "오류: $*" >&2; exit 1; }
[ -f "$ENV_FILE" ] || die "$ENV_FILE 이 없습니다(AWS_DATABASE_DSN=... 한 줄)."
AWS_DSN=$(grep -m1 '^AWS_DATABASE_DSN=' "$ENV_FILE" | cut -d= -f2- | tr -d "\"'")
[ -n "$AWS_DSN" ] || die "AWS_DATABASE_DSN 이 비었습니다."
case "$AWS_DSN" in *neon.tech*|*localhost*|*127.0.0.1*) die "운영(AWS) DSN이 아닙니다." ;; esac

aws_psql() { docker run --rm --network=host -i "$PG_IMAGE" psql "$AWS_DSN" -X -At "$@"; }
cleanup() { docker rm -f "$TMP_NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

echo "▶ 운영 DB에서 기준 데이터 덤프(사용자 테이블은 구조만)"
EX=""; for t in $USER_TABLES; do EX="$EX --exclude-table-data=$t"; done
WORK=$(mktemp -d); chmod 700 "$WORK"
docker run --rm --network=host -v "$WORK":/out "$PG_IMAGE" \
  pg_dump "$AWS_DSN" -Fc --no-owner --no-privileges $EX -f /out/prod_catalog.dump

echo "▶ 임시 Postgres에 복원하고 샘플 후기·데모 분석 기록을 채운다"
docker run -d --name "$TMP_NAME" --network=host -e POSTGRES_PASSWORD=tmp -e PGPORT=$TMP_PORT "$PG_IMAGE" -p $TMP_PORT >/dev/null
for _ in $(seq 1 40); do docker exec "$TMP_NAME" pg_isready -U postgres -p $TMP_PORT >/dev/null 2>&1 && break; sleep 1; done
docker exec "$TMP_NAME" psql -U postgres -p $TMP_PORT -X -qc "create database swappy" >/dev/null
tmp_psql() { docker exec -i "$TMP_NAME" psql -U postgres -p $TMP_PORT -d swappy -X -v ON_ERROR_STOP=1 "$@"; }
docker run --rm --network=host -v "$WORK":/out "$PG_IMAGE" \
  pg_restore -h 127.0.0.1 -p $TMP_PORT -U postgres -d swappy --no-owner --no-privileges /out/prod_catalog.dump 2>&1 | grep -v "^$" | head -5 || true

# 샘플 후기만(실제 사용자 후기 제외). 계정 FK가 없는 행이라 그대로 들어간다.
aws_psql -c "\copy (select * from reviews where is_sample) to stdout" | tmp_psql -c "\copy reviews from stdin"
# 데모 분석 기록: 계정이 이 DB에 없으므로 FK 검사를 끄고 넣는다(가져올 때 새 계정 ID로 바꾼다).
UID_DEMO=$(aws_psql -c "select id from users where email='$DEMO_EMAIL'")
[ -n "$UID_DEMO" ] || die "데모 계정을 찾지 못했습니다."
{
  echo "set session_replication_role = replica;"
  echo "\\copy skin_analyses from stdin"
  aws_psql -c "\copy (select * from skin_analyses where user_id='$UID_DEMO') to stdout"
  echo '\.'
  echo "\\copy skin_analysis_images from stdin"
  aws_psql -c "\copy (select * from skin_analysis_images where user_id='$UID_DEMO') to stdout"
  echo '\.'
  # 진단 이력: 화면은 진단 이력이 있으면 그 피부타입을, 없으면 데모 페르소나 값(옹달샘)을 쓴다 — 이력이 없으면 운영과 다르게 보인다
  echo "\\copy diagnoses from stdin"
  aws_psql -c "\copy (select * from diagnoses where user_id='$UID_DEMO') to stdout"
  echo '\.'
  echo "\\copy diagnosis_ranks from stdin"
  aws_psql -c "\copy (select r.* from diagnosis_ranks r join diagnoses d on d.id=r.diagnosis_id where d.user_id='$UID_DEMO') to stdout"
  echo '\.'
} | tmp_psql >/dev/null

echo "▶ 결과 덤프를 만들고 나눈다"
mkdir -p "$OUT"; rm -f "$OUT"/catalog.dump.part* "$OUT"/reviews.dump "$OUT"/demo_analysis.dump
tmp_dump() { docker exec "$TMP_NAME" pg_dump -U postgres -p $TMP_PORT -d swappy -Fc --no-owner --no-privileges "$@"; }
tmp_dump $EX > "$WORK/catalog.dump"                                          # 구조 + 기준 데이터(사용자 테이블 행 없음)
tmp_dump --data-only -t reviews > "$OUT/reviews.dump"                         # 샘플 후기
tmp_dump --data-only -t skin_analyses -t skin_analysis_images -t diagnoses -t diagnosis_ranks > "$OUT/demo_analysis.dump"   # 데모 분석 기록
split -b "$PART_SIZE" -d -a 2 "$WORK/catalog.dump" "$OUT/catalog.dump.part"
rm -rf "$WORK"

echo "✔ 완료"; ls -l "$OUT" | awk 'NR>1{print $5, $9}'
