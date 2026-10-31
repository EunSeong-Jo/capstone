# swappy — 앱 개발 가이드라인 v1.1

> PRD v1.8 + prototype.html 기반. 팀원이 일관된 방향으로 개발할 수 있도록 디자인 시스템, 화면 구조, API, DB, 역할 분담을 한 문서에 정리합니다.
>
> **2026-10-31 갱신 안내.** 2·4·5장(디자인 토큰·화면 체크리스트·컴포넌트 스펙)은 설계 시점의 기준으로 그대로 두었고, 체크박스는 **구현 여부가 아니라 화면이 갖춰야 할 요건**입니다.
> 3·6·7·8·9장과 11장의 인증·유사도·진단·챗봇 항목은 **현재 구현에 맞게 고쳤습니다.** 구현의 정본은 코드와
> [db-schema.md](db-schema.md)(스키마) · [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md)(기능 총정리) · [similarity.md](similarity.md)(유사도)이고,
> 프론트 규격은 [frontend/README.md](../frontend/README.md) 7-1절을 따릅니다.

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [디자인 시스템 (Design Tokens)](#2-디자인-시스템)
3. [화면 구조 및 네비게이션 플로우](#3-화면-구조-및-네비게이션-플로우)
4. [화면별 구현 체크리스트](#4-화면별-구현-체크리스트)
5. [공통 컴포넌트 스펙](#5-공통-컴포넌트-스펙)
6. [API 엔드포인트 요약](#6-api-엔드포인트-요약)
7. [DB 스키마 요약](#7-db-스키마-요약)
8. [기술 스택 및 환경 설정](#8-기술-스택-및-환경-설정)
9. [개발 우선순위 (P0 → P1a)](#9-개발-우선순위)
10. [팀 역할 분담](#10-팀-역할-분담)
11. [주요 구현 주의사항](#11-주요-구현-주의사항)

---

## 1. 프로젝트 개요

**서비스명:** swappy  
**핵심 가치:** 피부타입 8캐릭터 기반 개인 맞춤 화장품 추천 + 성분 유사 대체품 자동 매칭

### 메인 플로우 (P0)

```
온보딩(가입) → 피부타입 QnA(6문항, 선택으로 얼굴 사진 AI 분석) → 8타입 결과 캐릭터
    → 추천 세트 → 메인(큐레이션) → 제품 상세 → 대체품 → 성분 비교 → 화장대·장바구니·주문
```

### 서비스 우선순위 한 줄 요약

| 우선순위 | 범위 | 목표 완성 |
|---------|------|---------|
| **P0** | 회원가입·QnA·프로필 추천·대체품·비교·구매링크 | ✅ 구현 |
| **P1a** | 예산 가이드·AI 챗봇·성분 필터링·서버 배포 | ✅ 예산 가이드·챗봇·궁합 필터 구현, 배포는 AWS Lightsail |
| **P1b** | KoBERT·알고리즘 고도화 (여유 시) | KoBERT는 하지 않음 — hybrid 유사도로 대체 |
| **P2** | 날씨 추천·도메인 확장 | 날씨(서울 고정)는 구현, 도메인 확장은 하지 않음 |
| (추가) | 얼굴 사진 AI 분석 · 퍼스널 AI(AI 기억·취향·리포트·브리핑) · 사진으로 제품 찾기 · Android 앱 | ✅ 구현 |

---

## 2. 디자인 시스템

> `prototype.html`의 CSS 변수를 그대로 사용합니다. 임의로 색상·간격을 하드코딩하지 마세요.

### 2.1 컬러 팔레트

| 토큰 | 값 | 용도 |
|------|----|------|
| `--primary` | `#3D8F6F` | 주요 액션, 강조, 브랜드 색 |
| `--primary-light` | `#EAF5EF` | 배경 강조, 칩 배경 |
| `--primary-dark` | `#2B6B52` | 호버, 온보딩 그라디언트 |
| `--accent` | `#FF5C7A` | 할인율, 찜 아이콘, 경고 |
| `--accent-light` | `#FFF0F3` | 주의 성분 칩 배경 |
| `--warning` | `#FF9500` | 중간 유사도 배지, 세일 배지 |
| `--star` | `#FFB800` | 별점 |
| `--badge` | `#FF3B30` | 알림 배지 |

**회색 시스템**

| 토큰 | 값 | 주요 사용처 |
|------|----|-----------|
| `--gray00` | `#FFFFFF` | 카드·헤더 배경 |
| `--gray05` | `#F7F8FA` | 페이지 배경 (`--surface`) |
| `--gray10` | `#F2F3F5` | 검색바, 비활성 칩 배경 |
| `--gray20` | `#E8EAED` | 테두리 (`--border`) |
| `--gray50` | `#9CA3AF` | 비활성 아이콘, 비활성 텍스트 |
| `--gray70` | `#6B7280` | 서브 텍스트 (`--text-sub`) |
| `--gray100` | `#111827` | 주요 텍스트 (`--text`) |

### 2.2 타이포그래피

| 토큰 | 크기 | 주요 용도 |
|------|------|---------|
| `--t-xs` | 11px | 배지, 보조 라벨 |
| `--t-sm` | 12px | 브랜드명, 부가 정보 |
| `--t-base` | 14px | 본문, 버튼, 입력 |
| `--t-md` | 15px | 리스트 제목 |
| `--t-lg` | 16px | 섹션 제목, 주요 버튼 |
| `--t-xl` | 18px | 상세 페이지 제품명 |
| `--t-2xl` | 20px | 배너 제목 |
| `--t-3xl` | 24px | 결과 타입명 |
| `--t-4xl` | 28px | 온보딩 앱명 |

폰트: `Noto Sans KR` (400/500/700/900), fallback `-apple-system, sans-serif`

### 2.3 간격 & 보더 반지름

```
간격: --sp1(4) --sp2(8) --sp3(12) --sp4(16) --sp5(20) --sp6(24) --sp8(32)
반지름: --r-sm(4) --r-md(8) --r-lg(12) --r-xl(16) --r-2xl(20) --r-full(999)
그림자: --shadow-sm / --shadow-md / --shadow-lg
```

### 2.4 8타입 피부 캐릭터 정의

| 타입 ID | 표시명 | 이모지 | 핵심 특성 |
|---------|--------|--------|---------|
| `ondalsam` | 수분팡팡 옹달샘 | 💧 | 수분·유분 균형, 이상적 피부 |
| `mulgae` | 반질반질 물개 | 🦭 | 지성, 번들거림, 모공 |
| `subuji` | 겉바속촉 수부지 | 🌊 | 속건조 + 겉번들 |
| `hwasan` | 울긋불긋 화산 | 🌋 | 트러블·홍조·염증 |
| `samak` | 바스락 사막 | 🏜️ | 극건성, 당김 |
| `injeolmi` | 말랑말랑 인절미 | 🍡 | 건성·탄력 저하, 주름 |
| `yuriguseul` | 조심조심 유리구슬 | 🫧 | 민감성, 자극 반응 |
| `memilmuk` | 얼룩덜룩 메밀묵 | 🌑 | 색소침착·잡티 |

---

## 3. 화면 구조 및 네비게이션 플로우

### 3.1 화면 목록

설계 당시 화면 ID(`s-*`)는 아래 4장 체크리스트에서 쓰는 이름이고, 실제 라우트는 `frontend/src/App.tsx`가 정본입니다(46개 + 리다이렉트).

| 화면 ID (설계) | 현재 라우트 | 비고 |
|---------|---------|------|
| `s-onboard` | `/`(스플래시) · `/login` · `/signup` · `/onboarding` | 로그인 없이 둘러보기 가능 |
| `s-qna` · `s-result` | `/qna`(재진단) · `/onboarding` 안의 문답·결과 | 사진 분석을 선택으로 섞음 |
| `s-popup` | 홈의 추천세트 시트 | 별도 라우트 없음 |
| `s-home` | `/home` · `/home/cheaper-alternatives` | 오늘의 케어 문구 → 브리핑 시트 |
| `s-detail` | `/detail/:id` · `/analysis/:id` · `/alternatives` · `/compare` | 상세·성분 분석·대체품·비교로 나뉨 |
| `s-search` | `/search` · `/scan` · `/scan/history` | 사진으로 찾기는 스캔 화면 |
| `s-mypage` | `/mypage` 와 하위 화면 | 주문·선물·후기·구독·AI 기억 등 |
| (추가) | `/closet` · `/category` · `/cart` · `/history` · `/notifications` | 화장대·카테고리·장바구니·기록·알림 |

### 3.2 전체 네비게이션 플로우

```
[첫 실행]
  스플래시 → 로그인 / 가입
    ├── "가입하기" → 온보딩(인삿말 → 피부타입 알아요/몰라요 → QnA 또는 직접 선택 → 결과) → 홈
    └── "로그인 없이 둘러보기" → 홈 (게스트 모드)

[하단 내비게이션 — OyBottomNav 5탭]
  홈 | 카테고리 | 검색(→ 스캔 FAB) | 화장대 | 마이

[홈에서 상세로]
  제품 카드 탭 → /detail/:id → (성분 분석 /analysis/:id · 대체품 /alternatives · 비교 /compare)

[Soft-gate]
  진단까지는 로그인 없이, 개인 데이터(화장대·장바구니·주문 …)부터 로그인.
  계정 화면은 RequireAuth가 게스트를 막고, 로그인하면 비회원 localStorage 데이터를 서버로 옮긴다
```

### 3.3 하단 내비게이션 탭 구성

```
[홈]  [카테고리]  [검색]  [화장대]  [MY]
```

활성 탭은 `--primary` 색상, 비활성은 `--gray50`. 검색 화면에서는 검색 탭이 중앙 돌출 스캔 FAB로 바뀝니다.
표준 컴포넌트는 `components/home/oy/OyBottomNav.tsx`입니다(히스토리는 탭이 아니라 화장대 내부 탭).

---

## 4. 화면별 구현 체크리스트

### 4.1 온보딩 (s-onboard)

- [ ] 풀스크린 그라디언트 배경 (`#1B5E40` → `#3D8F6F` → `#5BB88A`)
- [ ] 앱 로고: **대체**`뭐야` (뭐야 = `--accent` 색)
- [ ] 3개 핵심 기능 소개 카드 (반투명 배경 `rgba(255,255,255,.15)`)
- [ ] 주요 CTA 버튼: "피부 타입 진단하고 시작하기" (흰색 버튼, `--primary` 텍스트)
- [ ] 보조 버튼: "로그인 없이 둘러보기" (ghost 스타일)
- [ ] "둘러보기" 선택 시 → 게스트 모드로 `s-home` 진입

### 4.2 피부타입 QnA (s-qna)

- [ ] 상단 진행 바: 현재 문항 / 전체 (`width: (현재/전체)*100%`, 애니메이션 0.4s ease)
- [ ] 뒤로가기 + 현재 문항 번호 표시
- [ ] 문항 카테고리 뱃지 (연두 칩: `--primary-light` + `--primary` 텍스트)
- [ ] 질문 텍스트 (`--t-xl`, bold)
- [ ] 4~5지선다 옵션 카드: 선택 전 `--gray20` 테두리 / 선택 후 `--primary` 테두리 + `--primary-light` 배경
- [ ] 옵션 선택 전 "다음" 버튼 비활성 (opacity 0.5), 선택 후 활성화
- [ ] 총 6문항 (5축: moisture, oil, sensitivity, pigmentation, trouble)
- [ ] 중간 이탈 시 진행률 `localStorage` 저장 → 재진입 시 "이어서 진단하기" 안내

### 4.3 QnA 결과 / 캐릭터 확인 (s-result)

- [ ] 캐릭터 이모지(임시) + 타입명 크게 표시 (`--t-3xl`, font-weight 900)
- [ ] 1줄 요약 설명
- [ ] "추천 성분" 칩 목록 (녹색, `r-chip.good`)
- [ ] "주의 성분" 칩 목록 (빨간, `r-chip.warn`)
- [ ] CTA: "내 타입 추천 세트 보기" → `s-popup`
- [ ] 보조: "홈으로 바로 가기" (텍스트 버튼)
- [ ] 결과 화면 하단에 만족도 미니 설문 (5점 척도, KPI 측정용)

### 4.4 추천 세트 팝업 (s-popup)

- [ ] 반투명 오버레이 + bottom-sheet 스타일 (border-radius 상단 `--r-2xl`)
- [ ] 드래그 핸들 (36px × 4px 회색 바)
- [ ] 팝업 제목: "옹달샘 타입을 위한 추천 세트"
- [ ] 제품 카드 3개: 카테고리 라벨 + 제품명 + 가격 + "매칭 성분 %" 뱃지
- [ ] CTA: "세트 전체 보기" → 메인 홈
- [ ] 닫기 시에도 홈 진입

### 4.5 메인 홈 (s-home)

- [ ] 헤더: 로고 + 알림 아이콘 + 찜 아이콘
- [ ] 검색 바 (pill 형태, 카메라 아이콘 포함)
- [ ] 카테고리 칩 가로 스크롤 (선택 시 `--primary` 배경)
- [ ] 피부타입 배지 카드 (로그인 사용자만 표시): 캐릭터 + 타입명 + "재진단" 화살표
- [ ] 배너 슬라이더 (180px 높이, dot indicator)
- [ ] **섹션 구성 (로그인 사용자)**:
  - "내 타입 추천 세트" (가로 스크롤 카드)
  - "내 타입에 인기" (2열 그리드)
  - "이번 주 베스트" (가로 스크롤 랭킹 카드)
- [ ] **섹션 구성 (게스트)**:
  - "오늘의 인기 제품" (2열 그리드)
  - "이번 주 베스트"
- [ ] 개인화 기능 터치 시 → Soft-gate 모달

### 4.6 제품 상세 (s-detail)

- [ ] 상단 뒤로가기 + 제품명 제목 + 찜 아이콘
- [ ] 제품 이미지 (240px 높이, 이모지 플레이스홀더 → 추후 실제 이미지)
- [ ] 브랜드명 + 제품명 + 별점 + 리뷰 수
- [ ] 가격: 할인율(accent) + 원가(취소선) + 현재가
- [ ] 용량(ml) + 피부타입 매칭 뱃지 (로그인 시)
- [ ] 찜/구매 버튼
- [ ] **전성분 섹션**: 주요 성분(녹색 칩) + 일반 성분(회색 칩) + 주의 성분(빨간 칩) + "전체 성분 보기" 버튼
- [ ] **대체품 TOP 3 섹션**:
  - AI 분석 라벨 칩 + "이 제품과 비슷한 대체품" 제목
  - 각 대체품 카드: 이미지 + 브랜드/이름/가격 + 유사도 % 뱃지
  - 카드 하단 비교 정보: ml당가격 / 주요성분 겹침수 / 별점
  - 유사도 55% 초과: 녹색 뱃지 (`sim-high`), 그 이하: 주황 (`sim-mid`) — 임계값은 hybrid 점수 분포에 맞춰 잡은 값(`SIMILARITY_HIGH`)

### 4.7 검색 (s-search)

- [ ] 활성 검색 입력바 (검색 아이콘 + 입력 + "취소" 버튼)
- [ ] **이미지 검색 박스**: 점선 테두리(`--primary`), "사진으로 제품 찾기" 안내
- [ ] 최근 검색어 칩 목록 (X 버튼으로 삭제)
- [ ] 인기 검색어 섹션
- [ ] 검색 결과: "OOO 검색 결과 N개" + 2열 그리드 카드
- [ ] 이미지 업로드 후 → 분석 로딩 → 후보 제품 확인 화면 → 단일 확정 or 2~3개 선택

### 4.8 마이페이지 (s-mypage)

- [ ] 상단 그라디언트 (`--primary-dark` → `--primary`): 아바타 + 닉네임 + 이메일
- [ ] 피부타입 카드 (반투명): 캐릭터 + 타입명 + "재진단하기" 버튼
- [ ] 통계 바: 찜한 제품 수 / 최근 본 제품 / 검색 횟수
- [ ] 메뉴 리스트: 찜한 제품 / 최근 본 제품 / 피부타입 재진단 / 알림 설정 / 로그아웃

---

## 5. 공통 컴포넌트 스펙

### 5.1 버튼

| 종류 | 클래스 | 스펙 |
|------|--------|------|
| 주요 버튼 | `.btn-primary` | height 52px, `--r-xl`, 흰 배경, `--primary` 텍스트 (온보딩용) |
| 필드 버튼 | `.btn-next` | height 52px, `--primary` 배경, 흰 텍스트. 미선택 시 opacity 0.5 |
| 아웃라인 | `.btn-ghost` | height 44px, 투명 배경, `rgba(255,255,255,.4)` 테두리 (온보딩 보조용) |
| 결과 CTA | `.btn-result-cta` | `.btn-next`와 동일 사이즈/색상 |
| 찜 버튼 | `.btn-wish` | 48px 정사각형, `--r-lg`, `--accent` 하트 아이콘 |
| 구매 버튼 | `.btn-buy` | flex:1, height 48px, `--primary` |

**활성 상태 피드백:** 모든 버튼에 `:active { transform: scale(.97) }` 적용

### 5.2 제품 카드 (2열 그리드)

```
.prod-card
  .pimg (aspect-ratio: 1, 그라디언트 배경 bg1~bg6)
    .pbadge (BEST/NEW/SALE)
    .wish (하트 버튼, 하단 우측)
  .pinfo
    .pbrand (12px, --text-sub)
    .pname (12px, 2줄 clamp)
    .prating (별점 + 점수 + 리뷰수)
    .pprice (할인율 + 원가취소선 + 현재가)
```

### 5.3 성분 칩

| 종류 | 클래스 | 색상 |
|------|--------|------|
| 추천/주요 성분 | `.igr-chip` / `.it-key` | `--primary` 테두리 + 텍스트 |
| 일반 성분 | `.igr-chip.neutral` / `.it-norm` | `--gray30` 테두리 + `--text-sub` |
| 주의 성분 | `.igr-chip.warn` / `.it-warn` | `--accent` 테두리 + 텍스트 |

### 5.4 QnA 옵션 카드

선택 전: `border: 2px solid var(--gray20)`, 배경 흰색  
선택 후: `border: 2px solid var(--primary)`, 배경 `--primary-light`  
왼쪽 원형 라벨: 선택 전 회색 → 선택 후 `--primary` 배경 흰 글씨

### 5.5 유사도 뱃지

```
.alt-card-sim
  .sim-high { background: var(--primary) }   // 55% 초과 (SIMILARITY_HIGH = 55, utils/alternatives.ts)
  .sim-mid  { background: var(--warning) }   // 55% 이하
```

---

## 6. API 엔드포인트 요약

모든 인증 필요 요청: `Authorization: Bearer {access_token}` 헤더 포함  
Base URL: 같은 주소에서 화면과 API를 함께 서빙합니다(`/api/v1`). 로컬은 `http://localhost:8000`.

**엔드포인트는 83개**(`/health` 포함)이고, 목록·스키마·시험 호출은 실행한 서버의 Swagger(`/api/docs`)가 정본입니다. 아래는 프론트가 가장 많이 쓰는 묶음입니다.
도메인별 전체 표는 [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) 6장에 있습니다.

| 묶음 | 대표 엔드포인트 |
|---|---|
| 인증 | `POST /auth/signup` · `/auth/login` · `/auth/refresh` · `/auth/logout` · `GET /auth/me` |
| 프로필·진단 | `GET/PATCH /me/profile` · `POST /profile/skin-quiz`(QnA 제출, 사진 분석 `analysisId` 혼합) · `GET /profile/skin-quiz/questions` · `GET/PATCH/DELETE /profile/skin-quiz/latest` |
| 제품 | `GET /products`(필터·정렬) · `/products/search` · `/products/search/ingredient` · `/products/{id}` · `/products/{id}/reviews` · `POST /products/scan`(사진으로 찾기) |
| 유사도·궁합 | `GET /products/{id}/similar`(대체품) · `/products/{id}/skin-fit` · `/products/{id}/analysis` · `GET /skin-fit?ids=` |
| 추천 | `GET /recommendations/main`(홈) · `/recommendations/set`(추천 세트) · `POST /recommendations/budget`(예산 가이드) |
| 개인 데이터 | `/me/closet` · `/me/cart` · `/me/likes` · `/me/recently-viewed` · `/me/orders` · `/me/reviews` · `/me/points` · `/me/gifts/*` · `/me/notifications` |
| 얼굴 사진 분석 | `POST /skin-analysis/check`(사전 검증) · `POST /skin-analysis` · `GET /skin-analysis` · `/me/consents/face-photo` · `/me/subscription` |
| AI | `POST /chat` · `GET /care-tip` · `GET /weather` · 퍼스널 AI(`/me/ai-memory` · `/me/memories` · `/me/preferences` · `/me/skin-report` · `/me/briefing`) |

**QnA 제출 응답 예시** (`POST /profile/skin-quiz`, camelCase):
```json
{
  "id": 12,
  "skinType": "ondalsam",
  "scores": {"moisture": 7, "oil": 5, "sensitivity": 3, "pigmentation": 3, "trouble": 2},
  "ranks": [{"rank": 1, "skinType": "ondalsam", "score": 0.52}],
  "borderline": false,
  "photoUsed": false, "photoOnly": false, "answeredCount": 6,
  "createdAt": "2026-10-31T09:00:00+09:00"
}
```
(`ranks`는 1~3순위 전체이고 `score`는 상위 3개 안의 비중(합 1)입니다. 챗봇은 SSE 스트리밍이 아니라 한 번에 응답하며 대화 이력은 클라이언트가 보냅니다.)

---

## 7. DB 스키마 요약

> **정본은 [db-schema.md](db-schema.md)입니다.** 테이블은 **38개**이고 컬럼·인덱스·적재 순서는 그 문서에만 둡니다(여기에 복사하면 어긋납니다).
> PRD v1.8 §7.9는 설계 시점의 안이라 실제와 테이블·컬럼명이 다릅니다.

프론트 연동에서 자주 헷갈리는 점만 추립니다.

- `products.brand`·`category`는 **문자열이 아니라 FK**(`brand_id`·`category_id`)입니다. 화면용 이름은 API 응답이 조인해서 줍니다
- `product_ingredients.position`은 전성분 표기 순서입니다. 함량 내림차순이라 순서 자체가 정보입니다
- 카테고리는 **스킨케어 / 마스크팩 / 클렌징 / 선케어 4종**뿐입니다. 얼굴용만 적재합니다
- 목록·검색은 기본으로 `composition = 'single'`만 내보냅니다(기획·증정·묶음은 숨김). 옵션형 묶음은 대표 옵션만 나오고 상세에서 드롭다운으로 고릅니다
- 피부 궁합은 `product_skin_fit`(제품 × 8타입, 사전 계산)을 읽습니다. 옛 `skin_type_rules`·`tags`는 더 이상 읽지 않습니다
- `users.id`는 UUID, `profiles.skin_type` 값: `ondalsam | mulgae | subuji | hwasan | samak | injeolmi | yuriguseul | memilmuk`
- 유사도 `similarities.method`는 `tfidf` / `hybrid`(기본)입니다. jaccard·rbo는 평가 후 제거했습니다

## 8. 기술 스택 및 환경 설정

### 8.1 기술 스택

| 영역 | 기술 |
|------|------|
| **Frontend** | React 18 + TypeScript + Vite + Tailwind CSS, framer-motion, Capacitor(Android 앱), MediaPipe(촬영 전 얼굴 확인) |
| **Backend** | Python 3.11 + FastAPI(비동기) + SQLAlchemy 2.0 + Alembic |
| **인증** | 자체 구현 — bcrypt 해싱 + JWT(액세스 30분 / 리프레시 14일, 회전). FastAPI-Users·passlib은 쓰지 않음 |
| **DB** | PostgreSQL 16(+ `pg_trgm`) — 개발 Neon, 운영 AWS. Redis 7(캐시·일일 한도) |
| **유사도** | numpy + scipy로 TF-IDF/코사인 직접 구현(scikit-learn 미사용), 성분 기능 라벨 기반 hybrid |
| **이미지 인식** | 네이버 CLOVA OCR + `pg_trgm` (Tesseract/EasyOCR은 벤치마크 후 탈락) |
| **얼굴 분석** | Perfect Corp YouCam(외부 API), OpenCV YuNet + MediaPipe 가림 검사 |
| **챗봇** | OpenAI `gpt-4o-mini` → 실패 시 Anthropic `claude-haiku-5-5`, 전부 실패하면 DB 규칙 폴백 |
| **인프라** | Docker Compose(로컬), AWS Lightsail 컨테이너 + DB(운영) |
| **모니터링** | Sentry + structlog |

### 8.2 로컬 개발 환경 요구사항

- Docker Desktop 설치 (RAM 8GB 이상 권장)
- Node.js 22 LTS(`frontend/.nvmrc`), Python 3.11+
- `.env`는 루트의 `.env.example`을 복사해 채웁니다. 필수는 `DATABASE_DSN`(Neon 연결 문자열) 하나이고,
  `OPENAI_API_KEY`·`ANTHROPIC_API_KEY`(챗봇), `CLOVA_OCR_*`(사진으로 찾기), `PERFECT_CORP_*`(얼굴 분석), `OPENWEATHER_API_KEY`(날씨)는 없어도 서버가 뜹니다(해당 기능만 폴백/503)

### 8.3 Docker Compose 구성

```
services:
  backend:   python fastapi (./backend)
  frontend:  node react (./frontend)
  # 프로파일 local-db 를 켜면 postgres:16 · redis:7 도 함께 뜬다
```

기본 기동에는 `backend`·`frontend` 둘뿐입니다(팀 공용 DB가 Neon). 자세한 절차는 [루트 README](../README.md)와 [backend/README.md](../backend/README.md).

---

## 9. 개발 우선순위

설계 당시의 P0/P1a 체크리스트는 모두 구현됐거나 대체됐습니다. 현재 진척의 정본은 **코드·`docs/db-schema.md`·루트 `CLAUDE.md`의 현황표**입니다
(`.taskmaster/tasks/tasks.json`은 진척 판단에 쓰지 않습니다).

| 설계 당시 항목 | 현재 |
|---|---|
| 식약처 수집기·올리브영 크롤러·성분 정규화 | 올리브영 Playwright 크롤러 + 협회 성분 사전 정규화(97.8%) 완료. 식약처 API 수집기는 초기 코드만 남음 |
| QnA 7문항 + 8타입 매핑 | **6문항**, 선택지 가중치(`quiz_options.weights`) + 8타입 프로필 유클리드 거리 |
| TF-IDF / Jaccard / RBO 비교 실험 | 비교 후 jaccard·rbo 제거, **hybrid**(역할 가중 TF-IDF + 기능 프로필 + 제형 일치) 채택 — [similarity.md](similarity.md) |
| Redis 벡터 캐싱 | 유사도는 `similarities` 테이블에 **사전 계산**해 적재(Redis는 응답 캐시용) |
| 룰 기반 프로필 추천 | `product_skin_fit`(제품 × 8타입 궁합) + 홈 추천 점수 |
| 가성비 비교 API | 성분 비교 화면(`/compare`) + 단가(`unit_price`) |
| Hit Rate Ground Truth 50쌍 | 시드 80개 × 후보 843건 평가셋(판정자 AI 1명), nDCG@10 0.799 |
| 온보딩·QnA·홈·상세·검색·마이페이지·Soft-gate | 구현 + 화장대·장바구니·주문·선물·후기·알림·카테고리·스캔 추가 |
| QnA 완주율 80% / 만족도 설문 (베타) | **미수행**(베타 테스트 Task 10 대기) |

---

## 10. 팀 역할 분담

| 역할 | 주요 담당 | 비고 |
|------|---------|------|
| **PM/기획** | PRD 유지, QnA 문항 설계, 매핑 룰 검증, 발표 자료 | 1명 |
| **Data Engineer** | 식약처/크롤러/정규화 파이프라인, 피부타입-성분 매핑 DB | 1~2명 |
| **ML Engineer** | 유사도 알고리즘 실험, OCR 모듈, 프로필 추천 엔진, 예산 가이드(P1a) | 1~2명 |
| **Backend** | FastAPI 서버·API, 인증·프로필 API, Docker 환경, 서버 배포(P1) | 1~2명 |
| **Frontend** | React 웹앱, 온보딩·QnA·메인·상세·검색 UI, 반응형 | 1~2명 |
| **Designer (선택)** | 8타입 캐릭터 일러스트, 온보딩·메인 디자인 | 외부 합류 가능 |

> 소규모 팀은 1인 2역 가능. 각 업무에 Primary(주담당) + Secondary(보조) 지정 필수.  
> 캐릭터 일러스트는 P0에서 임시 이모지 사용 → 발표 전 최종 적용.

---

## 11. 주요 구현 주의사항

### 11.1 디자인

- **토큰 사용 필수**: 색상·간격을 하드코딩하지 말고 반드시 CSS 변수 사용
- **모바일 퍼스트**: 375px 기준 설계, 768px 이상 반응형 대응
- **활성 피드백**: 탭 가능한 모든 요소에 `transform: scale(.97)` active 상태 적용
- **캐릭터 일러스트**: P0는 이모지로 대체, `<임시>` 주석 표시

### 11.2 인증 / 보안

- JWT: access token 30분 / refresh token 14일(갱신마다 회전, DB에는 SHA-256 해시만 저장)
- 비밀번호: bcrypt 해싱 (절대 평문 저장 금지)
- 게스트 모드: 서버에 게스트 계정을 만들지 않는다. 진단까지는 로그인 없이 보고, 개인 데이터는 localStorage에 두었다가 로그인하면 서버로 옮긴다. 계정 화면은 `RequireAuth`가 막는다
- 이미지 업로드: OCR 처리 후 즉시 삭제 (서버·로컬 모두 보관 금지). 후기 사진은 사용자가 올리는 콘텐츠라 `review_photos`에 보관한다
- 얼굴 사진 분석: **원본 사진은 저장 금지**(분석 중 메모리에만). 단 업체가 돌려주는 분석 이미지(얼굴 사진이 없는 투명 마스크 PNG, 합성하지 않음)는 지난 결과를 보여 주려고 DB(`skin_analysis_images`)에 보관한다 — 본인만 인증 API로 받고, 계정 삭제 때만 삭제(동의 철회로는 지우지 않는다). 동의 문구(`data/faceConsent.ts`)와 `FACE_CONSENT_VERSION`이 이 보관을 포함한다

### 11.3 유사도 알고리즘 (ML Engineer 필독)

- 성분 리스트는 TF=1이라 IDF만 작동한다. 그래서 IDF로 가중하고, 성분 **역할**(활성 1.0 … 용매 0.2)과 **표기 순서**(앞 성분일수록 크게)로 보완한다
- 방식 선택은 평가셋으로 했다: tfidf 0.635 → hybrid 0.678 → **+ 제형 일치 0.799**(nDCG@10). 상세는 [similarity.md](similarity.md)
- 유사도는 **배치로 사전 계산**해 `similarities`에 적재한다(실시간 계산 금지). 카테고리 안에서만 비교하고, 단일제품(`composition = 'single'`)만 계산한다
- 용량·매수만 다른 같은 제품의 변형은 후보 하나로 접고, 같은 옵션 그룹은 서로 대체품으로 올리지 않는다
- 점수 임계값(`SIMILARITY_HIGH = 55`)은 방식을 바꿀 때마다 분포를 보고 다시 잡는다

### 11.4 QnA 진단 룰

- 선택지별 5축 증감은 DB `quiz_options.weights`에 두되, **원본은 프론트 `data/skinTypeScoring.ts`**다(비회원이 오프라인에서도 진단을 끝내야 해서). `scripts/seed_quiz.py`가 DB로 옮긴다. 서버(`services/diagnosis.py`)와 프론트는 값이 같아야 한다
- 8타입 프로필(5축 값)은 코드 상수이고, 내 5축과의 유클리드 거리로 순위를 낸다. 1·2순위 근사도 차이가 0.03 이하이면 `borderline`으로 두 타입 사이임을 안내한다
- QnA 응답 원본 + 5축 점수 + 상위 3순위를 모두 DB에 저장한다(`diagnoses`·`diagnosis_ranks`, 문항 버전 `version_id` 포함 — 추후 룰 재산정 가능)
- 얼굴 사진 분석이 있으면 서버가 저장된 분석 점수를 섞는다(문항 전부 0.4 / 일부 0.5). **클라이언트가 보낸 점수는 받지 않는다**

### 11.5 크롤링 / 데이터

- 올리브영 `robots.txt` 사전 확인 필수
- 요청 간 2~5초 랜덤 딜레이 + User-Agent 로테이션
- 식약처 API: 일 1,000건 제한 → 멀티 키 발급 검토
- 성분명 정규화 실패는 버리지 않고 `code = NULL`로 신규 등록하고, 오타는 `ingredient_typo_fixes.csv`·`pg_trgm` 후보 + 사람 검토로 교정한다(`scripts/find_typo_aliases.py`)

### 11.6 챗봇

- 모델: OpenAI `gpt-4o-mini` → 실패 시 Claude `claude-haiku-5-5` → 전부 실패하면 DB 규칙 폴백(`mode: "fallback"`). 키가 없어도 서버는 뜬다
- 프롬프트 구성: 피부타입 · 오늘 날씨 · 개인 요약(로그인 사용자) · 참고 제품 데이터(RAG) · 클라이언트가 보낸 최근 대화 이력
- 제품 사실(이름·가격·성분·평점)은 **제공된 데이터에 있는 것만** 말하게 한다. 성분 자체 설명은 일반 지식임을 밝히고 허용한다
- 비회원은 IP당 일일 3회(`GUEST_CHAT_DAILY_LIMIT`, Redis), 초과 시 로그인 유도
- 제품 카드: 도구가 찾은 제품을 응답의 `cards`로 내려 프론트가 렌더링한다(`[PRODUCT_CARD:id]` 마커 방식은 쓰지 않음). 담기는 `actions` 제안을 사용자가 버튼으로 확정한다

### 11.7 성능 목표

| 항목 | 목표 |
|------|------|
| 텍스트 검색 응답 | 3초 이내 |
| 이미지 분석 | 5초 이내 |
| 메인 추천 로드 | 2초 이내 |
| 유사도 계산 (2,000개 기준) | ~20ms (numpy 배치) |
| 챗봇 첫 토큰 (P1a) | 1초 이내 스트리밍 |

---

## 참고 문서

- `docs/PRD_swappy_v1.8.md` — 전체 기획 명세
- `docs/design/prototype.html` — 화면 디자인 시연 (브라우저에서 직접 열어 확인)
- [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) · [db-schema.md](db-schema.md) · [similarity.md](similarity.md) — 구현 현황 정본
