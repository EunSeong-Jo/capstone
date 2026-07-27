# 대체뭐야 — Frontend

화장품 **성분 기반 대체품 추천 + 개인 맞춤(피부타입)** 모바일 웹앱의 프론트엔드입니다.
이 문서는 **팀 공통 개발 기준**입니다. 작업 전 반드시 한 번 읽어주세요.

> 상세 디자인 시스템·컴포넌트 카탈로그는 [`docs/frontend-component-guide.md`](../docs/frontend-component-guide.md), 화면별 체크리스트는 [`docs/dev_guidelines.md`](../docs/dev_guidelines.md) 참고.

---

## 1. 기술 스택 (버전 고정)

코드를 합칠 때 충돌을 막기 위해 **아래 버전을 임의로 올리지 마세요**. 버전 변경이 필요하면 팀 합의 후 진행합니다.

| 구분 | 패키지 | 버전 |
|---|---|---|
| 프레임워크 | react / react-dom | `18.3.1` |
| 라우팅 | react-router-dom | `6.28.0` |
| 빌드 | vite | `6.x` |
| 언어 | typescript | `5.6.x` |
| 스타일 | tailwindcss | `3.4.x` |
| 모바일 셸 | @capacitor/core · cli | `8.3.4` |
| 린트 | eslint (+ typescript-eslint) | `9.x` |

UI/아이콘/상태관리 **외부 라이브러리는 없습니다.** (Ionic·MUI·lucide·zustand 등 미사용 — 컴포넌트·아이콘은 자체 제작/인라인 SVG)

---

## 2. 환경 통일 ⭐ (가장 중요)

팀원마다 환경이 다르면 `npm install` 결과가 갈려 충돌·빌드 오류가 납니다. 아래를 지켜주세요.

- **Node: `22 LTS`** — 저장소의 [`.nvmrc`](.nvmrc) 기준. `nvm use`로 맞추세요. (Vite 6는 18+ 동작하나 팀 기준은 22)
- **패키지 매니저: `npm` 고정** — `yarn`·`pnpm` 사용 금지 (lock 파일이 갈라집니다)
- **설치는 `npm ci` 권장** — `package-lock.json` 기준으로 **모두 동일한 버전** 설치
- **의존성 추가 시 규칙**:
  1. 정말 필요한지 먼저 논의 (외부 라이브러리 최소화가 원칙)
  2. 추가하면 바뀐 `package.json` + `package-lock.json`을 **함께 커밋**하고 PR 설명에 명시
  3. 팀에 공유 → 다른 팀원은 `npm ci`로 재설치

---

## 3. 환경 설정 & 설치

빈 환경에서 처음부터 따라 할 수 있는 가이드입니다.

### 3-1. 사전 요구사항
| 도구 | 설명 |
|---|---|
| **Git** | 저장소 클론 |
| **nvm** | Node 버전 관리 (팀 버전 통일을 위해 **권장**) |
| **Node 22 LTS** | nvm으로 설치 (아래) |
| **npm** | Node에 번들 — 별도 설치 불필요 (yarn/pnpm 금지) |

