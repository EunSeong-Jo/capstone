# swappy 🌿

> 주제: AI 기반 프로필 맞춤 제품 추천 및 성분 유사도 대체품 매칭 서비스

회원가입 시 피부타입 진단 QnA로 사용자 프로필을 구축하여 8가지 피부타입 캐릭터 중 하나를 부여하고, 메인 화면에서 해당 프로필에 맞는 화장품 세트·조합을 추천합니다. 추천 제품 상세 페이지에서는 AI가 전성분을 분석해 성분 유사도가 높은 대체품을 매칭하며, 예산 입력 시 최적의 화장품 루틴 구매 가이드를 제시합니다.

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| **Frontend** | React 18 + TypeScript + Vite + Tailwind CSS |
| **Backend** | Python 3.11 + FastAPI |
| **Database** | PostgreSQL 16 (팀 공용은 **Neon**) + Redis 7 |
| **AI/ML** | scikit-learn (TF-IDF, 코사인 유사도), Tesseract + EasyOCR |
| **챗봇** | OpenAI / Anthropic 이중 프로바이더 (현재 기본값 `gpt-4o-mini`) |
| **인프라 (P0)** | Docker Compose (로컬) |
| **인프라 (P1)** | AWS EC2 |
| **모니터링** | Sentry + structlog (P0) / Prometheus + Grafana (P1) |

---

## 빠른 시작

```bash
# 1. 저장소 클론
git clone https://github.com/EunSeong-Jo/capstone.git
cd capstone

# 2. 환경변수 설정
cp .env.example .env
#    .env를 열어 DATABASE_DSN 에 Neon 연결 문자열을 붙여넣습니다.  ← 필수
#    Neon 조직 dmu 초대를 받으면 콘솔에서 확인할 수 있습니다.

# 3. 전체 스택 실행
docker compose up --build
```

**뜨는 컨테이너는 `backend`·`frontend` 둘뿐입니다.** 팀 공용 DB가 Neon이라 로컬 postgres·redis는 기본 기동에서 빠져 있습니다.

| 서비스 | URL |
|--------|-----|
| 프론트엔드 | http://localhost:3000 |
| 백엔드 API | http://localhost:8000/health |
| Swagger 문서 | http://localhost:8000/api/docs |

`DATABASE_DSN`이 비어 있으면 서버는 뜨지만 제품 API가 전부 실패합니다. 이 경우 기동 로그에 안내 문구가 출력되니 `docker compose logs backend`로 확인하세요.

<details>
<summary>Docker 없이 로컬에서 돌리기</summary>

터미널 두 개가 필요하고, 프론트에는 **프록시 대상을 지정해야 합니다.**

```bash
# 터미널 1 — 백엔드
cd backend && uvicorn app.main:app --reload

# 터미널 2 — 프론트엔드
cd frontend && VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev
```

`vite.config.ts`의 기본 프록시 대상은 Docker용(`http://backend:8000`)이라, 로컬 실행에서는 해석되지 않습니다.

</details>

<details>
<summary>로컬 PostgreSQL이 필요할 때</summary>

```bash
docker compose --profile local-db up
```

postgres·redis 컨테이너가 함께 뜹니다. 다만 **빈 DB**라 스키마와 데이터를 직접 넣어야 합니다.

```bash
cd backend && alembic upgrade head
python scripts/seed_ingredients.py
python scripts/load_products.py
```

</details>

> 🎨 **프론트엔드만 단독 개발**하거나 팀 공통 개발 기준(버전 통일·컨벤션·협업 규칙)이 필요하면 → **[frontend/README.md](frontend/README.md)** 참고

---

## 프로젝트 구조

