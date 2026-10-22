# swappy 백엔드

FastAPI + SQLAlchemy 2.0 + Alembic. DB는 **Neon PostgreSQL 16**(팀 공용)을 씁니다.

> **현재 API는 2개뿐입니다** — `POST /api/v1/chat`, `GET /health`.
> 모델 18개와 적재 파이프라인은 준비됐지만 이를 쓰는 CRUD·라우터가 아직 없습니다(Task 6).

---

## 로컬 세팅

`.env`만 받으면 아래 3단계로 팀원 전원이 같은 상태에 도달합니다.

```bash
# 0. 의존성
pip install -r backend/requirements.txt

# 1. .env 준비 (리포 루트 또는 backend/ 아래 — 둘 다 인식)
cp .env.example .env
#    DATABASE_DSN 에 Neon 콘솔의 연결 문자열을 넣는다

# 2. 스키마 생성 (테이블 27개 + pg_trgm 확장)
cd backend && alembic upgrade head

# 3. 성분 사전 → DB (21,910 + 별칭 3,967)
python scripts/seed_ingredients.py

# 4. 제품 적재 (올리브영 CSV 5,000행 → 4,150 제품)
python scripts/load_products.py
```

**두 스크립트 모두 멱등합니다.** 몇 번을 돌려도 행수가 변하지 않으니 안심하고 재실행하세요.
DB에는 이미 적재돼 있어서 3·4번을 건너뛰어도 바로 쓸 수 있습니다.

> ⚠️ **2026-09-20 이후 처음 받는다면 컨테이너를 다시 빌드하세요.**
> ```bash
> docker compose build backend && docker compose up -d
> ```
> `requirements.txt`가 바뀌었습니다 — `email-validator`가 추가되고(인증 스키마가 씁니다)
> `passlib`이 빠졌습니다(bcrypt 5.x와 호환되지 않아 `bcrypt`를 직접 씁니다).
> 다시 빌드하지 않으면 `from app.schemas.user import ...`가 ImportError로 죽습니다.

DSN은 커밋하지 않습니다. Neon 조직 `dmu` 초대를 수락하면 각자 콘솔에서 확인할 수 있습니다.

---

## 구조

```
backend/
├── alembic/
│   ├── env.py                  # 동기(psycopg2) 마이그레이션 러너
│   └── versions/               # 마이그레이션 5개
├── app/
│   ├── main.py                 # 앱 진입점 · Sentry · CORS · 라우터 등록
│   ├── config.py               # 환경변수 (pydantic-settings)
│   ├── logging_config.py       # structlog
│   ├── db/
│   │   ├── base.py             # DeclarativeBase + TimestampMixin
│   │   └── session.py          # 비동기 엔진 · get_db() 의존성
│   ├── models/                 # 스키마 원본 (18개)
│   │   ├── product.py          #   제품·성분 8
│   │   ├── user.py             #   사용자·인증 3
│   │   ├── diagnosis.py        #   진단 5
│   │   └── recommendation.py   #   추천 2
│   ├── api/
│   │   └── chat.py             # 유일한 라우터
│   ├── services/
│   │   ├── llm.py              # OpenAI / Anthropic 이중 프로바이더
│   │   ├── rag.py              # 키워드 스코어링 검색 (벡터 아님)
│   │   └── rag_seed.py         # ⚠️ 임시 SQLite 저장소
│   ├── data_collection/        # 식약처 API · 올리브영 크롤러
│   └── utils/
│       └── ingredients.py      # 전성분 파싱·정규화
└── requirements.txt
```

스키마 전체는 **[docs/db-schema.md](../docs/db-schema.md)** 를 보세요.

---

## Alembic

### 스키마를 바꿀 때

```bash
# 1) app/models/ 의 모델을 고친다
# 2) 마이그레이션 생성
cd backend && alembic revision --autogenerate -m "설명"

# 3) 생성된 파일을 반드시 눈으로 확인한다  ← 건너뛰지 말 것
# 4) 적용 후 드리프트 확인
alembic upgrade head
alembic check          # "No new upgrade operations detected" 여야 한다

# 5) docs/db-schema.md 를 함께 갱신한다
```

