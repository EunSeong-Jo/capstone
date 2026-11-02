# 운영 DB를 AWS(서울)로 — 덤프·복원·배포 절차

> 개발·테스트는 **Neon**(팀 공용), 운영은 **AWS DB**로 나눕니다. 이 문서는 AWS DB를 처음 만들고 로컬에서 만든 데이터를 올리는 절차입니다.
> 작성: 2026-10-26, 점검: 2026-10-31. 요금·화면 이름은 시기에 따라 달라질 수 있으니 AWS 콘솔의 현재 안내를 우선하세요.
>
> **이 문서의 숫자(테이블 37개, `alembic_version = d2e4f6a8b0c1`, 행 수)는 2026-10-26 복원 시점의 값입니다.** 이후 마이그레이션이 3개 늘어(`e3f5a7b9c1d2` 분석 이미지, `f4a6b8c0d2e3` 생성 후기, `a3f5c7d9e1b2` AI 기억) 현재 head는 `a3f5c7d9e1b2`, 테이블은 38개입니다. 운영에 반영하려면 6절 1번(`alembic upgrade head`)을 따릅니다.

## 1. 왜 AWS로 옮기나

| 이유 | 설명 |
|---|---|
| 속도 | AWS 서버(Lightsail)는 서울(`ap-northeast-2`), Neon DB는 미국 오하이오(`us-east-2`)입니다. 쿼리 한 번의 왕복이 약 200ms라 화면 하나에 쿼리가 여러 번이면 느립니다. 같은 서울 지역이면 1~2ms입니다. |
| 한도 | Neon은 연산 사용량(CU-시간) 한도가 있어 적재·배치로 한도가 차면 서버 DB 접속 자체가 막힙니다(2026-10 실제 발생). AWS 고정 플랜은 이런 한도가 없습니다. |
| 비용 구조 | 적재·쿼리 **건당 과금이 없습니다.** DB를 켜 둔 시간(고정비)과 저장 용량·외부 전송량으로 과금됩니다. |

| | 용도 | 접속 정보 |
|---|---|---|
| **Neon** | 개발·테스트(팀 공용) | 루트 `.env`의 `DATABASE_DSN` |
| **AWS DB** | 운영(실제 사용자) | 루트 `.env.aws`의 `AWS_DATABASE_DSN` (커밋 금지) |
| 로컬 Postgres | 내 PC 개발·pytest | docker compose |

## 2. 준비물: 덤프 두 개

`scripts/aws_db.sh dump`가 로컬 DB에서 `~/swappy-dumps/`(저장소 밖, 권한 700)에 만듭니다.

| 파일 | 내용 |
|---|---|
| `swappy_catalog_YYYYMMDD.dump` | **기준 데이터**: 제품·성분·유사도·궁합·성분 기능 라벨·진단 문항 등 + **전체 스키마(복원 당시 37개, 현재 38개 테이블)**. 사용자 데이터 테이블은 **구조만** 있고 행은 없다. 약 6MB |
| `swappy_demo_eunseong_YYYYMMDD.sql` | **조은성 데모 계정**(`eunseong@swappy.app`)과 그 프로필·진단 기록·화장대만 추린 데이터. 비밀번호 해시가 있어 공유 금지 |

기준 데이터 덤프에서 사용자 데이터를 뺀 이유: 로컬 DB의 사용자 43명 중 35명은 pytest가 남긴 테스트 계정이고, 세션 토큰(`refresh_tokens`)과 주문·후기도 섞여 있어 운영에 올리면 안 되기 때문입니다.
제외하는 테이블(`scripts/aws_db.sh`의 `USER_TABLES`): `users profiles refresh_tokens diagnoses diagnosis_ranks closet_items cart_items likes orders order_items point_transactions recently_viewed reviews review_photos scan_results skin_analyses skin_analysis_images subscriptions user_consents gifts user_memories`.

> `user_memories`(AI 기억)도 이 목록에 들어 있습니다(2026-10-31 추가). 사용자가 챗봇에게 한 말이 담기는 테이블이라 기준 덤프에 행이 섞이면 안 됩니다. 새 사용자 테이블을 만들 때는 `USER_TABLES`에도 넣으세요.

