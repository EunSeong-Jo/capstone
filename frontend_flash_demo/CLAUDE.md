# capstone_demo — 플래시(스플래시) 화면 작업 폴더

이 폴더는 전체 앱 프로젝트가 아니라 **플래시 화면 / 모션 프로토타입 전용 작업 공간**이다.
완성된 컴포넌트는 추후 본 프로젝트(별도 위치, 미확정)에 통합될 예정.

## 앱 개요 (image 폴더 기준 추정)
피부 타입 진단류 앱으로 추정. `/image`에 마스코트 캐릭터(겉바속촉수분지, 말랑말랑인절미, 바스락사막, 반질반질물개 등 타입별 캐릭터) 및 파츠 이미지(구름, 꽃, 리본, 선글라스, 왕관, 하트) 보유.

## 기술 스택
본 프로젝트(전체 앱) 기준 기술 스택. 이 폴더의 스플래시 화면 작업과는 Frontend 항목 외에는 직접 관련 없음.

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

## 스플래시 화면 요구사항 (사용자 지정)
1. 모션(애니메이션) 필수
2. 웹에 적용하기 쉬운 형태 (현재 웹으로 개발 중)
3. 추후 네이티브 앱 전환을 염두에 둔 구조
4. 디자인 가이드는 별도 프롬프트로 추후 전달 예정 (아직 미수신)

## 결정 사항 및 근거
| 항목 | 결정 | 이유 |
|---|---|---|
| 모션 라이브러리 | **Framer Motion** | React/TS/Vite와 궁합이 좋고, 로고 등장 → 텍스트 페이드인 → 화면 전환 같은 시퀀스 연출을 선언적으로 다루기 쉬움. 필요시 사용자가 "모션 구현에 필요한 건 추가해도 된다"고 승인함 |
| 앱 전환 전략 | **Capacitor 권장** (사용자가 "더 좋은 방향으로 결정해달라"고 위임) | 지금 만드는 웹 코드(HTML/CSS/JS 기반 애니메이션 포함)를 거의 그대로 iOS/Android WebView로 감싸서 배포 가능 → 전환 비용 최소. React Native로 갈 경우 CSS 기반 애니메이션 재구현이 필요해 전환 비용이 큼 |
| 구현 원칙 | 네이티브 전용 API 사용 금지, 순수 웹 표준(CSS/JS/Framer Motion) 기반으로만 구현 | Capacitor 전환 시 코드 재작성 없이 그대로 동작하도록 하기 위함 |
| 반응형/세이프에어리어 | `env(safe-area-inset-*)` 등 모바일 노치 대응 CSS 사용 고려 | 향후 네이티브 앱에서 노치/상태바와 자연스럽게 맞물리도록 |

## 진행 순서
1. ✅ 요구사항 정리 + 이 문서 생성
2. ✅ 디자인 가이드 수신 (`desige.txt`, 피그마 링크 포함)
3. ✅ 디자인 가이드 기반 SplashScreen 컴포넌트 구현
4. ✅ 브라우저에서 모션 확인 + 사용자 피드백 여러 차례 반영 (궤도 공전, 크기, 기기 프레임)
5. ⬜ 피그마 실측 스펙으로 미세 조정
6. ⬜ 필요시 Capacitor 전환 가이드 문서화

## 확정된 사항 (과거 "다음 단계에서 확인할 것" 항목들)
- Vite 프리뷰 환경을 이 폴더에 직접 세팅함 (컴포넌트만 따로 작성하는 방식 아님)
- 스플래시 노출 2.8초, 스킵 불가
- `/image`의 마스코트 캐릭터 8종 전부 활용 (로고/텍스트만 쓰지 않음)

---

## 작업 로그
날짜별로 진행한 작업을 요약해서 아래에 추가한다.