### ⚠️ 마이그레이션이 든 PR을 revert하기 전에 DB를 되돌립니다

**PR을 revert해도 DB는 따라오지 않습니다.** 파일만 사라지고 `alembic_version`은 그 revision에 남습니다. 그러면 alembic이 "지금 어디인지"를 그래프에서 찾지 못해 **`current`·`upgrade`·`downgrade`·`check`가 전부 멈춥니다.**

```
$ alembic current
FAILED: Can't locate revision identified by 'a9c1e2f3d4b5'
```

DB가 공용이라 **그 순간 팀 전원이 같은 상태가 됩니다.** 올바른 순서는 이것입니다.

```bash
cd backend
grep down_revision alembic/versions/<revision>_<이름>.py   # 0) 되돌아갈 곳은 그 파일의 down_revision
alembic current                      # 1) 지금 DB가 <revision>(= head)인지 확인
alembic downgrade <down_revision>    # 2) DB를 먼저 되돌린다
# 3) 그 다음 PR을 revert
```

**되돌아갈 revision은 매번 파일에서 읽습니다.** 문서나 메모에 적힌 id는 그 뒤로 마이그레이션이 하나만 더 올라와도 틀린 값이 됩니다.

**1)에서 `current`가 `<revision>`이 아니면 멈추세요.** 그 위에 다른 마이그레이션이 이미 쌓였다는 뜻이고, 그 상태에서
`downgrade <down_revision>`은 **남의 마이그레이션까지 함께 내립니다** — 공용 DB라 그 사람의 테이블과 데이터가 사라집니다.
이때는 PR을 revert하지 말고, 되돌리는 내용을 담은 **새 마이그레이션**을 head 위에 올리세요(`upgrade()`에 원래 `downgrade()`의 내용).

이미 revert해 버렸다면 지워진 파일을 임시로 되살려 downgrade합니다 — alembic은 파일이 있어야 그래프를 걸을 수 있어서, 이 단계를 건너뛸 수 없습니다.
위의 1) 확인도 똑같이 거칩니다.

```bash
cd backend
F=alembic/versions/<revision>_<이름>.py
git show <머지되기 전 커밋>:backend/$F > $F   # 임시 복구
grep down_revision $F                 # 되돌아갈 곳
alembic current                       # <revision>(= head)인지 확인. 아니면 멈춘다
alembic downgrade <down_revision>
rm $F                                 # 다시 지운다 — 남기면 head가 둘이 되고
                                      # 다음 사람이 upgrade head로 되살린다
alembic current && alembic check      # 확인
```

손으로 `DROP`/`ALTER`를 쓰지 말고 **작성자가 쓴 `downgrade()`를 그대로 실행하세요.** FK 제약과 인덱스처럼 놓치기 쉬운 것이 순서대로 처리됩니다.

> 2026-10-01에 PR #64를 revert하면서 실제로 겪었습니다. 지워질 행을 먼저 덤프해 두는 것도 함께 권합니다.

### ⚠️ autogenerate는 rename을 감지하지 못합니다

테이블·컬럼 이름을 바꾸면 **DROP + CREATE를 만들어 데이터가 사라집니다.** 이 프로젝트에서 이미 세 번 겪었고, 그때마다 마이그레이션을 직접 작성했습니다.

```python
# 이렇게 직접 씁니다
op.rename_table("old_name", "new_name")
op.alter_column("table", "old_col", new_column_name="new_col")
op.execute('ALTER TABLE "t" RENAME CONSTRAINT "old" TO "new"')
op.execute('ALTER INDEX "old" RENAME TO "new"')
```

**따라오지 않는 것들** — 이름을 바꿔도 아래는 옛 이름 그대로 남습니다. 함께 정리하세요.

| 대상 | 방법 |
|---|---|
| PK·유일·외래키 제약 | `ALTER TABLE ... RENAME CONSTRAINT` |
| 명시적 인덱스 | `ALTER INDEX ... RENAME TO` |
| 시퀀스 | `ALTER SEQUENCE ... RENAME TO` |

