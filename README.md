# 대체뭐야 🌿

> 주제: AI 기반 프로필 맞춤 제품 추천 및 성분 유사도 대체품 매칭 서비스

회원가입 시 피부타입 진단 QnA로 사용자 프로필을 구축하여 8가지 피부타입 캐릭터 중 하나를 부여하고, 메인 화면에서 해당 프로필에 맞는 화장품 세트·조합을 추천합니다. 추천 제품 상세 페이지에서는 AI가 전성분을 분석해 성분 유사도가 높은 대체품을 매칭하며, 예산 입력 시 최적의 화장품 루틴 구매 가이드를 제시합니다.

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| **Frontend** | React 18 + TypeScript + Vite + Tailwind CSS |
| **Backend** | Python 3.11 + FastAPI |
| **Database** | PostgreSQL 16 + Redis 7 |
| **AI/ML** | scikit-learn (TF-IDF, 코사인 유사도), Tesseract + EasyOCR |
| **챗봇 (P1a)** | Claude API (`claude-sonnet-4-20250514`) |
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
# .env 파일을 열어 필요한 값 입력

# 3. 전체 스택 실행
docker compose up --build
```

| 서비스 | URL |
|--------|-----|
| 프론트엔드 | http://localhost:3000 |
| 백엔드 API | http://localhost:8000/health |
| Swagger 문서 | http://localhost:8000/api/docs |

> 🎨 **프론트엔드만 단독 개발**(Docker 없이 `npm run dev`)하거나 팀 공통 개발 기준(버전 통일·컨벤션·협업 규칙)이 필요하면 → **[frontend/README.md](frontend/README.md)** 참고

---

## 프로젝트 구조

```
capstone/
├── backend/                  # FastAPI 백엔드
│   ├── app/
│   │   ├── main.py           # 앱 진입점 + Sentry/CORS 설정
│   │   ├── config.py         # 환경변수 관리 (pydantic-settings)
│   │   └── logging_config.py # structlog 설정
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/                 # React 프론트엔드
│   ├── src/
│   │   ├── pages/            # 라우팅 단위 페이지
│   │   │   ├── Home/         # 메인 화면 (피부타입 맞춤 추천)
│   │   │   ├── Onboarding/   # 회원가입 온보딩
│   │   │   ├── QnA/          # 피부타입 진단 문답
│   │   │   ├── Search/       # 텍스트·이미지 검색
│   │   │   ├── Detail/       # 제품 상세 + 대체품 TOP 3
│   │   │   ├── Result/       # 검색 결과
│   │   │   ├── Mypage/       # 마이페이지
│   │   │   └── Popup/        # 신규 가입 유도 팝업
│   │   ├── components/
│   │   │   ├── layout/       # Header, BottomNav, PageWrapper
│   │   │   ├── product/      # ProductCard
│   │   │   ├── skin/         # SkinTypeBadge
│   │   │   └── ui/           # Button, Badge, Chip
│   │   ├── types/            # TypeScript 타입 정의
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css         # Tailwind + 디자인 토큰
│   ├── tailwind.config.ts    # 브랜드 컬러 (primary: #3D8F6F)
│   ├── vite.config.ts        # /api → backend 프록시
│   └── Dockerfile
├── scripts/
│   └── init_db.sh            # PostgreSQL 확장 자동 설치
├── docs/
│   ├── PRD_대체뭐야_v1.8.md  # 제품 요구사항 문서
│   ├── dev_guidelines.md     # 팀 개발 가이드라인
│   └── prototype.html        # 앱 화면 프로토타입
├── .taskmaster/              # Task Master AI 설정
├── docker-compose.yml
└── .env.example
```

---

## 개발 현황

### ✅ 완료

| 작업 | 내용 |
|------|------|
| PRD v1.8 작성 | 기능 요구사항, API 스펙, DB 스키마, 마일스톤 정의 |
| 프로토타입 | 8개 화면 HTML 프로토타입 (온보딩·QnA·메인·상세·검색·마이페이지 등) |
| 개발 가이드라인 | 디자인 토큰, 화면별 구현 체크리스트, API/DB 요약 |
| Task Master 설정 | 15개 태스크 / 103개 서브태스크 / 의존성 검증 완료 |
| **Task 1.1~1.5: 환경 설정** ✅ | Docker Compose (PostgreSQL·Redis·FastAPI·React), FastAPI 기본 앱, React+Vite+Tailwind 스캐폴딩, 볼륨·스크립트 설정, 전체 스택 검증 완료 |
| **Task 1.6: 로깅 설정** 🚧 | Sentry 에러 추적 + structlog 구조화 로깅 설정 (진행중, Sentry DSN 미설정) |

### 🚧 진행 예정 (P0 — 7월 완성 목표)

| Task | 내용 | 의존 |
|------|------|------|
| Task 2 | 제품 데이터 수집기 (식약처 API + 올리브영 크롤러) | Task 1 |
| Task 4 | 이미지 인식 모듈 (Tesseract + EasyOCR + OpenCV) | Task 1 |
| Task 12 | 회원가입 및 사용자 인증 (JWT + Soft-gate) | Task 1 |
| Task 13 | 피부타입 QnA 진단 엔진 (8타입 룰 기반) | Task 1, 2, 12 |
| Task 3 | 성분 유사도 분석 엔진 (TF-IDF / Jaccard / RBO) | Task 2 |
| Task 14 | 프로필 기반 메인 화면 추천 엔진 | Task 2, 3, 13 |
| Task 6 | 백엔드 API (검색·유사도·비교·Domain Adapter) | Task 3, 4 |
| Task 11 | 온보딩 UI 전체 흐름 | Task 12, 13, 14 |
| Task 5 | 프론트엔드 (메인·검색·상세·마이페이지 등) | Task 3, 4, 6 |

### 📋 P1a (8월) / P1b (9월)

| Task | 내용 |
|------|------|
| Task 7 | AI 챗봇 (Claude API + 프로필 컨텍스트 주입) |
| Task 8 | 성분 필터링 기능 |
| Task 15 | 예산 기반 구매 가이드 (그리디+빔서치) |
| Task 9 | AWS EC2 서버 배포 + Prometheus/Grafana |
| Task 10 | 베타 테스트 및 피드백 수집 |

---

## 피부타입 캐릭터 (8종)

| 캐릭터 | 특성 | 추천 성분 방향 |
|--------|------|---------------|
| 수분팡팡 옹달샘 | 수분·유분 균형 (이상적 피부) | 가벼운 보습 유지 |
| 반질반질 물개 | 지성, 번들거림, 모공 | 살리실산, 논코메도제닉 |
| 겉바속촉 수부지 | 속건조 + 겉번들 | 히알루론산 + 가벼운 유분 조절 |
| 울긋불긋 화산 | 트러블·홍조·염증 | 시카, 판테놀, 진정 성분 |
| 바스락 사막 | 극건성, 당김 강함 | 세라마이드, 시어버터, 고보습 |
| 말랑말랑 인절미 | 건성·탄력 양호 | 보습 + 안티에이징 |
| 조심조심 유리구슬 | 민감성, 자극에 즉각 반응 | 저자극 인증, 무향, 무알코올 |
| 얼룩덜룩 메밀묵 | 색소침착·잡티·톤 불균형 | 나이아신아마이드, 비타민C |

---

## 문서

- [PRD v1.8](docs/PRD_대체뭐야_v1.8.md) — 전체 제품 요구사항
- [개발 가이드라인](docs/dev_guidelines.md) — 디자인 시스템, API, DB 스키마
- [프로토타입](docs/prototype.html) — 브라우저에서 열어 확인
- [Task Master](/.taskmaster/docs/prd.md) — 태스크 관리

---

## 팀

| 이름 | 역할 |
|------|------|
| EunSeong-Jo | 팀장 / 기획 / AI·ML |