```
capstone/
├── backend/                  # FastAPI 백엔드 → backend/README.md
│   ├── alembic/
│   │   └── versions/         # 마이그레이션 5개 (스키마 원본)
│   ├── app/
│   │   ├── main.py           # 앱 진입점 + Sentry/CORS 설정
│   │   ├── config.py         # 환경변수 관리 (pydantic-settings)
│   │   ├── logging_config.py # structlog 설정
│   │   ├── models/           # SQLAlchemy 모델 18개 (제품·사용자·진단·추천)
│   │   ├── db/               # Base, 비동기 세션
│   │   ├── api/              # chat.py (현재 유일한 라우터)
│   │   ├── services/         # llm.py, rag.py, rag_seed.py
│   │   ├── data_collection/  # 식약처 API + 올리브영 크롤러
│   │   └── utils/
│   │       └── ingredients.py # 전성분 파싱·정규화
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/                 # React 프론트엔드 → frontend/README.md
│   ├── src/
│   │   ├── pages/            # 라우팅 단위 페이지 15개 / 라우트 31개
│   │   │   ├── Splash/       # 앱 진입 스플래시
│   │   │   ├── Onboarding/   # 회원가입 온보딩
│   │   │   ├── QnA/          # 피부타입 진단 문답
│   │   │   ├── Result/       # 진단 결과
│   │   │   ├── Home/         # 메인 화면 (피부타입 맞춤 추천)
│   │   │   ├── Search/       # 텍스트·이미지 검색
│   │   │   ├── Scan/         # 성분표 촬영·스캔
│   │   │   ├── Category/     # 카테고리 메인 + 리스트(BEST/전체)
│   │   │   ├── ProductDetail/ # 제품 상세 (+ AI 분석 팝업)
│   │   │   ├── Detail/       # 상세 보조 화면
│   │   │   ├── Alternatives/ # 성분 유사 대체품
│   │   │   ├── Closet/       # 화장대 (+ 꾸미기)
│   │   │   ├── History/      # 히스토리 (최근 본·좋아요·자주 구매)
│   │   │   ├── Mypage/       # 마이페이지 (+ 서브페이지 11개)
│   │   │   └── Popup/        # 추천 세트 바텀시트
│   │   ├── components/       # layout, ui, home/oy, category, product 등
│   │   ├── mocks/            # ⚠️ 현재 모든 화면이 이 목업으로 동작
│   │   ├── hooks/            # localStorage 기반 최근 본·검색어 등
│   │   ├── context/          # LikedProductsContext
│   │   ├── types/
│   │   └── index.css         # Tailwind + 디자인 토큰
│   ├── tailwind.config.ts    # 브랜드 컬러 (primary: #3D8F6F)
│   ├── vite.config.ts        # /api → backend 프록시
│   └── Dockerfile
├── frontend_flash_demo/      # 스플래시·온보딩 모션 프로토타입 (별도 Vite 앱)
├── crawling/                 # 팀원 JS 크롤러 작업 폴더 (gitignore)
├── data/                     # CSV는 평문으로 커밋한다 (PR에서 diff를 보기 위해)
│   ├── raw/                  # 올리브영 수집 CSV
│   │                         #   oliveyoung_products.csv    5,000행 (적재 기준)
│   │                         #   oliveyoung_products_v5.csv 5,157행 (정제본, 미적재)
│   └── seed/                 # 대한화장품협회 성분사전
│       └── skin_type_ingredients/ # 피부타입별 성분 분류 → 같은 폴더 README.md
├── scripts/
│   ├── init_db.sh            # PostgreSQL 확장 설치 (Docker 전용)
│   ├── seed_ingredients.py   # 성분사전 → DB
│   ├── load_products.py      # v5 정제본 → DB (멱등, 보정 단계 없음)
│   ├── seed_skin_type_tags.py # 피부타입 성분 태그 → DB (멱등)
│   ├── compute_similarities.py # 단일제품 유사도 계산 (멱등)
│   ├── report_parse_residue.py # 파싱 잔해 보고서 (읽기 전용)
│   ├── find_typo_aliases.py  # 판매자 오타 → 표준명 후보 (읽기 전용)
│   ├── extract_ingredient_dict.py # 협회 PDF → CSV
│   └── ocr_benchmark/        # OCR 엔진 3종 비교 실험 + 보고서
├── docs/
│   ├── db-schema.md          # DB 스키마 정본
│   ├── PRD_swappy_v1.8.md    # 제품 요구사항 문서
│   ├── dev_guidelines.md     # 팀 개발 가이드라인
│   ├── frontend-component-guide.md
│   └── design/               # 프로토타입, 로고, 캐릭터·UI 에셋
├── .taskmaster/              # Task Master AI 설정
├── docker-compose.yml
└── .env.example
```

---

## 개발 현황

> 태스크 상태의 원본은 `.taskmaster/tasks/tasks.json`입니다. 아래는 2026-08-17 기준 대조 결과입니다.
> 태스크 **done 1 / in-progress 10 / pending 4** · 서브태스크 **done 30 / in-progress 9 / pending 64**