### 3-2. nvm + Node 설치
**macOS / Linux / WSL**
```bash
# nvm 설치 (이미 있으면 생략)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# 터미널 재시작 후
nvm install 22 && nvm use 22
node -v   # v22.x 확인
```
**Windows**: [nvm-windows](https://github.com/coreybutler/nvm-windows/releases) 설치 후 `nvm install 22.x.x` → `nvm use 22.x.x`. (WSL 사용을 더 권장)

> 저장소에 [`.nvmrc`](.nvmrc)가 있어 `frontend/`에서 `nvm use`만 쳐도 Node 22가 자동 적용됩니다.

### 3-3. 설치 & 실행
> ⚠️ 모노레포라 **반드시 `frontend/` 디렉토리 안에서** 실행하세요(저장소 루트 아님).

```bash
git clone <repo-url>
cd capstone/frontend   # ← frontend 안으로 이동
nvm use                # .nvmrc(Node 22) 적용
npm ci                 # lock 기준 설치 (모두 동일 버전). lock 없을 때만 npm install
npm run dev            # 개발 서버 실행 (vite --host)
```

`vite --host`라 터미널에 출력되는 `Local`/`Network` 주소로 접속합니다. 같은 와이파이의 휴대폰에서 `Network` 주소로 모바일 화면을 바로 확인할 수 있습니다.

### 3-4. 설치 트러블슈팅
| 증상 | 원인 / 해결 |
|---|---|
| `engine`/문법 오류, 빌드 실패 | Node 버전 불일치 → `nvm use` (또는 `nvm install 22`) 후 재시도 |
| `npm ERR! ERESOLVE ... peer dependency` | 의존성 peer 충돌 → 먼저 버전을 맞춰 설치(예: 메이저 고정 `pkg@^9`). 임시로 `npm install --legacy-peer-deps`도 가능하나 **lock에 반영되므로 팀 공유 필수** |
| `Port 5173 is in use` | 다른 dev 서버 실행 중 → 기존 프로세스 종료 또는 `npm run dev -- --port 5174` |
| WSL인데 윈도우 브라우저에서 안 열림 | `--host`(이미 적용됨)로 뜬 `Network` 주소 사용. 윈도우 방화벽 허용 필요할 수 있음 |
| 설치가 꼬였을 때 | `npm ci`로 **lock 기준 재설치**(클린 설치). `node_modules`를 임의 삭제 후 `npm install`은 버전이 갈릴 수 있어 지양 |

---

## 4. 스크립트

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버(HMR) |
| `npm run build` | 타입체크(`tsc -b`) + 프로덕션 빌드 |
| `npm run preview` | 빌드 결과 로컬 미리보기 |
| `npm run lint` | ESLint 검사 |

---

## 5. 테스트 · 검증 방법

현재 **단위 테스트 프레임워크는 없습니다.** PR 올리기 전 아래 3가지로 검증합니다.

```bash
npx tsc --noEmit     # ① 타입 에러 0 확인
npm run build        # ② 빌드 성공 확인 (타입체크 포함)
npm run lint         # ③ 린트 통과 확인
npm run dev          # ④ 브라우저에서 실제 동작 수동 확인
```

PR 체크리스트: **위 ①②③ 통과 + 변경 화면 수동 확인**.

> 향후 자동화 테스트가 필요해지면 **Vitest + React Testing Library** 도입을 권장합니다(현재 P0 범위 밖).

---

## 6. 디렉토리 구조 & 배치 규칙

```
frontend/
├─ public/            # 정적 에셋 (마스코트 이미지 등) → /경로로 서빙
├─ src/
│  ├─ pages/          # 화면 단위. 페이지당 폴더: pages/{PascalCase}/index.tsx
│  ├─ components/     # 재사용 컴포넌트
│  │  ├─ ui/          # 원자 단위: Button, Chip, Badge
│  │  ├─ layout/      # PageWrapper, Header, BottomNav
│  │  └─ {feature}/   # 기능별 묶음 (product/, skin/ 등)
│  ├─ types/index.ts  # 공용 타입 (SkinType, Product, Alternative …)
│  ├─ mocks/          # 목업 데이터 (API 연동 전)
│  ├─ App.tsx         # 라우트 정의
│  └─ index.css       # CSS 변수 + Tailwind + 커스텀 유틸(.glass, .scrollbar-hide)
```

**규칙**
- 새 화면 → `pages/{이름}/index.tsx` + `App.tsx`에 라우트 추가
- 특정 화면 전용 컴포넌트 → 해당 기능 폴더(`components/{feature}/`)에, 범용이면 `ui/`·`layout/`에
- 컴포넌트 파일·export는 **PascalCase**

---

## 7. 코딩 컨벤션

- **디자인 토큰만 사용, 색상 하드코딩 금지** — Tailwind 토큰(`primary`, `gray-*`, `oy-*`, `surface-warm`) 또는 CSS 변수(`var(--primary)`)를 쓰고 `#3D8F6F`·`#F5F6F2` 같은 직접 값 지양. 토큰 정의: `tailwind.config.ts`, `index.css`
- **아이콘은 인라인 SVG** (아이콘 라이브러리 추가 금지)
- **API 미연동 데이터는 `mocks/`에 모으고 `// TODO` 마커**를 남깁니다
- **safe-area**: 고정 요소는 `var(--safe-top/bottom)` 사용 (모바일 노치 대응)
- 모바일 폭 기준 `max-w-[430px]`, 터치 피드백 `active:scale-*`

### 7-1. 화면 규격 표준 ⭐ (2026-07 UI 통일에서 확정)

탭 화면(홈·카테고리·검색·화장대·마이·히스토리)은 **아래 규격을 지켜 일관성을 맞춥니다.** 새 화면도 동일하게.

| 항목 | 표준 | 비고 |
|---|---|---|
| 페이지 배경 | `bg-surface-warm` (`#F5F6F2`) | 그 위에 흰 카드로 콘텐츠 분리 |
| 서브페이지 헤더 높이 | `52px` (`--header-h`) | 헤더/본문 좌우 여백은 `px-4`(16px)로 정렬 |
| 헤더 우측 아이콘 | `24px` **선형(stroke) SVG**, 클러스터 `gap-4` | 채움형 아이콘 금지 (검색·장바구니·알림 공통 세트 재사용) |
| 하단 네비 | `OyBottomNav` (5탭: 홈·카테고리·검색·화장대·마이) | 검색 화면 진입 시 검색 탭이 중앙 돌출 **스캔 FAB**로 변형 → `/scan` |
| 하단 여백 | `<PageWrapper hasBottomNav>` 또는 `calc(var(--bottom-nav-h)+var(--safe-bottom))` | 탭바 높이 `56px`(`--bottom-nav-h`). **내부에서 중복으로 다시 예약하지 말 것** |

- 신규 레이아웃 토큰: `--bottom-nav-h`(56px)·`--header-h`(52px)·`--surface-warm`(#F5F6F2) — `index.css`/`tailwind.config.ts`.
- 페이지 폭이 콘텐츠 높이에 따라 흔들리지 않도록 `html`에 `scrollbar-gutter: stable`을 적용해 뒀습니다(임의 해제 금지).

---

## 8. 협업 규칙 (브랜치 · PR · 커밋)

- **브랜치**: 통합 브랜치는 `dev`. 작업은 `dev`에서 분기한 **feature 브랜치**에서.
  - 예: `feat/search-image`, `fix/home-exp-bar`, `docs/...`
- **PR**: base는 항상 **`dev`** (절대 `main` 직접 X). 작게 자주 올립니다. 안정화되면 `dev` → `main`.
- **커밋 메시지**: `타입(scope): 한글 요약`
  - 타입: `feat` / `fix` / `chore` / `docs` / `refactor` / `style`
  - 예: `feat(search): 사진 검색 진입 추가`
- **⚠️ 충돌 핫스팟 3곳** — 여러 명이 동시에 건드리면 부딪힙니다:
  | 파일 | 규칙 |
  |---|---|
  | `src/types/index.ts` | **추가** 위주, 기존 타입 수정은 공지 후 |
  | `src/App.tsx` (라우트) | 라우트 한 줄씩 추가 — 머지 시 양쪽 라우트 모두 유지 |
  | `tailwind.config.ts` / `index.css` | 디자인 토큰 추가는 **합의 후 한 명이 정리** |

> 브랜치별 작업 현황(완료·진행 중)은 저장소 루트 [`README.md`](../README.md)의 "개발 현황 → 프론트엔드 화면 브랜치 현황" 참고.

---

## 9. 참고 문서

- [`docs/frontend-component-guide.md`](../docs/frontend-component-guide.md) — 컴포넌트 카탈로그·디자인 토큰 상세
- [`docs/dev_guidelines.md`](../docs/dev_guidelines.md) — 화면별 구현 체크리스트·역할 분담
- [`docs/PRD_대체뭐야_v1.8.md`](../docs/PRD_대체뭐야_v1.8.md) — 제품 요구사항
- [`ANALYSIS.md`](./ANALYSIS.md) — 팀원 제출물 병합 분석(무엇을 병합했고 원본과 실제 구현이 어떻게 달랐는지)

---

## 10. 팀원 화면 제출 규칙 ⭐ (2026-07 병합 작업에서 정리)

`category_yb`, `history_misong`, `dg_mypage`, 그리고 최근본/좋아요/자주구매 4건 — 총 6건의 병합
작업에서 **같은 문제가 반복적으로 발생**했습니다. 무엇을 병합했고 원본과 실제 구현이 어떻게
달랐는지는 [`ANALYSIS.md`](./ANALYSIS.md)에 정리되어 있습니다. 다음 화면을 만들 때는 아래 규칙을
지켜주세요.

0. **PR 올리기 전에 `npm run check-submission -- <내 작업 폴더 경로>`를 실행하세요.** 아래
   1~4번 규칙 중 자동으로 점검 가능한 항목을 스크립트(`scripts/check-submission.mjs`)로 만들어
   뒀습니다. 이번에 병합한 6건에서 실제로 걸렸던 문제들이라 대부분 걸러집니다. 경고가 떠도 빌드를
   막지는 않으니 셀프 체크 용도로 PR 전에 한 번 돌려보고 반영해주세요.
1. **새 Vite 프로젝트로 스캐폴딩하지 마세요.** `npm create vite`로 만든 독립 프로젝트(자체
   `package.json`/`vite.config`/lockfile)는 루트 `frontend`의 `npm run dev`/`build`로 실행되지 않고,
   병합 시 전체 재작성이 필요합니다. 대신 `frontend/src/pages/<기능>/`에 기존 `PageWrapper` /
   `Header` / `BottomNav` / `components/product/ProductCard` / `types`의 `Product`를 사용해 만들고
   `frontend/`를 대상으로 PR을 올려주세요.
2. **콘텐츠(상품명·가격 등)를 JSX에 하드코딩하지 마세요.** `frontend/src/mocks/*.ts`에 `Product`
   타입으로 분리해 (기존 `mocks/home.ts`, `mocks/alternatives.ts` 패턴 참고).
3. **absolute-pixel 레이아웃을 만들지 마세요.** Figma/Anima export는 `top-[890px]` 같은 고정 좌표를
   쓰는데, 이러면 `max-w-[430px]` 모바일 프레임 안에서 반응형으로 동작하지 않습니다. Tailwind
   flex/grid + 기존 spacing/radius 토큰(`--sp*`, `--r-*`)을 사용하세요.
4. **Figma/Anima export의 `package.json`·lockfile은 그대로 설치하지 마세요.** 대부분 오래된
   버전(예: React 18.0.0, Vite 4, Tailwind v4 등)이거나 MUI/Radix 같은 외부 UI 라이브러리를
   포함하고 있어 프로젝트 전체와 충돌합니다. **JSX/TSX 로직만 참고 자료**로 삼으세요.
5. **원본 export 폴더를 PR에 그대로 남기지 마세요.** 병합 후에는 삭제하거나, 디자인 근거로 남기고
   싶으면 `ANALYSIS.md`에 레이아웃/카피/색상을 요약하고 대표 스크린샷 1~2장만
   `frontend/example/`에 보관하세요 (`frontend/example/oliveyoung/` 참고). 이번 6건도 병합 후
   원본 폴더(`code/*_React`, `dg-mypage-design-main/`, `frontend/category_UI_yb/`, `design_jw/`
   등)와 관련 없는 옛 병합 잔재(`frontend/category-standalone/`, `capstone-frontend/`,
   `my-workspace/`)를 전부 정리했습니다.
6. **로컬 상태 저장 컨벤션**: 백엔드 연동 전까지 사용자별 상태(찜, 최근 본 제품 등)는
   `localStorage`로 관리합니다. 화면 하나만 보는 상태는 `frontend/src/hooks/`에 훅으로
   (`useRecentlyViewed` 참고, 키 네이밍 `dcmy:<기능>:v1`), 여러 화면이 같은 상태를 공유해야 하면
   `frontend/src/context/`에 Context로 만드세요 (`LikedProductsContext` 참고). 화면마다 따로
   `localStorage.getItem`을 호출하지 마세요.
7. **알려진 중복 — 후속 정리 필요** (이번 병합에서 건드리지 않음):
   - `components/product/ProductCard` (`Product` 타입, Home/Search/History에서 사용) vs
     `components/category/ProductCard` (`CategoryProduct` 타입, Category/ProductDetail에서 사용) —
     같은 개념의 두 컴포넌트/타입이 공존합니다.
   - `components/category/Icon.tsx`는 이름과 달리 `ProductDetail`, `Mypage` 서브페이지 등
     `category/` 밖에서도 널리 쓰이고 있어 `components/common/Icon.tsx`로 옮기는 게 맞습니다.
   - `ProductDetail`의 "비슷한 상품"/"함께 본 상품" 찜 상태는 `LikedProductsContext`와 별개의
     로컬 상태(`CategoryProduct.isFavorite`)라 전역 찜 목록에 반영되지 않습니다.
   - `frontend/src/pages/Category/index.tsx`는 어디에도 라우팅되지 않는 죽은 파일입니다(실사용은
     `CategoryMainPage.tsx`/`CategoryPage.tsx`).
   - 카테고리 사이드바 탭(`건강식품`/`헬스`)과 "COMING SOON" 배너는 디자인엔 있지만 구현하지
     않기로 확정했습니다 (`ANALYSIS.md` 5절 참고).
8. **`/mypage/chat-support`(`ChatSupportPage.tsx`)는 임시 챗봇 UI입니다.** 팀원 `동균`의
   `dg-mypage-design-main` 원본을 그대로 이식한 캔드(정형) 응답 챗봇으로, 실제 AI 연동이 아닙니다.
   루트 `CLAUDE.md` Task 7(Claude API 연동 실제 AI 챗봇)이 완료되면 이 화면을 교체해야 합니다.
9. **2026-07 UI 통일 작업 — 팀원별 화면을 하나의 디자인 시스템으로 정리했습니다.** 회의에서 확정한
   개선안(`앱 5개 화면 개선사항` 디자인)을 기준으로 6개 탭 화면을 재구성·통일했습니다. 새 화면을
   만들 땐 위 **7-1 화면 규격 표준**을 따라주세요. 이번에 정리된 주요 내용:
   - **하단 네비 통일**: 페이지마다 갈렸던 하단바를 `OyBottomNav` 5탭(홈·카테고리·검색·화장대·마이)
     하나로 통일. 검색 화면 진입 시 검색 탭이 중앙 돌출 스캔 FAB로 바뀌어 성분 스캔(`/scan`)으로
     이동합니다. 레거시 `layout/BottomNav`(초록 활성, 히스토리 포함)는 `/history`에만 남아 있고,
     히스토리는 더 이상 탭이 아니라 **화장대 화면 내부 탭**(최근 본·좋아요·자주 구매)으로 통합됐습니다.
   - **화면 재구성**: 검색(3b)·카테고리(2b, 상단 추천 제외)·화장대(4c + 히스토리 결합)·
     마이(6e 상단 + 5b 하단 결합). `/closet`은 "내 화장대"(보유 제품 관리)로 바뀌었고, 기존 캐릭터
     꾸미기 화면은 `/closet/decorate`로 이동했습니다. 성분 스캔 카메라 화면(`/scan`, 3c)이 새로
     추가됐고, 옛 `Search/ScannerModal`은 제거됐습니다.
   - **규격·색상 통일**: 헤더 52px·`px-4`·24px 선형 아이콘, 배경 `surface-warm`, 하단 여백 토큰화
     (이중 여백 버그 제거), 스크롤바 gutter 고정. 상세는 7-1 참고.
   - **아직 남은 정리**: `/history`는 여전히 레거시 하단바를 쓰고 헤더 높이도 56px입니다(탭이 아니라
     리다이렉트 경유 화면이라 후순위). 위 7번의 죽은 파일·중복 컴포넌트 정리도 이번 범위 밖입니다.
