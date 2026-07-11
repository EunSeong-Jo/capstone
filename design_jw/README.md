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

- **디자인 토큰만 사용, 색상 하드코딩 금지** — Tailwind 토큰(`primary`, `gray-*`, `oy-*`) 또는 CSS 변수(`var(--primary)`)를 쓰고 `#3D8F6F` 같은 직접 값 지양. 토큰 정의: `tailwind.config.ts`, `index.css`
- **아이콘은 인라인 SVG** (아이콘 라이브러리 추가 금지)
- **API 미연동 데이터는 `mocks/`에 모으고 `// TODO` 마커**를 남깁니다
- **safe-area**: 고정 요소는 `var(--safe-top/bottom)` 사용 (모바일 노치 대응)
- 모바일 폭 기준 `max-w-[430px]`, 터치 피드백 `active:scale-*`

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

---

## 9. 참고 문서

- [`docs/frontend-component-guide.md`](../docs/frontend-component-guide.md) — 컴포넌트 카탈로그·디자인 토큰 상세
- [`docs/dev_guidelines.md`](../docs/dev_guidelines.md) — 화면별 구현 체크리스트·역할 분담
- [`docs/PRD_대체뭐야_v1.8.md`](../docs/PRD_대체뭐야_v1.8.md) — 제품 요구사항
