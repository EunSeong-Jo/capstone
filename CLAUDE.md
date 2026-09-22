# Claude Code Instructions

## Task Master AI Instructions
**Import Task Master's development workflow commands and guidelines, treat as if import is in the main CLAUDE.md file.**
@./.taskmaster/CLAUDE.md

---

## swappy — 프로젝트 현황

> 이 절은 실제 상태와 어긋나면 그때그때 고칩니다. 정기 갱신이 아니라 **틀렸을 때 고치는** 문서입니다.
> 태스크 상태의 원본은 `.taskmaster/tasks/tasks.json`이고, 아래 표는 그 값과 일치해야 합니다.
>
> 최종 대조: 2026-09-20

### 한눈에

| 영역 | 상태 |
|---|---|
| **DB** | Neon PostgreSQL 16 · 테이블 28개 · **제품 4,013 / 성분 23,147 / 연결 163,103 / 유사도 146,940 / 계정 5** → [docs/db-schema.md](docs/db-schema.md) |
| **백엔드 API** | **엔드포인트 48개** — 제품(목록·검색·상세)·대체품·추천·인증(가입·로그인·갱신·로그아웃·비밀번호 변경)·프로필(닉네임·이메일)·진단·개인 데이터(화장대·장바구니·찜·최근본·주문·후기·포인트·스캔·선물)·챗봇·날씨·케어문구·`GET /health` |
| **프론트엔드** | 화면 라우트 37개(+리다이렉트 11) · 페이지 파일 35개. **제품 데이터는 전 화면이 실 API**를 봅니다. 개인 데이터는 로그인 시 서버, 비회원은 localStorage. 계정 화면은 `RequireAuth`가 게스트를 막습니다 |
| **테스트** | 백엔드 pytest **312건** 통과 (`backend/tests/` 11개 파일, `test_volume_parsing.py` 제외 — 컨테이너에 `scripts/`가 없어 수집 실패). 프론트는 여전히 0건 |

**제품 더미 데이터는 전부 걷어냈습니다.** 이전에는 `src/mocks/alternatives.ts` 등의 가짜 제품에 붙은 id(102~109 등)가 실재 카탈로그 id와 겹쳐, 카드에 적힌 것과 **전혀 다른 제품의 상세가 조용히 열렸습니다**. `npm run check:dummy`가 재발을 막습니다 — 배경은 [frontend/README.md](frontend/README.md) 7-2절.

남은 목업은 제품 id를 담지 않는 것들뿐입니다: 날씨·케어문구 오프라인 폴백(`mocks/home.ts`), 인기 검색어·성분 사전 문구(`mocks/search.ts`), 도메인 드롭다운(`mocks/oliveyoung.ts`), 실 API 캡처본(`mocks/products.fixture.json`).

### 태스크 현황

| ID | 제목 | 상태 | 서브태스크 | 우선순위 |
|----|------|------|-----------|---------|
| 1 | 프로젝트 환경 설정 | ✅ done | 6/6 | high |
| 2 | 제품 데이터 수집기 개발 | 🔄 in-progress | 5/10 | high |
| 3 | 성분 유사도 분석 엔진 개발 | ✅ 사실상 완료 | 유사도 146,940행 적재됨 | high |
| 4 | 이미지 인식 모듈 개발 | ⏸ 보류 | 엔진 벤치마크까지 (아래 참고) | high |
| 5 | 프론트엔드 개발 | 🔄 in-progress | 8/10 | high |
| 6 | 백엔드 API 개발 | 🔄 in-progress | 6.1·6.3·6.4·6.5 완료 · 6.2(OCR)만 남음 | high |
| 7 | AI 챗봇 개발 | 🔄 in-progress | 1/5 | medium |
| 8 | 성분 필터링 기능 개발 | 🔄 부분 | `skinType` 필터·`grade` 도출 완료 | high |
| 9 | 서버 배포 및 모니터링 설정 | 🔄 in-progress | 1/6 | medium |
| 10 | 베타 테스트 및 피드백 수집 | ⏳ pending | 0/5 | low |
| 11 | 온보딩 UI 전체 흐름 개발 | 🔄 in-progress | 2/8 | high |
| 12 | 회원가입 및 사용자 인증 시스템 | ✅ 12.1~12.5 완료 | 12.6(OAuth)·12.7만 남음 | high |
| 13 | 피부타입 QnA 진단 엔진 개발 | ✅ 13.1~13.8 완료 | 8타입 도달 가능성 검증 포함 | high |
| 14 | 프로필 기반 메인 화면 추천 엔진 | ✅ 14.2~14.5 완료 | 14.6·14.7(관리자 큐레이션 세트)만 남음 | high |
| 15 | 예산 기반 구매 가이드 개발 | ⏳ pending | 0/7 | high |