유일 제약은 `RENAME CONSTRAINT`를 쓰세요. PostgreSQL이 제약과 뒷받침 인덱스 이름을 함께 관리하므로 한 번에 둘 다 바뀝니다. `ALTER INDEX`로 바꾸면 제약 이름과 어긋납니다.

**검증** — rename 마이그레이션은 `downgrade` → `upgrade` 왕복과 행수 대조까지 확인하고 커밋합니다.

### 현재 체인

```
f075ce1f838f  initial schema (phase 1)      테이블 18개 + pg_trgm
92851da8889b  products.ingredient_count_raw
a1b2c3d4e5f6  테이블·컬럼명 단순화            테이블 6 · 컬럼 14 rename
b2c3d4e5f6a7  유일 제약 옛 이름 정리
c3d4e5f6a7b8  similarities 컬럼명 + FK 제약
1795ba669ae7  products.rating/review_count 인덱스
d4e5f6a7b8c9  products.composition
e5f6a7b8c9d0  products.display_name
f6a7b8c9d0e1  products.volume_ml / volume_g
a7b8c9d0e1f2  products.volume_uncertain
b8c9d0e1f2a3  products.unit_count/unit_kind/unit_price/unit_label
d07012ddaaa9  Phase 2 개인 데이터 테이블 9개
929b93541c4a  gifts 테이블
2425accbef26  profiles.decoration_id          캐릭터 꾸미기
3f3233afae88  profiles.notifications_seen_at   알림 읽음 시각
952adbaa9665  ingredient_descriptions
a0fd1f8a5d3a  product_names_en                영문 제품명 (OCR 대조)
a9c1e2f3d4b5  order cancel/return · gift recipient · review photos
c3d9a1e7b2f4  skin_photo_tables               얼굴 사진 분석 (동의·구독·분석)  ← head
```

`alembic history`로 언제든 실제 체인을 볼 수 있습니다. 이 표는 설명용이라 어긋나면 그때 고칩니다.

`d07012ddaaa9`는 신규 테이블만 만듭니다. 기존 18개를 건드리지 않으므로
`downgrade`로 정확히 되돌아갑니다.

---

## Neon을 쓰면서 알아야 할 것

**`pool_pre_ping=True`가 필수입니다.** Neon은 유휴 시 컴퓨트를 자동 절전시켜, 끊긴 커넥션을 재사용하면 실패합니다. `app/db/session.py`에 설정돼 있습니다(`DB_KEEPALIVE=false`가 기본이라 항상 켜집니다).

**연결 유지 핑(`DB_KEEPALIVE`)은 기본으로 꺼 둡니다.** 켜면 30초마다 `SELECT 1`을 보내 Neon이 유휴 5분 후 꺼지지 못하고, 서버를 켜 둔 시간 내내 컴퓨트 시간(CU-hrs)이 쌓입니다. 무료 플랜 한도(월 약 100 CU-hrs)를 몇 주 만에 채운 적이 있습니다. 상시 운영 서버에서만 `DB_KEEPALIVE=true`로 켜세요.

**DB URL이 두 갈래인 이유** — Neon이 주는 DSN은 `?sslmode=require&channel_binding=require`로 끝나는데 이건 libpq 파라미터입니다.

| 용도 | 드라이버 | 처리 |
|---|---|---|
| 앱 런타임 | `postgresql+asyncpg` | 쿼리 파라미터 **제거** + `connect_args={"ssl": "require"}` |
| Alembic | `postgresql+psycopg2` | `sslmode=require` **유지** |

asyncpg에 libpq 파라미터를 그대로 넘기면 연결이 실패하고, psycopg2는 반대로 그걸 요구합니다. `config.py`의 `DATABASE_URL` / `DATABASE_URL_SYNC` 두 프로퍼티가 이걸 나눠 처리합니다.

**`CREATE EXTENSION`은 마이그레이션이 책임집니다.** Neon에는 `docker-entrypoint-initdb.d` 훅이 없어 `scripts/init_db.sh`가 실행되지 않습니다. `pg_trgm` 설치가 첫 마이그레이션에 들어 있는 이유입니다.