> 덤프에는 마이그레이션이 이미 적용된 스키마가 들어 있어(`alembic_version = d2e4f6a8b0c1`) AWS에서 `alembic upgrade`를 따로 돌릴 필요가 없습니다.
> 다른 데모 계정(최동균·박주원·심유빈·김미송)이 필요하면 복원 뒤 `python scripts/seed_test_users.py`(멱등)로 만들 수 있습니다.

## 3. AWS DB 만들기 (콘솔에서 직접)

Lightsail 콘솔 → **Databases → Create database**.

1. **리전**: 서울(`ap-northeast-2`) — 서버(Lightsail 컨테이너)와 같은 곳.
2. **엔진**: PostgreSQL **16** (로컬과 같은 메이저 버전). 확장 `pg_trgm`(제품명 퍼지 검색용)을 쓰므로, 만들기 전에 해당 엔진이 이 확장을 지원하는지 확인합니다. 복원 덤프가 `CREATE EXTENSION pg_trgm`을 실행하며, 권한 문제로 실패하면 복원이 중단됩니다.
3. **플랜**: 가장 작은 것으로 충분합니다(전체 DB 약 113MB). 부하가 늘면 나중에 올릴 수 있습니다.
4. **이름**: 데이터베이스 리소스 이름은 예) `swappy-db`. 만들 때 *Master database name*을 따로 입력하지 않으면 기본값 **`dbmaster`** 가 됩니다. **접속 문자열(DSN)의 DB 이름 자리에는 리소스 이름이 아니라 이 Master database name을 써야 합니다**(`swappy-db`를 쓰면 `database "swappy-db" does not exist`로 접속이 거부됩니다). 마스터 사용자(기본 `dbmasteruser`)·비밀번호는 안전한 곳(비밀번호 관리자)에 보관합니다.
5. 생성에는 몇 분이 걸립니다. 엔드포인트(호스트)·포트·사용자·DB 이름을 확인합니다.
6. **처음 적재하는 동안만** 상세 화면의 *Networking → Public mode*를 켜서 내 PC에서 접속할 수 있게 합니다(끝나면 5절에서 끕니다).

> ⚠️ 켜 두는 동안 월 요금이 붙습니다. 쓰지 않게 되면 **삭제**하세요. 삭제 전에 스냅샷이 필요한지 확인하세요.

### 접속 정보 파일 `.env.aws`

저장소 루트에 한 줄을 적습니다(**커밋되지 않습니다** — `.gitignore`에 등록돼 있습니다).

```
AWS_DATABASE_DSN=postgresql://사용자:비밀번호@엔드포인트:5432/dbmaster?sslmode=require
```

- **비밀번호의 특수문자는 URL 인코딩해야 합니다.** Lightsail이 만든 비밀번호에는 `[ ] ! # $ ...` 같은 문자가 섞여 있어, 그대로 두면 `psql`은 접속되지만 백엔드의 URL 해석(`urlsplit`)이 `[`에서 `Invalid IPv6 URL`로 실패합니다. 인코딩 방법: `python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" '비밀번호'` 결과를 DSN에 넣습니다(`[`→`%5B`, `@`→`%40`). 또는 콘솔에서 비밀번호를 영문·숫자만으로 다시 설정해도 됩니다.
- **이 값은 채팅·이슈·PR 본문에 붙여 넣지 마세요.** 스크립트는 호스트 이름만 출력합니다.
- 맨 처음에는 DB가 비어 있어야 합니다(생성 직후 `dbmaster`는 비어 있습니다).

## 4. 복원

```bash
cd capstone
scripts/aws_db.sh dump              # 최신 로컬 상태로 덤프를 다시 만들 때(이미 있으면 생략 가능)
scripts/aws_db.sh restore --yes     # 빈 AWS DB에 기준 데이터 + 조은성 계정 복원, 마지막에 행 수 검증
scripts/aws_db.sh migrate --yes     # 스키마만 올릴 때(alembic upgrade head). 서버는 시작할 때 마이그레이션을 돌리지 않는다
scripts/aws_db.sh demo --yes        # 조은성 계정을 지우고 최신 데모 덤프(세션 제외 전체)로 다시 올린다
scripts/aws_db.sh verify            # 언제든 로컬과 AWS의 행 수·alembic 버전을 견준다(읽기 전용)
```

