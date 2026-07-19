# React + TypeScript + Vite

## 실행 방법

```bash
# 의존성 설치 (최초 1회, 또는 package-lock.json 변경 시)
npm install

# 개발 서버 실행 (기본 http://localhost:5173)
npm run dev

# 타입 체크 + 프로덕션 빌드
npm run build

# 빌드 결과물 로컬에서 미리보기
npm run preview

# 린트
npm run lint
```

이 폴더는 스플래시 화면/모션 프로토타입 전용 작업 공간이므로, `npm run dev`로 뜨는 화면이 곧 스플래시 → 온보딩 플로우 확인 화면이다. 백엔드(FastAPI 등)는 이 폴더에 포함되어 있지 않아 별도 실행 절차가 없다.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

## 스플래시 화면 작업 - 기술 스택 변경 사항

캡스톤 계획 단계에서 제출한 원래 기술 스택 대비, 스플래시 화면 작업 중 실제로 달라진 부분을 정리한다.

원래 기술 스택(본 프로젝트 전체 기준):

| 영역 | 기술 |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| Backend | Python 3.11 + FastAPI |
| Database | PostgreSQL 16 + Redis 7 |
| AI/ML | scikit-learn (TF-IDF, 코사인 유사도), Tesseract + EasyOCR |
| 챗봇 (P1a) | Claude API (`claude-sonnet-4-20250514`) |
| 인프라 (P0) | Docker Compose (로컬) |
| 인프라 (P1) | AWS EC2 |
| 모니터링 | Sentry + structlog (P0) / Prometheus + Grafana (P1) |

### 1. 새로 추가된 것

| 항목 | 내용 | 추가 사유 |
|---|---|---|
| Framer Motion (`framer-motion` ^12.42.2) | 모션 라이브러리 | 원래 스텍에는 없었음. 캐릭터 궤도 공전, 텍스트 등장 등 스플래시 애니메이션 구현을 위해 추가 |
| Google Fonts (외부 CDN) | `Rubik Doodle Shadow` 폰트를 `@import url(fonts.googleapis.com...)` 방식으로 로드 | 로컬 번들 폰트가 아니라 인터넷 연결이 필요한 외부 리소스 |
| oxlint | 린터 | 원래 스텍 논의에는 없었고 Vite 프로젝트 세팅 시 기본으로 포함된 개발 도구 |

### 2. 버전이 원래 계획과 다른 것

| 항목 | 계획 당시 | 실제 설치 버전 |
|---|---|---|
| React | 18 | 19 (`^19.2.7`) |
| Tailwind CSS | 버전 미지정 | v4 (`@tailwindcss/vite` 플러그인 방식 — v3와 달리 `tailwind.config.js` 대신 CSS `@theme` 블록으로 설정) |
| Vite | 버전 미지정 | 8 |
| TypeScript | 버전 미지정 | 6 |

### 3. 방향만 결정되고 아직 실제로 도입하지 않은 것

- **Capacitor**: 추후 네이티브 앱 전환 시 사용하기로 방향만 정함. 현재 `package.json`에는 포함되어 있지 않으며, 실제 도입은 하지 않은 상태.

### 4. 이번 작업에서 손대지 않은 것

- Backend, Database, AI/ML, 챗봇, 인프라, 모니터링 영역은 이번 스플래시 화면 작업과 무관하여 전혀 변경하지 않음. 이 폴더에서 실제로 세팅/사용 중인 것은 Frontend 영역뿐이다.