### 지금 어디까지 왔나

| 영역 | 상태 |
|---|---|
| **DB** | 테이블 18개 · 제품 **4,013** / 성분 **23,147** / 연결 **163,103** · 표준사전 매칭률 98.0% |
| **데이터 수집** | 올리브영 크롤러 + 협회 성분사전(21,910) 완료. 적재 파이프라인 멱등 |
| **프론트엔드** | 라우트 31개 · 페이지 15개. **단, API 호출 0건 — 전부 `src/mocks/` 목업** |
| **백엔드 API** | **엔드포인트 2개뿐** — `POST /api/v1/chat`, `GET /health` |
| **OCR** | 엔진 3종 벤치마크 38장 실측 완료. 프로덕션 코드는 아직 없음 |
| **인증·진단·추천** | 각 도메인 DB 스키마만 준비 |
| **테스트** | 저장소 전체에 테스트 코드 0건 |

**화면과 데이터가 각각 완성돼 가는데 둘을 잇는 API 층이 비어 있습니다.** 지금 데모를 돌리면 DB에 4,013개 제품이 있어도 화면 15개 중 13개에는 목업이 나옵니다.

### 태스크

| ID | 내용 | 상태 | 서브 |
|----|------|------|------|
| 1 | 프로젝트 환경 설정 (Docker·Sentry·structlog) | ✅ done | 6/6 |
| 2 | 제품 데이터 수집기 (식약처 API + 올리브영 크롤러) | 🔄 | 5/10 |
| 4 | 이미지 인식 모듈 (Tesseract + EasyOCR) | 🔄 | 3/5 |
| 5 | 프론트엔드 (메인·검색·상세·마이페이지 등) | 🔄 | 8/10 |
| 6 | 백엔드 API (검색·유사도·비교) | 🔄 | 1/5 |
| 7 | AI 챗봇 (LLM + RAG) | 🔄 | 1/5 |
| 9 | 서버 배포 및 모니터링 | 🔄 | 1/6 |
| 11 | 온보딩 UI 전체 흐름 | 🔄 | 2/8 |
| 12 | 회원가입 및 사용자 인증 (JWT + Soft-gate) | 🔄 | 1/7 |
| 13 | 피부타입 QnA 진단 엔진 | 🔄 | 1/8 |
| 14 | 프로필 기반 메인 화면 추천 엔진 | 🔄 | 1/8 |
| 3 | 성분 유사도 분석 엔진 (TF-IDF / Jaccard / RBO) | ⏳ | 0/8 |
| 8 | 성분 필터링 기능 | ⏳ | 0/5 |
| 15 | 예산 기반 구매 가이드 | ⏳ | 0/7 |
| 10 | 베타 테스트 및 피드백 수집 | ⏳ | 0/5 |

**"in-progress"의 폭이 넓습니다.** Task 12·13·14는 DB 스키마만 만들어진 상태이고, Task 5는 반대로 UI만 완성돼 있습니다.

### 다음 순서

의존 관계는 `12 → 13 → 3 → 6 → 프론트 연동` 입니다.

1. **Task 6** — 제품 목록·상세·검색 API 3개만 뚫어도 프론트가 실제 데이터로 붙습니다
2. **Task 3** — 유사도 배치가 `similarities` 테이블을 채워야 대체품 추천이 동작합니다
3. **Task 12 → 13** — 마이페이지·히스토리·진단 결과가 여기에 묶여 있습니다

---

## 데이터베이스

팀 공용 DB는 **Neon**(serverless PostgreSQL 16)입니다. 크롤링 결과가 한 사람 노트북에만 남는 문제를 없애기 위해 도입했습니다.

| 카테고리 | 제품수 | 평균 성분수 |
|---|---:|---:|
| 스킨케어 | 2,147 | 41.6 |
| 마스크팩 | 948 | 45.6 |
| 클렌징 | 888 | 33.7 |
| 선케어 | 167 | 52.9 |

얼굴용 4종만 적재합니다. 진단 5개 축이 전부 얼굴 기준이라 헤어·바디 추천은 근거가 없고, 메이크업은 `N종 택1` 기획세트가 호수별 전성분을 이어 붙여 데이터가 오염돼 있습니다.

