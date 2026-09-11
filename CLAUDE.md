# Claude Code Instructions

## Task Master AI Instructions
**Import Task Master's development workflow commands and guidelines, treat as if import is in the main CLAUDE.md file.**
@./.taskmaster/CLAUDE.md

---

## swappy — 프로젝트 현황

> 이 절은 실제 상태와 어긋나면 그때그때 고칩니다. 정기 갱신이 아니라 **틀렸을 때 고치는** 문서입니다.
> 태스크 상태의 원본은 `.taskmaster/tasks/tasks.json`이고, 아래 표는 그 값과 일치해야 합니다.
>
> 최종 대조: 2026-09-11

### 한눈에

| 영역 | 상태 |
|---|---|
| **DB** | Neon PostgreSQL 16 · 테이블 18개 · **제품 4,017 / 성분 23,519 / 연결 163,484 / 유사도 146,940** → [docs/db-schema.md](docs/db-schema.md) |
| **백엔드 API** | **엔드포인트 8개** — 제품 목록·검색·상세, 대체품 추천, 챗봇, 날씨, 케어문구, `GET /health` |
| **프론트엔드** | 라우트 31개 · 페이지 15개 구현. `src/api/` 클라이언트가 붙었지만 **실제로 호출하는 화면은 홈·챗봇 2개뿐**, 나머지 13개 화면은 여전히 `src/mocks/` 목업 |
| **테스트** | 백엔드 pytest **184건** (`backend/tests/` 6개 파일). 프론트는 여전히 0건 |

**지금 가장 크게 막고 있는 것은 프론트 연동입니다.** API와 데이터는 붙었는데(제품 조회·대체품 추천이 실제 DB를 읽습니다) 화면 15개 중 13개가 아직 목업을 보고 있어, 데모를 돌리면 DB의 4,017개 제품 대신 `src/mocks/`가 나옵니다.

### 태스크 현황

| ID | 제목 | 상태 | 서브태스크 | 우선순위 |
|----|------|------|-----------|---------|
| 1 | 프로젝트 환경 설정 | ✅ done | 6/6 | high |
| 2 | 제품 데이터 수집기 개발 | 🔄 in-progress | 5/10 (+1 진행) | high |
| 3 | 성분 유사도 분석 엔진 개발 | ⏳ pending | 0/8 | high |
| 4 | 이미지 인식 모듈 개발 | 🔄 in-progress | 3/5 (+1 진행) | high |
| 5 | 프론트엔드 개발 | 🔄 in-progress | 8/10 | high |
| 6 | 백엔드 API 개발 | 🔄 in-progress | 1/5 | high |
| 7 | AI 챗봇 개발 | 🔄 in-progress | 1/5 (+2 진행) | medium |
| 8 | 성분 필터링 기능 개발 | ⏳ pending | 0/5 | high |
| 9 | 서버 배포 및 모니터링 설정 | 🔄 in-progress | 1/6 | medium |
| 10 | 베타 테스트 및 피드백 수집 | ⏳ pending | 0/5 | low |
| 11 | 온보딩 UI 전체 흐름 개발 | 🔄 in-progress | 2/8 (+5 진행) | high |
| 12 | 회원가입 및 사용자 인증 시스템 | 🔄 in-progress | 1/7 | high |
| 13 | 피부타입 QnA 진단 엔진 개발 | 🔄 in-progress | 1/8 | high |
| 14 | 프로필 기반 메인 화면 추천 엔진 | 🔄 in-progress | 1/8 | high |
| 15 | 예산 기반 구매 가이드 개발 | ⏳ pending | 0/7 | high |

합계 — 태스크 done 1 / in-progress 10 / pending 4 · 서브태스크 done 30 / in-progress 9 / pending 64

**"in-progress"의 폭이 넓습니다.** Task 12·13·14는 DB 스키마만 만들어진 상태이고, Task 5는 반대로 UI만 완성돼 있습니다. 서브태스크까지 봐야 실제 위치를 알 수 있습니다.

### 다음 순서

