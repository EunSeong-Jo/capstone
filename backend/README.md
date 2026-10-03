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
alembic downgrade <직전 revision>   # 1) DB를 먼저 되돌린다
# 2) 그 다음 PR을 revert
```

이미 revert해 버렸다면 지워진 파일을 임시로 되살려 downgrade합니다 — alembic은 파일이 있어야 그래프를 걸을 수 있어서, 이 단계를 건너뛸 수 없습니다.

```bash
F=backend/alembic/versions/<revision>_<이름>.py
git show <머지되기 전 커밋>:$F > $F   # 임시 복구
cd backend && alembic downgrade <직전 revision>
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
a0fd1f8a5d3a  product_names_en                영문 제품명 (OCR 대조)  ← head
```

`alembic history`로 언제든 실제 체인을 볼 수 있습니다. 이 표는 설명용이라 어긋나면 그때 고칩니다.

`d07012ddaaa9`는 신규 테이블만 만듭니다. 기존 18개를 건드리지 않으므로
`downgrade`로 정확히 되돌아갑니다.

---

## Neon을 쓰면서 알아야 할 것

**`pool_pre_ping=True`가 필수입니다.** Neon은 유휴 시 컴퓨트를 자동 절전시켜, 끊긴 커넥션을 재사용하면 실패합니다. `app/db/session.py`에 설정돼 있습니다.

**DB URL이 두 갈래인 이유** — Neon이 주는 DSN은 `?sslmode=require&channel_binding=require`로 끝나는데 이건 libpq 파라미터입니다.

| 용도 | 드라이버 | 처리 |
|---|---|---|
| 앱 런타임 | `postgresql+asyncpg` | 쿼리 파라미터 **제거** + `connect_args={"ssl": "require"}` |
| Alembic | `postgresql+psycopg2` | `sslmode=require` **유지** |

asyncpg에 libpq 파라미터를 그대로 넘기면 연결이 실패하고, psycopg2는 반대로 그걸 요구합니다. `config.py`의 `DATABASE_URL` / `DATABASE_URL_SYNC` 두 프로퍼티가 이걸 나눠 처리합니다.

**`CREATE EXTENSION`은 마이그레이션이 책임집니다.** Neon에는 `docker-entrypoint-initdb.d` 훅이 없어 `scripts/init_db.sh`가 실행되지 않습니다. `pg_trgm` 설치가 첫 마이그레이션에 들어 있는 이유입니다.

**`alembic.ini`의 `sqlalchemy.url`은 비워 둡니다.** DSN이 커밋되지 않도록 `env.py`가 `settings.DATABASE_URL_SYNC`를 주입합니다.

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