**`alembic.ini`의 `sqlalchemy.url`은 비워 둡니다.** DSN이 커밋되지 않도록 `env.py`가 `settings.DATABASE_URL_SYNC`를 주입합니다.

---

## 로컬 DB로 개발하기 (Neon CU-hrs를 쓰지 않기)

Neon 컴퓨트 시간은 팀 전체가 나눠 씁니다. 개발 중에는 로컬 Postgres에 Neon 데이터를 복원해 쓰면 Neon에 접속하지 않습니다.

```bash
# 1) Neon 덤프 (읽기만 함). 값은 .env에서 한 줄만 읽고 화면에 출력하지 않습니다.
#    연결이 중간에 끊기면 같은 명령을 다시 실행하세요. 큰 테이블은 -t 로 나눠 받으면 안정적입니다.
mkdir -p ~/neon_backup
docker run --rm -e DSN="$(grep '^DATABASE_DSN=' .env | tail -1 | cut -d= -f2-)" \
  -v ~/neon_backup:/out postgres:16-alpine \
  pg_dump "$DSN" -Fc --no-owner --no-privileges -f /out/swappy.dump

# 2) 로컬 DB 기동 (프로파일 local-db)
docker compose --profile local-db up -d postgres

# 3) 복원 (스키마 + 데이터)
docker run --rm --network capstone_swappy_net -v ~/neon_backup:/out -e PGPASSWORD=swappy_dev \
  postgres:16-alpine pg_restore -h postgres -U swappy -d swappy --no-owner --no-privileges /out/swappy.dump

# 4) 백엔드를 로컬 DB로 실행 (docker-compose.local.yml 이 DATABASE_DSN 만 덮어씀)
docker compose -f docker-compose.yml -f docker-compose.local.yml --profile local-db up -d
docker exec swappy_backend printenv DATABASE_DSN   # postgres:5432 가 나오면 로컬
```

- `.env`를 `source` 하지 마세요. DB 비밀번호가 출력에 남습니다.
- 덤프 파일에는 이메일·비밀번호 해시가 있습니다. 저장소 밖에 두고 커밋·공유하지 마세요.
- 로컬 DB는 덤프 시점의 스냅샷입니다. Neon에 마이그레이션이 올라가면 로컬에서도 `alembic upgrade head`가 필요합니다.
- 내릴 때는 같은 `-f` 조합으로 `down` 하세요. `down -v`는 복원한 데이터(`postgres_data` 볼륨)를 지웁니다.
- 그냥 `docker compose up`은 `.env`의 Neon으로 붙습니다.
- 덤프가 한 번에 안 되는 회선(WSL2 등)에서는 `pg_dump -s`로 스키마를, `-a -t public.<테이블>`로 테이블별 데이터를 따로 받아 같은 방식으로 복원하면 됩니다.

---

## 실행

```bash
# Docker (권장)
docker compose up backend

# 직접
cd backend && uvicorn app.main:app --reload
```

| | URL |
|---|---|
| 헬스체크 | http://localhost:8000/health |
| Swagger | http://localhost:8000/api/docs |
| ReDoc | http://localhost:8000/api/redoc |

---

## 알아둘 것

**챗봇의 RAG 저장소가 임시입니다.** `app/services/rag_seed.py`가 gitignore된 SQLite(`backend/data/products.db`)를 씁니다. 파일 상단 주석대로 PostgreSQL 전환이 필요하며, 함수 내부 교체만으로는 안 됩니다. 지금 DB에 제품 4,150건이 있으니 전환 시점입니다.

**Redis는 컨테이너만 떠 있고 코드에서 쓰지 않습니다.** `config.py`에 `REDIS_URL` 프로퍼티만 정의돼 있습니다. Task 14의 추천 캐싱에서 처음 쓰이게 됩니다.

**테스트 코드가 없습니다.** pytest가 `requirements.txt`에 없고 `tests/` 디렉터리도 없습니다. 지금까지의 검증은 전부 스크립트 수동 실행입니다.

**`data_collection/db_storage.py`의 `init_tables()`는 무력화돼 있습니다.** 스키마 정의를 Alembic으로 일원화하면서 경고만 출력하는 스텁으로 남겼습니다(`run_collection.py`가 아직 import합니다).