의존 관계는 `12 → 13 → 3 → 6 → 프론트 연동` 입니다.

1. **Task 6** — 제품 목록·상세·검색 API 3개만 뚫어도 프론트가 실제 데이터로 붙습니다
2. **Task 3** — 유사도 배치가 `similarities` 테이블을 채워야 대체품 추천이 동작합니다
3. **Task 12 → 13** — 마이페이지·히스토리·진단 결과가 여기에 묶여 있습니다

---

## 작업 규칙

- 브랜치는 `dev`에서 분기하고 PR의 base도 항상 `dev`입니다 (`main` 아님)
- DB 스키마 원본은 `backend/app/models/`이고, 변경은 **Alembic 마이그레이션으로만** 합니다.
  `alembic revision --autogenerate`는 **rename을 감지하지 못해 DROP + CREATE를 만듭니다.** 테이블·컬럼 이름을 바꿀 때는 마이그레이션을 직접 작성하세요 — 자세한 내용은 [backend/README.md](backend/README.md)
- `.env`는 커밋하지 않습니다. Neon 조직 `dmu` 초대로 각자 DSN을 받습니다
- 프론트엔드 규격·컨벤션은 [frontend/README.md](frontend/README.md)의 `7-1 화면 규격 표준`을 따릅니다

### 문서 지도

| 문서 | 내용 |
|---|---|
| [docs/db-schema.md](docs/db-schema.md) | **DB 스키마 정본** — 테이블 18개, 인덱스, 적재 파이프라인 |
| [docs/PRD_swappy_v1.8.md](docs/PRD_swappy_v1.8.md) | 요구사항. §7.9 스키마는 설계 시점 안이라 실제와 다름 |
| [docs/dev_guidelines.md](docs/dev_guidelines.md) | 디자인 토큰, 화면별 체크리스트 |
| [backend/README.md](backend/README.md) | 로컬 세팅, Alembic, Neon 주의사항 |
| [frontend/README.md](frontend/README.md) | 프론트 개발 기준, 화면 규격 |

---

## GitHub 이슈 #8 개선 항목

출처: [이슈 #8: 캡스톤디자인 개선 방향 정리 (06/02)](https://github.com/EunSeong-Jo/capstone/issues/8)

2026-07 UI 통일 작업에서 일부가 반영됐습니다. 아래는 2026-08-17 기준 재확인 결과입니다.

### 📱 메인 화면
- [x] 스플래시(시작) 화면 추가 — `frontend/src/pages/Splash/`
- [x] 로그인 버튼 텍스트 변경 → "로그인하고 피부타입 진단해보기" (`pages/Onboarding/index.tsx`)
- [ ] 메인 화면 문구 3개 제거

### 🎨 디자인
- [ ] 현재보다 더 연한 초록 계열로 색상 조정 (추후 확정)

### 📋 피부 진단 (QnA)
- [ ] "타입 미리 정하기" 버튼 추가 — 피부타입을 이미 아는 사용자 대상

### 📊 진단 결과
- [ ] 피부타입 2순위·3순위 결과 표시 — DB `diagnosis_ranks` 테이블은 준비됨. Task 13 완료 후 연결

### 🛍️ 추천 화장품 (Home)
- [ ] 제품 사진 추가 — 현재 목업이 `picsum.photos`. DB에 `products.image_url`이 있어 Task 6 완료 시 해결
- [ ] "전체보기" 버튼 → "장바구니" 버튼 교체
- [ ] 정렬 옵션 추가 — 가격순 / 추천순

### 👤 마이페이지
- [ ] 피부타입 및 추천 항목 상단 고정

### 🔻 하단 내비게이션
- [x] 카테고리 탭 추가 — `frontend/src/components/home/oy/OyBottomNav.tsx`
- [x] 히스토리 탭 추가 — 동일 파일. 화장대 화면 내부 탭으로 통합됨

> 하단 네비의 현행 표준은 `components/home/oy/OyBottomNav.tsx`입니다.
> `components/layout/BottomNav.tsx`는 UI 통일 이전 컴포넌트입니다.