### 2026-07-15
- 요구사항 확인: 모션 필수, 웹 우선 구현, 향후 앱 전환 용이성 확보
- 기술 스택 확인: React 18 + TS + Vite + Tailwind (FE), Python 3.11 + FastAPI (BE)
- 이 폴더는 스플래시 화면/모션 작업 전용이며 새 프로젝트 풀 세팅은 하지 않기로 함
- 모션 라이브러리 Framer Motion, 앱 전환 전략 Capacitor로 방향 결정 (근거는 위 표 참고)
- 디자인 가이드 프롬프트는 아직 미수신 — 수신 후 실제 구현 착수 예정

### 2026-07-15 (이어서) — 디자인 가이드 수신 및 구현
- `desige.txt`로 디자인 가이드 수신: 폰트 Rubik Doodle Shadow, 색상(초록 #2D7A4F / 핑크 #F5C2C7 / 베이지 #F4E9D8), 중앙 'Swappy' 텍스트(S=핑크, wappy=초록), 8개 타입 캐릭터가 텍스트 주위를 자유롭게 감싸는 배치, 캐릭터별 모션(탱글탱글/쫀득 vs 톡톡)
- 남은 미결 사항 사용자 확인: (1) Vite 프리뷰 환경 세팅 방식 선택 → 이 폴더에 직접 세팅, (2) 가이드에 명시 안 된 '말랑말랑인절미' 캐릭터 모션 그룹 → 탱글탱글/쫀득 그룹으로 분류, (3) 스플래시 노출 시간/스킵 여부 → 2.5~3초 노출, 스킵 불가
- Node.js v24 설치 확인 후 Vite(React+TS) + Tailwind v4(`@tailwindcss/vite`) + Framer Motion으로 이 폴더에 프리뷰 환경 세팅 완료
- 캐릭터 8종 이미지를 `src/assets/characters/`에 영문 파일명으로 복사(원본 `/image`는 유지): mulgae(물개), ongdalsaem(옹달샘), subuji(수부지), injeolmi(인절미) = 탱글탱글/쫀득 그룹 / memilmuk(메밀묵), samak(사막), yuriguseul(유리구슬), hwasan(화산) = 톡톡 그룹
- `src/components/SplashScreen.tsx` 구현: 중앙 'Swappy' 텍스트(Rubik Doodle Shadow, S 핑크/wappy 초록) + 8개 캐릭터를 텍스트 주위 타원형으로 배치(각도별 반지름/수직 오프셋에 편차를 줘서 자유로운 느낌), 캐릭터마다 느린 배회(drift) 모션 위에 그룹별 텍스처 모션(탱글탱글=스케일 스쿼시/회전, 톡톡=바운스 팝) 레이어링, 2.8초 후 자동 전환(스킵 불가), `env(safe-area-inset-*)` 적용, 네이티브 전용 API 미사용
- `npx tsc -b` 타입체크 통과, Playwright로 dev 서버(localhost:5173) 스크린샷 검증 — 텍스트/캐릭터 배치, 폰트, 자동 전환(→ 임시 '메인 화면' 플레이스홀더) 모두 정상 동작 확인, 콘솔 에러 없음
- 검증에 사용한 Playwright는 `--no-save`로 임시 설치했다가 확인 후 제거함 (프로젝트 의존성 아님)

### 2026-07-15 (이어서 2) — 사용자 피드백 반영 (모션/크기/레이아웃)
사용자가 브라우저에서 직접 확인하며 여러 차례 피드백을 준 것을 반영:
- **궤도 공전 모션**: 캐릭터가 제자리에서 흔들리기만 하던 것을, 텍스트를 중심으로 한 타원 궤도를 45°씩 균일한 간격으로 유지하며 실제로 공전하는 방식으로 변경 (`useOrbitPath`, `ORBIT_DURATION_S=22`초/1바퀴, `ease: linear`). `left`/`top`을 `calc(50% + N cqmin)` 형태의 24스텝 키프레임 배열로 애니메이션.
- **모바일 기기 프레임 추가**: `index.css`의 `.device-frame` — 데스크톱에서는 393×852 크기 + 어두운 배경 + 둥근 모서리로 실제 폰처럼 보이게, 실제 모바일/네이티브 빌드에서는 프레임이 화면 전체(100dvh/dvw)를 채워 자연스럽게 전체 화면이 됨. `container-type: size`를 줘서 내부 요소는 `vmin/vw` 대신 `cqmin`(컨테이너 쿼리 단위)을 써서 프레임 자체 크기 기준으로 반응형 배치되도록 함 — 브라우저 창 크기와 무관하게 항상 올바른 비율 유지.
- **캐릭터 크기 이슈 여러 차례 조정**: 처음엔 모든 캐릭터 크기를 통일했으나(모션 진폭만 다르게), 사용자가 실제로 보니 쫀득 그룹(물개/옹달샘/수부지/인절미)이 톡톡 그룹(화산/메밀묵/사막/유리구슬)보다 작아 보인다고 지속 피드백 → 그룹별로 아예 다른 크기를 적용하는 `GROUP_SIZE_SCALE`을 도입. 여러 차례 조정 끝에 최종값: **쫀득 2.0배 / 톡톡 0.82배** (`charWidth()` 함수, `clamp(48px*scale, 10cqmin*scale, 84px*scale)`).
- **텍스트 가림 방지**: 캐릭터가 커지면서 궤도가 텍스트와 겹치는 문제 발생 → 궤도 반지름을 텍스트 폭보다 확실히 크게(`BASE_RADIUS_X_CQMIN=33`, `BASE_RADIUS_Y_CQMIN=15`) 넓혀서 회전 중 어느 각도에서도 텍스트를 가리지 않도록 조정. Playwright로 궤도 한 바퀴 중 여러 지점을 스크린샷 찍어서 겹침 없음을 실제로 확인.
- **피그마 링크 확보**: 사용자가 `desige.txt` 파일 끝에 피그마 링크를 추가함 — `https://figma.com/design/4uWgu9KsdtQNYeIXAPIIm8/...` (node-id=0-1, "Page 1" 하나뿐). Figma MCP(`get_design_context`, `get_metadata` 등)로 조회 가능. `get_metadata`는 전체 페이지가 너무 커서(267K+자) 바로 안 읽히므로, 필요한 노드로 좁혀서 조회할 것. 'Swappy' 텍스트 노드가 여러 개(id 54:173, 50:2185, 54:185 등) 존재 — 여러 화면 시안이 섞여 있는 것으로 보이니 실제 스플래시 화면에 해당하는 프레임을 먼저 특정해야 함 (아직 특정 못함, 다음 세션에서 이어서 할 것).
- 검증은 매번 `EXPOSURE_MS`를 임시로 늘려(콜드 스타트 컴파일 시간 때문에 기본 2.8초로는 스크린샷 타이밍을 못 맞춤) Playwright로 확인 후 2800으로 원복하는 방식을 반복 사용. Playwright는 매번 `--no-save`로 임시 설치 후 확인이 끝나면 제거.
- 사용자가 dev 서버(`localhost:5173`)를 계속 켜둔 채로 두고 직접 새로고침하며 눈으로 확인하는 방식으로 작업 — 서버를 임의로 끄지 말 것.

### 2026-07-19 — 스플래시 핑크 색상 조정 + motion_1 온보딩 플로우 구현
- 스플래시 'S' 텍스트 핑크 색상을 사용자 피드백에 따라 여러 차례 조정: `#F5C2C7`(원래, 잘 안 보임) → `#E0355E`(사용자가 "너무 붉다"고 반려) → `#F48FB1` → 최종 `#EF969F`(사용자가 직접 지정한 값)로 확정. `src/index.css`의 `--color-swappy-pink` 토큰만 바꾸면 되므로 스플래시/온보딩 전체에 일괄 반영됨.
- `node_modules`가 rolldown 네이티브 바이너리 누락으로 깨져 있어(`npm` 옵셔널 디펜던시 버그) `rm -rf node_modules && npm install`로 재설치함(`package-lock.json`은 유지).
- 기술 스택 변경 사항을 정리해 `README.md`에 "스플래시 화면 작업 - 기술 스택 변경 사항" 섹션으로 추가 (React 19/Tailwind v4/Vite 8/TS 6로 실제 설치됨, Framer Motion·Google Fonts CDN·oxlint는 계획에 없던 추가, Capacitor는 아직 방향만 결정하고 미도입).
- `desige.txt`에 사용자가 추가한 `motion_1` 가이드(스플래시 다음에 오는 온보딩 시퀀스: 인사말 타자 효과 → "알아요/몰라요" 분기 → 타입 그리드 선택 또는 QnA→로딩→결과 화면)를 `/plan`으로 계획 후 구현 완료.
  - 폰트 관련 사용자 확인: 온보딩 본문/대사는 기본 산세리프, 버튼 라벨과 타입 이름 등 강조 요소만 기존 Doodle 폰트 유지하기로 결정.
  - `/image/기본.png`, `기본_고민.png`, `기본_결론.png`을 `src/assets/base/base-default.png`, `base-worried.png`, `base-result.png`로 복사+영문 리네임(`기본_실패.png`는 이번 가이드에 없어 미사용).
  - `src/data/skinTypes.ts`(8개 타입 데이터+임의 작성 설명), `src/hooks/useTypewriter.ts`, `src/components/onboarding/` 하위에 `OnboardingFlow`/`GreetingScreen`/`TypeGridScreen`/`TypeGrid`/`TypeDisplay`/`WorriedScreen`/`QnaPlaceholder`/`LoadingScreen`/`ResultScreen`/`MascotStage`/`MessageBox`/`OnboardingButton` 신규 구현. `App.tsx`의 `showSplash` boolean을 `stage: 'splash'|'onboarding'|'main'`로 확장해 3단계 시퀀스로 연결.
  - QnA 화면 내용은 다른 팀원이 만들 예정이라 빈 placeholder(탭하여 계속하기)로만 구현. 결과 화면의 진단 타입은 가이드 지시대로 "조심조심유리구슬"로 하드코딩.
  - `npx tsc -b` 통과 확인 + Playwright(`--no-save`로 임시 설치 후 확인 끝나고 제거, 기존 컨벤션과 동일)로 두 분기(알아요!/아니요 몰라요) 전체 흐름과 "다시하기" 재시도 루프까지 스크린샷으로 끝까지 구동 검증, 콘솔 에러 없음 확인.

### 2026-07-19 (이어서) — motion_1 온보딩 피드백 반영
- **기본/고민 화면(`GreetingScreen`, `WorriedScreen`)**: 마스코트 모션이 "오두방정" 떤다는 피드백 → `MascotStage`에서 scale 스쿼시를 제거하고 단순 상하 이동만(`y:[0,-12,0]`) 남기고 템포를 늦춤(1.1s→2.6s, easeInOut). 캐릭터-텍스트 간격이 너무 넓다는 피드백 → `MascotStage`의 고정 높이 박스를 `36cqh→22cqh`로 줄이고 화면의 `gap`도 `4cqmin→1.5cqmin`으로 축소해 캐릭터+텍스트가 한 그룹처럼 화면 중앙에 붙어 보이도록 함. "피부 타입을 알고 계산가요?" 오타를 "계신가요?"로 수정. 배경을 베이지 → 흰색(`bg-white`)으로 변경.
- **알아요(그리드) 화면**: 상단 선택 캐릭터를 1.8배 확대, 라벨에 "타입" 접미사를 붙이고 굵게(`TypeDisplay.tsx`, 두 화면에서 공유하므로 여기서 한 번에 처리). 그리드 썸네일을 2배로 키우고(`TypeGrid.tsx`) 좌우 여백을 줄여(`mx-6cqmin→3cqmin`) 더 큰 그리드가 프레임 안에 들어가도록 함. "선택하기" 버튼과 그리드 사이 간격을 별도 `mt-[4cqmin]`으로 분리해 더 띄움. 전체 그룹을 화면 정중앙보다 살짝 위로(`pb-[10cqmin]`) 배치.
- **몰라요(결과) 화면**: 기존에 마스코트+결과 문구+캐릭터 카드+버튼이 한 화면에 몰려 있던 것을 두 화면으로 분리. ① `ResultMessageScreen`(신규): 기본 결론 마스코트 + "OO님의 타입은 ~타입이에요!!" 문구를 앞의 인사말과 같은 텍스트박스 스타일(흰 배경, 탭하여 진행)로 표시. ② `ResultScreen`: 탭하면 넘어가는 두 번째 화면으로, 흰 카드 안에 은은한 핑크 radial glow + spring 팝인 애니메이션으로 확대된(1.8배) 캐릭터를 "가챠/카드 리빌"처럼 트렌디하게 보여주고 그 아래 선택하기/다시하기 버튼 배치. `OnboardingFlow`의 `Step`에 `'resultCard'`를 추가해 `'result'`(메시지) → `'resultCard'`(카드 리빌) 순서로 연결.
- 검증: Playwright 임시 설치(`--no-save`)로 두 화면 모두 스크린샷 확인 후 제거, `npx tsc -b` 통과, 콘솔 에러 없음.

### 2026-07-19 (이어서 2) — motion_1 색상/배경 피드백 반영
- 텍스트박스(`MessageBox`) 배경을 반투명 흰색 → `bg-swappy-beige`(솔리드 베이지 톤)로 변경.
- 스플래시 화면을 제외한 온보딩의 모든 화면 배경을 흰색(`bg-white`)으로 통일: `TypeGridScreen`, `QnaPlaceholder`, `LoadingScreen`, `ResultScreen`, `App.tsx`의 메인 placeholder. (`GreetingScreen`/`WorriedScreen`/`ResultMessageScreen`은 이전 피드백에서 이미 흰색 처리됨)
- "다시하기" 버튼(`OnboardingButton` secondary variant) 색을 현재 스플래시용 진한 핑크 토큰(`--color-swappy-pink`, `#EF969F`) 대신 이전에 쓰던 연한 파스텔 핑크(`#F5C2C7`)로 분리 지정 — 스플래시 텍스트 가독성 때문에 바뀐 핑크 토큰과 버튼의 톤을 분리.
- 결과 카드 리빌 화면(`ResultScreen`)의 스프링+회전 팝인 모션을 제거하고, 카드 배경을 흰색 → 베이지로 바꾼 뒤 카드 위에 흰색 오버레이가 빠르게 페이드아웃되는 방식(반짝하고 드러나는 느낌)으로 교체. 카드 자체는 단순 opacity 페이드만 사용.
- 검증: Playwright 임시 설치(`--no-save`)로 전체 화면 배경/버튼 색/카드 리빌 모션을 스크린샷으로 확인 후 제거, `npx tsc -b` 통과, 콘솔 에러 없음.

## 다음 단계 (갱신)
- ⬜ 피그마 디자인의 정확한 스플래시 프레임을 특정해서 실측 스펙(정확한 캐릭터 크기 비율, 간격, 폰트 크기 등)으로 미세 조정
- ⬜ motion_1 온보딩 화면도 피그마 실측 스펙 확인되면 미세 조정 필요 (현재는 가이드 텍스트 설명 + 사용자 피드백 기반으로만 구현)
- ⬜ 실제 메인 화면과 연결 (현재 `App.tsx`의 `stage==='main'`은 전환 확인용 플레이스홀더만 존재)
- ⬜ QnA 화면 내용은 다른 팀원 작업 예정 — 완성되면 `QnaPlaceholder.tsx` 자리에 연동
- ⬜ Capacitor 전환 가이드 문서화 (필요 시)
- ⬜ 본 프로젝트(별도 위치)에 컴포넌트 통합