`restore`의 동작과 안전장치:
- `--yes`가 없으면 실행하지 않고, **대상이 Neon이나 로컬이면 거부**합니다(잘못된 DB에 쓰는 사고 방지).
- **빈 DB에만** 복원합니다. 테이블이 이미 있으면 중단합니다.
- **3단계로 올립니다**: ① 구조(테이블·시퀀스) → ② 데이터를 **테이블 하나씩** → ③ 인덱스·제약조건. 인덱스를 데이터 뒤에 만들어 적재가 빠릅니다.
- **연결이 끊기면 그 테이블만 비우고 최대 5번 다시 올립니다.** 인터넷으로 올리는 구간에서 연결이 `server closed the connection unexpectedly` / `SSL SYSCALL error: EOF`로 불규칙하게 끊깁니다(서버는 재시작 없이 정상 가동 중이었음 — 네트워크 구간 문제). 한 번에 흘려 넣는 방식은 이 때문에 실패했고, 실제 AWS 적재에서도 일부 테이블이 1~3번 재시도 뒤에 성공했습니다. TCP keepalive도 켭니다. 읽기 조회(검증)도 재시도합니다.
- 소유자·권한 정보는 가져오지 않습니다(`--no-owner --no-privileges`). 오류가 나면 해당 단계에서 멈춥니다.
- 끝에 `products`·`product_ingredients`·`similarities`·`product_skin_fit`·`ingredient_functions` 등의 행 수와 `alembic_version`을 로컬과 견줍니다. 하나라도 다르면 실패로 끝납니다.
- 소요 시간: 약 113MB를 올리는 데 10분 안팎(재시도 포함, 회선에 따라 다름).

중간에 실패해 DB가 반쯤 채워졌다면 `restore`는 "이미 테이블이 있다"며 거부합니다. 그때는 **내가 방금 올린 데이터라는 것을 확인한 뒤** 스키마를 비우고 다시 실행합니다:
`echo 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;' | docker run --rm -i -e PGDSN postgres:16-alpine sh -c 'psql "$PGDSN" -f -'` (PGDSN은 `.env.aws`의 값).

**실제 결과(2026-10-26, AWS 서울 Lightsail PostgreSQL 16.15)**: 제품 4,402 · 제품-성분 178,758 · 유사도 105,620 · 궁합 35,216 · 성분 기능 라벨 1,686 · 성분 23,150 · 사용자 1명. 11개 기준 테이블 행 수·`alembic_version`(`d2e4f6a8b0c1`)이 로컬과 모두 일치하고, 인덱스 87·FK 48·확장(`pg_trgm`)·테이블 37개도 같습니다.
실제 FastAPI 앱을 AWS DB로 구동해 `/health`, 제품 목록(2,579건)·상세·성분 분석·유사 제품·검색·`pg_trgm` 매칭, 진단 문항, **조은성 계정 로그인(`swappy1234`) → 최신 진단·화장대 14개 조회**가 모두 200으로 동작함을 확인했습니다.

## 5. 서버가 새 DB를 쓰게 하기

1. **외부 접속을 닫습니다**: 복원이 끝나면 DB의 *Public mode*를 끕니다.
2. **서버(Lightsail 컨테이너)가 DB에 닿게** 합니다: 같은 계정의 Lightsail 컨테이너 서비스와 DB는 **VPC 피어링**을 켜면 비공개 주소로 통신합니다(Lightsail 콘솔 → *Account → Advanced → VPC peering*). 이 경우 DSN 호스트는 DB의 **private 엔드포인트**를 씁니다.
3. 컨테이너 서비스의 **환경 변수** `DATABASE_DSN`을 새 DB로 바꿉니다(Neon 값을 교체). `APP_ENV=production`, `STATIC_DIR` 등 나머지는 그대로입니다.
4. **최신 이미지로 재배포**합니다: 저장소 루트에서 `docker build -f Dockerfile.prod -t swappy .` → Lightsail 컨테이너 서비스에 푸시·배포(`aws lightsail push-container-image --service-name swappy --label web --image swappy:latest`). 이미지가 바뀔 때마다 Redis가 비워지는 점도 알아 두세요. 배포 절차 전체는 [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) 11장.
5. 확인:
   ```bash
   B=https://swappy.1r9x85xv4q310.ap-northeast-2.cs.amazonlightsail.com
   curl -s $B/health                                  # 200
   curl -s "$B/api/v1/products?size=1"                # 제품 1건 (이전에는 500)
   curl -s "$B/api/v1/products/281707/analysis"       # ⚠️ 제품 id는 DB마다 다르다 — 목록에서 받은 id를 쓰세요
   ```
   그리고 앱에서 조은성 계정(`eunseong@swappy.app` / `swappy1234`)으로 로그인해 홈·상세·성분 분석을 봅니다.