```bash
# 팀원 로컬 세팅 — .env에 DATABASE_DSN을 넣은 뒤
cd backend && alembic upgrade head   # 테이블 18개 + pg_trgm
python scripts/seed_ingredients.py   # 성분사전 21,910 + 별칭 3,967
python scripts/load_products.py      # v5 정제본 → 제품 4,013 (멱등)
```

DSN은 커밋하지 않습니다. Neon 조직 `dmu` 초대로 각자 콘솔에서 확인합니다.

→ 스키마 전체는 **[docs/db-schema.md](docs/db-schema.md)**, 세팅·Alembic 주의사항은 **[backend/README.md](backend/README.md)**

---

## 🌿 프론트엔드 화면 브랜치 현황

각 팀원이 화면 단위 feature 브랜치로 작업했고, `dev`에 병합된 화면들은 **2026-07 UI 통일 작업에서 하나의 디자인 시스템으로 재구성**됐습니다(하단 네비·헤더 규격·배경색 통일, 검색 스캔 진입, 히스토리의 화장대 탭 통합 등). 상세 규격·통일 내역은 [frontend/README.md](frontend/README.md)의 `7-1 화면 규격 표준` 참고.

**✅ `dev` 병합 완료**

| 브랜치 | 화면 / 기능 | PR |
|--------|-------------|----|
| `home_es` | 홈(개인 대시보드·날씨·추천/대체품 캐러셀) + 프로젝트·PRD·환경 세팅 기반 | #9 |
| `search_jw` | 검색(통합/성분 검색, 최근·인기 검색어) | #12 |
| `category_yb` | 카테고리(좌측 사이드바 + 서브카테고리 목록) | #13 |
| `dg_mypage` | 마이페이지(프로필·주문/혜택/설정 메뉴, 고객센터·문의·챗봇 UI 서브페이지) | #14 |
| `history_misong` | 히스토리(최근 본·좋아요·자주 구매) — 현재는 화장대 화면 내부 탭으로 통합 | #15 |
| `flash_yb` | 스플래시 화면 + 온보딩 플로우 모션 프로토타입 | — |
| `rag-chatbot_jw` | RAG 기반 화장품 챗봇 (Task 7) | #17 |
| `OCR_yb` | OCR 엔진 벤치마크 | — |
| `dg_crawler` | 올리브영 크롤러 | — |
| `db_es` | Neon DB 스키마 18개 + 제품·성분 적재 | #24 #25 |

**🔧 미병합**

| 브랜치 | 내용 |
|--------|------|
| `detail_misong` | `dev` 대비 5커밋 앞서 있음 |

## 피부타입 캐릭터 (8종)

| 캐릭터 | 특성 | 추천 성분 방향 |
|--------|------|---------------|
| 수분팡팡 옹달샘 | 수분·유분 균형 (이상적 피부) | 가벼운 보습 유지 |
| 반질반질 물개 | 지성, 번들거림, 모공 | 살리실산, 논코메도제닉 |
| 겉바속촉 수부지 | 속건조 + 겉번들 | 히알루론산 + 가벼운 유분 조절 |
| 울긋불긋 화산 | 트러블·홍조·염증 | 시카, 판테놀, 진정 성분 |
| 바스락 사막 | 극건성, 당김 강함 | 세라마이드, 시어버터, 고보습 |
| 말랑말랑 인절미 | 건성·탄력 저하, 주름 | 레티놀, 펩타이드, 콜라겐 |
| 조심조심 유리구슬 | 민감성, 자극에 즉각 반응 | 저자극 인증, 무향, 무알코올 |
| 얼룩덜룩 메밀묵 | 색소침착·잡티·톤 불균형 | 나이아신아마이드, 비타민C |

---

## 문서

- [PRD v1.8](docs/PRD_swappy_v1.8.md) — 전체 제품 요구사항
- [개발 가이드라인](docs/dev_guidelines.md) — 디자인 시스템, API, DB 스키마
- [DB 스키마](docs/db-schema.md) — 테이블 18개·인덱스·적재 파이프라인 **(정본)**
- [백엔드 가이드](backend/README.md) — 로컬 세팅, Alembic, Neon 주의사항
- [프로토타입](docs/design/prototype.html) — 브라우저에서 열어 확인
- [Task Master](/.taskmaster/docs/prd.md) — 태스크 관리

---

## 팀

| 이름 | 역할 |
|------|------|
| EunSeong-Jo | 팀장 / 기획 / AI·ML |