---

## 얼굴 사진 AI 분석 (Perfect Corp)

**선택 단계**입니다. 얼굴 사진을 `POST /api/v1/skin-analysis`로 올리면 서버가 분석 점수만
돌려주고, 진단 제출(`POST /profile/skin-quiz`)에 `analysisId`를 실으면 점수에 섞입니다.

| 제출 | 점수 |
|---|---|
| 전 문항 + `analysisId` | QnA와 사진을 `PHOTO_BLEND_WEIGHT`(0.4)로 혼합 |
| **일부 문항** + `analysisId` | 답한 문항이 건드린 축만 `PHOTO_PARTIAL_WEIGHT`(0.5)로 혼합, 나머지 축은 사진 값 그대로 |
| `answers` 없이 `analysisId`만 | 사진 5축 100% (`photoOnly`) |
| `analysisId` 없음 | QnA 100% |

사진만으로 8타입을 가르려면 5축(`oiliness·moisture·redness·age_spot·acne`)이 모두 필요하다 —
한 축이라도 빠지면 타입 한 쌍이 겹친다. 무료 8개 항목에 5축이 모두 들어 있다.
분석 이력은 `GET /api/v1/skin-analysis?limit=`(최신순)이다. 스키마와 한도 규칙은
[docs/db-schema.md](../docs/db-schema.md)의 "얼굴 사진 AI 분석"을 보세요.

```bash
# .env — 키는 https://yce.makeupar.com/api-console 에서 발급
PERFECT_CORP_API_KEY=...
PERFECT_CORP_MOCK=true     # 개발·테스트: 저장해 둔 응답(app/assets/perfect_corp_mock.json). 유닛이 들지 않는다
```

**호출은 유닛을 쓴다.** 분석 유형 수 구간별 정액이고 성공한 작업에만 차감됩니다
(SD 5~8개 12유닛 · 9~12개 14유닛 · 13~16개 16유닛, 실측으로 8개 = 12유닛 확인). 무료는 8개, 구독은 16개(SD 이름 전체)를 요청한다 — 구독 호출은 16유닛이다. 개발·테스트는 MOCK으로 하고
실제 호출은 연동 확인과 시연에만 쓰세요. 남은 유닛은
`GET https://yce-api-01.makeupar.com/s2s/v1.0/client/credit`(Bearer 키)로 봅니다.
키가 없고 MOCK도 아니면 분석 API는 503이고, 화면은 QnA만으로 진단을 이어 갑니다.

**요청 순서**(`app/api/skin_photo.py`): 동의(403) → 한도(402) → 사진 정리·EXIF 제거 → **얼굴 사전 필터**(422) →
Perfect Corp. 앞 단계의 거절과 외부 오류는 분석 행을 만들지 않아 **한도를 쓰지 않습니다.**

**얼굴 사전 필터**(`app/services/face_gate.py`): 얼굴이 아닌 사진을 외부로 보내기 전에 거릅니다.
OpenCV `FaceDetectorYN` + YuNet 모델(`app/assets/models/`, MIT, 230KB)을 쓰고, 규칙은 검출기와 분리돼 있어
단위 테스트됩니다. 임계값은 `FACE_MIN_*`(config.py)이며 거절 사유는 로그로 남습니다(사진은 남기지 않음).
YOLO(ultralytics)를 쓰지 않는 이유는 AGPL-3.0 라이선스와 PyTorch 용량 때문입니다.
화면(MediaPipe)도 같은 규칙으로 안내하지만 **최종 판정은 서버**입니다.

**분석 전에 AI가 사진을 먼저 검증합니다**(`services/face_gate.py`, OpenCV YuNet). 업체의 촬영 요구를 같은 기준으로 먼저
확인해, 부적합한 사진은 외부로 보내지 않고 이유를 알려 주며 **횟수도 쓰지 않습니다**: 얼굴 있음·한 명·잘림 없음·
얼굴 폭 60% 이상(두 눈 사이 거리 ÷ 0.45로 어림 — 검출 상자 폭은 얼굴보다 좁아 쓰지 않음, 업체가 정상 처리한 시험
사진이 상자 58.8%·어림 64%)·정면(눈 기울기 15°·코 치우침)·**가림 없음**(손·마스크·머리카락)·조명(너무 어둡거나 밝거나 한쪽만
밝음)·초점. 임계값은 `config.py`의 `FACE_*`. 위·아래 고개 숙임과 표정은 근거가 불안정해서 보지 않습니다.