> 환경 변수에 DB 비밀번호를 넣을 때는 Lightsail 콘솔에서만 입력하고, 설정 파일을 저장소에 올리지 않습니다.

## 6. 앞으로의 운영 규칙 (DB가 둘이 되므로)

1. **마이그레이션은 Neon에서 먼저 시험한 뒤 AWS에 같은 순서로** 적용합니다. 새 revision이 생기면 운영에도 `alembic upgrade head`를 한 번 실행합니다.
   ```bash
   # 운영 적용 예 — DSN을 환경 변수로 덮어써 컨테이너에서 실행(값을 출력하지 않는다)
   AWS=$(grep '^AWS_DATABASE_DSN=' .env.aws | cut -d= -f2-)
   docker exec -e DATABASE_DSN="$AWS" swappy_backend alembic upgrade head
   ```
   실행 전에 `alembic current`로 대상이 AWS인지, **호스트가 Neon·로컬이 아닌지** 눈으로 확인하세요.
2. **기준 데이터(제품·성분·유사도·궁합)를 다시 계산하면** Neon과 AWS 양쪽에 같은 스크립트를 따로 돌려야 합니다(`compute_skin_fit.py`, `compute_similarities.py`, 필요 시 `load_products.py --options-only`). 로컬 DB를 다시 덤프해 새 빈 DB에 복원하는 방법도 있지만, 운영에 이미 사용자 데이터가 쌓였다면 **복원은 하지 않습니다**(빈 DB에만 되도록 막혀 있습니다).
3. 운영 데이터(계정·화장대·진단)는 AWS에만 있습니다. Neon에는 올리지 않습니다.
4. 제품 id는 DB마다 다릅니다. Neon과 AWS에서 같은 제품의 id가 같다고 가정하지 마세요(이 덤프로 만든 AWS DB의 id는 **로컬 DB와 같습니다**).
5. **백업**: Lightsail DB는 자동 백업(보관 기간은 플랜별)과 수동 스냅샷을 지원합니다. 큰 변경(마이그레이션, 재계산) 전에 스냅샷을 찍어 두세요.

## 7. 롤백·정리

| 상황 | 방법 |
|---|---|
| 복원이 잘못됨 | 새 DB를 만들거나 `swappy` DB를 비운 뒤(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`) `restore`를 다시 실행 |
| 서버가 새 DB로 안 붙음 | 컨테이너의 `DATABASE_DSN`을 이전 값으로 되돌리고 재배포(Neon 한도가 풀렸을 때만 의미 있음) |
| 임시로 쓰던 DB를 정리 | 콘솔에서 DB 삭제(과금 중단). 삭제는 되돌릴 수 없으므로 필요하면 스냅샷 먼저 |

## 8. 체크리스트

- [ ] Lightsail PostgreSQL 16 DB를 서울에 생성, 접속 정보를 안전하게 보관
- [ ] 루트 `.env.aws`에 `AWS_DATABASE_DSN` 작성(커밋되지 않음 확인: `git status`에 안 보여야 함)
- [ ] DB의 Public mode 켬 → `scripts/aws_db.sh restore --yes` → 모든 항목 `일치`
- [ ] Public mode 끔, VPC 피어링으로 서버 연결
- [ ] 컨테이너 `DATABASE_DSN` 교체 + 최신 이미지 재배포
- [ ] `/health`, 제품 목록, 앱 로그인(조은성 계정) 확인
- [ ] 앱을 AWS 주소로 빌드(`scripts/android.sh debug https://…`)해 폰에서 확인
