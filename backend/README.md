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

# 2. 스키마 생성 (테이블 18개 + pg_trgm 확장)
cd backend && alembic upgrade head

# 3. 성분 사전 → DB (21,910 + 별칭 3,967)
python scripts/seed_ingredients.py

# 4. 제품 적재 (올리브영 CSV 5,000행 → 4,150 제품)
python scripts/load_products.py
```

**두 스크립트 모두 멱등합니다.** 몇 번을 돌려도 행수가 변하지 않으니 안심하고 재실행하세요.
DB에는 이미 적재돼 있어서 3·4번을 건너뛰어도 바로 쓸 수 있습니다.

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
c3d4e5f6a7b8  similarities 컬럼명 + FK 제약   ← head
```

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

## 다음 작업 — Task 6

모델과 데이터는 준비됐는데 이를 노출하는 API가 없습니다. 우선순위가 높은 것부터:

1. `GET /api/v1/products` — 목록·필터(카테고리·브랜드·가격)·정렬
2. `GET /api/v1/products/{id}` — 상세 + 전성분(`position` 순)
3. `GET /api/v1/products/search` — `idx_products_name_trgm` 활용 부분일치

이 3개만 있어도 프론트엔드가 `src/mocks/`를 벗고 실제 데이터로 붙습니다.