> ⚠️ **`.taskmaster/tasks/tasks.json`은 진척 판단에 쓸 수 없습니다.** 세 방향 모두로 틀립니다 — Task 3은 `pending`인데 완료됐고, Task 14.1은 `done`인데 해당 테이블(`admin_curated_sets` 등)이 존재한 적이 없으며(설계가 태그 기반으로 바뀌었습니다), Task 6.1·6.3은 `pending`인데 API가 돌고 있습니다. **`docs/db-schema.md`와 실제 DB가 정본입니다.**

### 다음 순서

1. **Task 15 (예산 가이드)** — 의존하던 Task 14·6이 열렸습니다. 단가 인프라(`unit_price` 생성 컬럼·인덱스)와 `profiles.budget_min/max`가 이미 있습니다
2. **Task 4.4 + 6.2 (OCR)** — 스캔 화면은 지금 제품명 검색으로 동작합니다. OCR은 최고 엔진(CLOVA)도 완전 실패가 44.4%라, 붙이기 전에 `products` 테이블 매칭 성공률부터 재는 것이 순서입니다 ([scripts/OCR_SUMMARY.md](scripts/OCR_SUMMARY.md) 결론)
3. **Task 12.6 (OAuth)** — 로컬 인증은 끝났습니다. 카카오·구글은 별개 작업입니다

---

## 작업 규칙

- 브랜치는 `dev`에서 분기하고 PR의 base도 항상 `dev`입니다 (`main` 아님).
  이름은 `기능_작업자이니셜` (`unitprice_es`, `category_yb`) — 자세한 내용은 [frontend/README.md](frontend/README.md) 8절
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

2026-07 UI 통일 작업에서 일부가 반영됐습니다. 아래는 2026-09-20 기준 재확인 결과입니다.

### 📱 메인 화면
- [x] 스플래시(시작) 화면 추가 — `frontend/src/pages/Splash/`
- [x] 로그인 버튼 텍스트 변경 → "로그인하고 피부타입 진단해보기" (`pages/Onboarding/index.tsx`)
- [ ] 메인 화면 문구 3개 제거

### 🎨 디자인
- [ ] 현재보다 더 연한 초록 계열로 색상 조정 (추후 확정)

### 📋 피부 진단 (QnA)
- [ ] "타입 미리 정하기" 버튼 추가 — 피부타입을 이미 아는 사용자 대상. `PATCH /api/v1/me/profile`의 `skinType`이 그 용도로 열려 있습니다(UI만 남음)

### 📊 진단 결과
- [x] 피부타입 2순위·3순위 결과 표시 — `POST /api/v1/profile/skin-quiz`가 `ranks` 3건을 내고 `diagnosis_ranks`에 남깁니다. 1·2순위가 붙으면 `borderline: true`로 경계 타입도 알립니다

### 🛍️ 추천 화장품 (Home)
- [x] 제품 사진 추가 — 전 화면이 `products.image_url`(4,013건 전부 실제 올리브영 CDN)을 씁니다. `picsum.photos`는 0건
- [x] "전체보기" 버튼 → "장바구니" 버튼 교체 — 마이페이지 쇼핑 메뉴에 장바구니(수량 표시)를 넣었습니다
- [x] 정렬 옵션 추가 — 카테고리 화면에 인기·평점·가격 오름/내림 4종 (`/category/:code`)

### 👤 마이페이지
- [ ] 피부타입 및 추천 항목 상단 고정

### 🔻 하단 내비게이션
- [x] 카테고리 탭 추가 — `frontend/src/components/home/oy/OyBottomNav.tsx`
- [x] 히스토리 탭 추가 — 동일 파일. 화장대 화면 내부 탭으로 통합됨

> 하단 네비의 현행 표준은 `components/home/oy/OyBottomNav.tsx`입니다.
> `components/layout/BottomNav.tsx`는 UI 통일 이전 컴포넌트입니다.