**가림 검사**(`services/occlusion.py`)는 MediaPipe 이미지 분할 모델 `selfie_multiclass_256x256`(약 16MB, Apache-2.0)을
`ai-edge-litert`로 돌립니다. 픽셀을 배경·머리카락·몸 피부·얼굴 피부·옷·기타로 나눠, 얼굴 영역(볼·코와 입·턱)의 **얼굴 피부
비율**이 기준(`FACE_SKIN_MIN_*`: 볼 70%·코와 입 80%·턱 60%)에 못 미치면 그 부위가 가려졌다고 안내합니다(손은 몸 피부로
분류됨). 모델 파일은 저장소에 커밋하지 않습니다(`backend/app/assets/models/`, `.gitignore`) — 이미지를 빌드할 때
(`python -m app.services.occlusion`)나 처음 쓸 때 내려받고 SHA256을 확인합니다. **받지 못하거나 라이브러리를 못 읽으면 이
항목만 건너뜁니다**(체크리스트에서 "확인 못 함"). 로컬 개발은 `./backend`를 마운트하므로 처음 쓸 때 내려받아 호스트 폴더에
저장됩니다. 서버 한 번 검증은 약 0.3초(얼굴 검출 + 분할 + 밝기·선명도).

촬영 직후에는 `POST /api/v1/skin-analysis/check`로 같은 검증을 **미리** 돌려 이유를 알려 줍니다(분석 아님 — 업체 호출·한도
사용 없음, 동의한 사용자만, 하루 100회). 응답의 `items`는 항목별 결과(얼굴 인식·한 명만·얼굴 전체·얼굴 크기·정면·가림 없음·조명·초점)라서, 한 번에 걸린 항목을 모두 알려 줄 수 있습니다. 화면은 이것을 체크리스트로 보여 주고, 통과하지 못한 사진은 분석으로 보내지 못하게 막습니다. 분석 요청(`POST /skin-analysis`)도 같은 검증을 거칩니다.

**원본 사진은 저장하지 않습니다.** `prepare_photo`가 회전을 픽셀에 반영한 뒤 EXIF(GPS 포함)를 지운 JPEG를 새로
만듭니다. 업체가 돌려주는 항목별 분석 이미지(`mask_urls`, 2시간 만료 서명 URL)는 URL을 저장하지 않고, 분석 직후 서버가 받아
**디스크 볼륨**에 둡니다(`services/skin_images.py`). 받아 보면 마스크는 **얼굴 사진이 없는 투명 PNG**(표시할 부위에만 색,
1920×2560)이고, **원본 사진과 합성하지 않고 그대로** 저장하므로 얼굴 사진은 남지 않습니다. 화면이 중립 배경 위에 그립니다.
`resize_image`(원본을 줄인 것)는 받지 않습니다.

- 위치: `SKIN_IMAGE_DIR`(기본 `/data/skin_images`, docker 볼륨 `skin_images`) `/<user_id>/<analysis_id>/<항목>.png`.
  저장소 밖이라 git에 올라가지 않고, **PC·서버마다 따로 쌓입니다** — 공용 Neon DB를 다른 PC에서 보면 점수만 보이고
  이미지는 없습니다(`images`가 빈 배열). `docker compose down -v`는 볼륨을 지웁니다.
- 받는 법: `GET /api/v1/skin-analysis/{id}/images/{항목}` — 본인 것만(남의 id는 404). 응답의 `images`가 받을 수 있는 키입니다.
- 삭제: 동의 철회 시 사용자 폴더 전체, 계정 삭제 시에도 전체. 저장 실패는 분석을 막지 않습니다.
- 배포: `Dockerfile.prod`에 `VOLUME`이 있으니 실행할 때 볼륨을 붙이세요(안 붙이면 컨테이너 재생성 때 이미지가 사라집니다).

**SD와 HD**: 같은 사진에서 점수가 거의 같고(6개 중 5개 소수점까지 동일) SD가 더 싸서 SD가 기본입니다.
`PERFECT_CORP_MODE=hd`로 바꾸면 이름만 `hd_` 접두사로 바뀝니다(HD는 짧은 변 1080px 이상 필요).

**의존성**: `Pillow`, `opencv-python-headless`(4.x 고정 — 5.0은 새 메이저라 검증하지 않았습니다).

**마이그레이션 `c3d9a1e7b2f4`를 공용 Neon DB에 올리기 전에 팀에 알리세요.** 새 테이블 3개와 NULL 허용
컬럼 1개뿐이라 기존 데이터엔 영향이 없지만, 올리고 나면 이 리비전 파일이 없는 브랜치(`dev`)에서는
`alembic current`·`upgrade`가 멈춥니다 — **이 브랜치가 머지된 뒤에 올리는 것이 안전합니다.**
머지 전 검증은 로컬 Postgres로 했습니다:

```bash
docker run -d --rm --name pg_test -e POSTGRES_PASSWORD=testpw -e POSTGRES_DB=swappy_test -p 55432:5432 postgres:16-alpine
export DATABASE_DSN=postgresql://postgres:testpw@localhost:55432/swappy_test
alembic upgrade head && python scripts/seed_quiz.py && python scripts/seed_test_users.py
pytest tests/test_skin_photo_unit.py tests/test_skin_photo_api.py tests/test_auth.py tests/test_diagnosis.py
```

(제품 데이터가 필요한 기존 테스트는 Neon에서만 돕니다.)

---

## 인증 (Task 12)

`app/core/security.py` — bcrypt 해싱 + JWT. 액세스 30분 / 리프레시 14일이고,
리프레시는 갱신할 때마다 **회전**합니다(쓴 토큰은 즉시 폐기). `refresh_tokens`에는
SHA-256 해시만 남습니다.

**passlib을 쓰지 않습니다.** `requirements.txt`에 있던 passlib 1.7.4가 bcrypt 5.x와
맞지 않아 해싱 자체가 `ValueError`로 죽습니다(백엔드 탐지 프로브가 72바이트를 넘습니다).
2020년 이후 릴리스가 없어 bcrypt를 직접 씁니다. 해시 형식은 표준 bcrypt라
`scripts/seed_test_users.py`가 만든 것과 서로 검증됩니다.

### 데모 계정

```bash
python scripts/seed_test_users.py     # personas.json의 5명 → users/profiles/diagnoses
python scripts/seed_quiz.py           # 진단 문항 6개 → quiz_versions/questions/options
```

비밀번호는 전원 `swappy1234`입니다. 프론트 로그인 화면의 퀵 로그인 버튼이
이 계정들을 그대로 씁니다 — **서버 인증을 우회하지 않으므로** 시드를 안 돌리면
로그인도 실패합니다.

---

## 테스트

```bash
docker exec swappy_backend python -m pytest --ignore=tests/test_volume_parsing.py -q
```

`test_volume_parsing.py`는 `scripts/load_products.py`를 import하는데 컨테이너에
`scripts/`가 마운트되지 않아 수집 단계에서 실패합니다. 호스트에서는 그냥 `pytest`로 돕니다.

**쓰기 테스트가 생겼습니다** (`test_auth.py`·`test_personal.py`·`test_diagnosis.py`).
`conftest.py`가 적어 둔 "공용 Neon에 읽기 전용" 전제를 깨는 것이라, 이 파일들은
매번 `pytest-<uuid>@example.com` 계정을 새로 만들고 픽스처가 끝날 때 지웁니다.
개인 데이터는 전부 `user_id` FK에 ON DELETE CASCADE라 계정 하나만 지우면 함께 사라집니다.

**시드 계정(`eunseong@swappy.app` 등)은 읽기만 합니다.** 그쪽 비밀번호나 진단을
바꾸는 테스트를 넣으면 다른 팀원의 로컬 로그인이 깨집니다.
