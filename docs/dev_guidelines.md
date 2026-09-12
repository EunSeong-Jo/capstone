# swappy — 앱 개발 가이드라인 v1.0

> PRD v1.8 + prototype.html 기반. 팀원이 일관된 방향으로 개발할 수 있도록 디자인 시스템, 화면 구조, API, DB, 역할 분담을 한 문서에 정리합니다.

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
온보딩(가입) → 피부타입 QnA(7~10문항) → 8타입 결과 캐릭터
    → 추천 세트 팝업 → 메인(큐레이션) → 제품 상세 → 대체품 TOP 3 → 가성비 비교 → 구매 링크
```

### 서비스 우선순위 한 줄 요약

| 우선순위 | 범위 | 목표 완성 |
|---------|------|---------|
| **P0** | 회원가입·QnA·프로필 추천·대체품·비교·구매링크 | 7월 말 (로컬) |
| **P1a** | 예산 가이드·AI 챗봇·성분 필터링·서버 배포 | 8월 말 |
| **P1b** | KoBERT·알고리즘 고도화 (여유 시) | 9월 |
| **P2** | 날씨 추천·도메인 확장 (졸업작품 발표 후) | 10월~ |

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

| 화면 ID | 화면명 | 진입 조건 |
|---------|--------|---------|
| `s-onboard` | 스플래시 / 온보딩 | 앱 최초 실행 |
| `s-qna` | 피부타입 QnA | "가입하기" 선택 후 |
| `s-result` | QnA 결과 (캐릭터 확인) | QnA 완료 |
| `s-popup` | 추천 세트 팝업 | 결과 화면 CTA 클릭 |
| `s-home` | 메인 홈 | 팝업 닫기 또는 "둘러보기" |
| `s-detail` | 제품 상세 + 대체품 TOP3 | 제품 카드 클릭 |
| `s-search` | 검색 (텍스트 + 이미지) | 하단 탭 또는 검색바 |
| `s-mypage` | 마이페이지 | 하단 탭 |

### 3.2 전체 네비게이션 플로우

```
[첫 실행]
  s-onboard
    ├── "가입하기" → s-qna → s-result → s-popup → s-home
    └── "둘러보기" → s-home (게스트 모드)

[하단 내비게이션]
  홈(s-home) | 검색(s-search) | 마이(s-mypage)

[메인에서 상세로]
  s-home 제품 카드 탭 → s-detail
  (상세 페이지 하단에 대체품 TOP3 + 가성비 비교 내장)

[Soft-gate]
  게스트가 개인화 기능 클릭 → 가입 유도 모달
```

### 3.3 하단 내비게이션 탭 구성

```
[홈 아이콘]  [검색 아이콘]  [마이페이지 아이콘]
  홈            검색            MY
```

활성 탭은 `--primary` 색상, 비활성은 `--gray50`.

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
- [ ] 총 7~10문항 (5축: moisture, oil, sensitivity, pigmentation, trouble)
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
  - 유사도 ≥ 80%: 녹색 뱃지 (`sim-high`), 50~80%: 주황 (`sim-mid`)

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
  .sim-high { background: var(--primary) }   // ≥ 80%
  .sim-mid  { background: var(--warning) }   // 50~79%
```

---

## 6. API 엔드포인트 요약

모든 인증 필요 요청: `Authorization: Bearer {access_token}` 헤더 포함  
Base URL: `http://localhost:8000` (P0) / `https://api.swappy.com` (P1)

### 6.1 인증

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/v1/auth/signup` | 회원가입 `{email, password, agreements}` |
| POST | `/api/v1/auth/login` | 로그인 `{email, password}` |
| POST | `/api/v1/auth/refresh` | 토큰 갱신 `{refresh_token}` |

### 6.2 프로필 / QnA

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/v1/profile/me` | 내 프로필 조회 |
| POST | `/api/v1/profile/skin-quiz` | QnA 제출 `{answers: [{question_id, value}]}` |
| PATCH | `/api/v1/profile/me` | 프로필 갱신 (도메인 선택 등) |

**QnA 응답 예시:**
```json
{
  "skin_type": "ondalsam",
  "traits": {"moisture": 7, "oil": 5, "sensitivity": 2},
  "recommended_tags": ["균형보습", "항산화"],
  "avoid_tags": []
}
```

### 6.3 추천

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/v1/recommendations/main` | 메인 큐레이션 `?limit=12` |
| GET | `/api/v1/recommendations/welcome-set` | 가입 직후 추천 세트 (로그인 필요) |
| POST | `/api/v1/recommendations/budget` | 예산 가이드 (P1a) `{budget, categories, preferences?}` |

### 6.4 제품 / 유사도

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/v1/products/search` | 텍스트 검색 `?q=에스티로더&limit=10` |
| POST | `/api/v1/products/search/image` | 이미지 검색 `multipart/form-data` |
| GET | `/api/v1/products/{id}` | 제품 상세 + 전성분 |
| GET | `/api/v1/products/{id}/alternatives` | 대체품 TOP 3 `?limit=3` |
| GET | `/api/v1/products/{id}/compare` | 가성비 비교표 `?compare_ids=2,3,4` |

### 6.5 챗봇 (P1a)

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/v1/chat` | 메시지 전송 (SSE 스트리밍) |
| GET | `/api/v1/chat/sessions/{id}` | 대화 히스토리 |

---

## 7. DB 스키마 요약

> **정본은 [db-schema.md](db-schema.md)입니다.** 여기서는 프론트엔드 연동에 자주 쓸 테이블만 추립니다.
> PRD v1.8 §7.9는 설계 시점의 안이라 실제와 테이블·컬럼명이 다릅니다.
>
> 2026-08-17 기준 — 테이블 18개 중 **제품·성분 6개에만 데이터가 있습니다.** 나머지는 스키마만 있습니다.

### 7.1 제품 · 성분 (데이터 있음)

```sql
products              -- 4,013행
  id, goods_no(UQ), name,
  brand_id(FK → brands), category_id(FK → categories),
  price, list_price, discount_rate, rating, review_count,
  image_url, product_url,
  volume, country, manufacturer, expiry, report_no,
  ingredient_count_raw,      -- 원본 성분 개수(중복 포함)
  status('active'), source('oliveyoung'), created_at, updated_at

ingredients           -- 23,521행 (대한화장품협회 표준화명칭목록 + 크롤링 신규)
  id, norm_name(UQ), name_ko, name_en, code,
  ewg_grade, grade, is_allergen        -- 앞 셋은 아직 비어 있음

product_ingredients   -- 163,125행 · (product_id, ingredient_id) 복합 PK
  product_id, ingredient_id, position, raw_name

brands                -- 511행 : id, name(UQ)
categories            -- 4행   : id, code(UQ), label, parent_id
```

**주의할 점**

- `products.brand`·`category`는 **문자열이 아니라 FK**입니다. 표시하려면 조인하세요
- `position`은 전성분 표기 순서입니다. 함량 내림차순이라 순서 자체가 정보입니다
- 카테고리는 **스킨케어 / 마스크팩 / 클렌징 / 선케어 4종**뿐입니다. 얼굴용만 적재합니다
- `ingredients.grade`·`ewg_grade`는 수동 큐레이션 대상이라 **아직 NULL**입니다. 성분 등급 UI는 이 값이 채워진 뒤에 붙습니다

```sql
-- 제품 1건의 전성분을 순서대로
SELECT p.name, i.name_ko, pi.position
FROM products p
JOIN product_ingredients pi ON pi.product_id = p.id
JOIN ingredients i ON i.id = pi.ingredient_id
WHERE p.id = $1
ORDER BY pi.position;
```

### 7.2 사용자 / 프로필 (스키마만)

```sql
users     id(uuid), email(UQ), password_hash, nickname,
          provider('local'/kakao/google), is_active, created_at, last_login_at

profiles  user_id(PK, FK → users), skin_type, scores(jsonb),
          budget_min, budget_max, domains(jsonb)
```

`skin_type` 값: `ondalsam | mulgae | subuji | hwasan | samak | injeolmi | yuriguseul | memilmuk`

### 7.3 진단 (스키마만)

```sql
quiz_versions    id, label, is_active           -- is_active 하나만 켜서 현행 문항을 정한다
quiz_questions   id, version_id(FK), code, axis, body, order_no
quiz_options     id, question_id(FK), label, weights(jsonb), order_no
diagnoses        id, user_id(FK, NULL 허용), guest_token, version_id(FK),
                 answers(jsonb), scores(jsonb)  -- 비회원 진단은 guest_token으로
diagnosis_ranks  diagnosis_id(FK), rank, skin_type, score  -- 1~3순위
```

### 7.4 추천 (스키마만)

```sql
similarities     product_id(FK), similar_id(FK), method, score,
                 shared_ingredients(jsonb), computed_at
                 -- product_id가 기준 제품, similar_id가 대체품. 방향이 있다
                 -- method: tfidf / jaccard / rbo

skin_type_rules  id, skin_type(UQ), include_tags(jsonb), exclude_tags(jsonb), is_active
tags             id, code(UQ), label          -- 효능 태그 마스터
ingredient_tags  ingredient_id, tag_id        -- 성분 ↔ 태그 N:M
```

## 8. 기술 스택 및 환경 설정

### 8.1 기술 스택

| 영역 | 기술 |
|------|------|
| **Frontend** | React 18 + TypeScript, Tailwind CSS |
| **Backend** | Python 3.11 + FastAPI |
| **인증** | FastAPI-Users + python-jose (JWT) |
| **DB** | PostgreSQL 16 + Redis (Docker) |
| **ML/AI** | scikit-learn (TF-IDF, 코사인), NumPy, SciPy |
| **이미지 인식** | OpenCV + Tesseract + EasyOCR |
| **챗봇 (P1a)** | Claude API (`claude-sonnet-4-20250514`) |
| **인프라 (P0)** | Docker Compose (로컬) |
| **인프라 (P1)** | AWS EC2 |
| **CI/CD** | GitHub Actions |
| **모니터링 (P0)** | Sentry + structlog |

### 8.2 로컬 개발 환경 요구사항

- Docker Desktop 설치 (RAM 8GB 이상 권장)
- Node.js 20+, Python 3.11+
- `.env` 파일에 다음 키 설정 필요:
  ```
  POSTGRES_URL=...
  REDIS_URL=...
  JWT_SECRET=...
  식약처_API_KEY=...
  NAVER_SHOPPING_API_KEY=...
  ANTHROPIC_API_KEY=...   # P1a
  ```

### 8.3 Docker Compose 구성 (P0 기준)

```
services:
  db: postgres:16
  redis: redis:7
  backend: python fastapi (./backend)
  frontend: node react (./frontend)
```

---

## 9. 개발 우선순위

### P0 체크리스트 (7월 말 기준)

> 이것만 있으면 E2E 플로우 시연 가능.

**데이터 (5월 전반 ~ 후반)**
- [ ] 식약처 API 수집기 구현 (스킨케어 2,000개 목표)
- [ ] 올리브영 크롤러 (가격·이미지·별점)
- [ ] 성분명 정규화 파이프라인 (INCI 기준)
- [ ] 피부타입 QnA 7문항 + 8타입 매핑 룰 v1

**ML/AI (6월)**
- [ ] TF-IDF / Weighted Jaccard / RBO 3종 알고리즘 비교 실험
- [ ] 최적 알고리즘 선정 + 벡터 캐싱 (Redis)
- [ ] 룰 기반 프로필 추천 엔진 (skin_type → 추천 성분 태그 → 상위 제품)

**Backend (6월~7월 전반)**
- [ ] FastAPI 기반 REST API 서버
- [ ] JWT 인증 모듈 (signup / login / refresh)
- [ ] 프로필 + QnA API
- [ ] 제품 검색 API (텍스트 + 이미지)
- [ ] 유사도 API (대체품 TOP 3)
- [ ] 가성비 비교 API
- [ ] 메인 큐레이션 API
- [ ] Docker Compose 로컬 환경 구성

**Frontend (6월 후반~7월 전반)**
- [ ] 온보딩 화면 (s-onboard)
- [ ] QnA 흐름 (s-qna → s-result → s-popup)
- [ ] 메인 홈 (s-home): 게스트 / 로그인 분기
- [ ] 제품 상세 + 대체품 TOP 3 (s-detail)
- [ ] 검색 화면 (s-search)
- [ ] 마이페이지 (s-mypage)
- [ ] 하단 네비게이션 탭
- [ ] Soft-gate 모달

**통합 및 검증 (7월 후반)**
- [ ] E2E 플로우 전체 동작 확인
- [ ] QnA 완주율 80% / 피부타입 만족도 설문 (베타 자가평가)
- [ ] Hit Rate Ground Truth 50쌍 구축 + 측정

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

- JWT: access token 30분 / refresh token 30일
- 비밀번호: bcrypt 해싱 (절대 평문 저장 금지)
- 게스트 모드: 로컬 `sessionStorage`에 임시 UUID 발급, 개인화 API 호출 시 401 → Soft-gate 모달
- 이미지 업로드: OCR 처리 후 즉시 삭제 (서버·로컬 모두 보관 금지)

### 11.3 유사도 알고리즘 (ML Engineer 필독)

- TF-IDF 한계: 성분 리스트에서 TF=1이므로 IDF만 작동 → 위치 기반 가중치로 보완
- **3종 알고리즘을 Ground Truth 50쌍으로 먼저 비교 실험 후 최적 선택** (6월 전에 완료)
- 벡터 사전 계산 후 Redis 캐싱 필수 (실시간 계산 금지)
- 동일 브랜드 결과는 최대 1개로 제한

### 11.4 QnA 진단 룰

- 가중치 룰은 코드가 아닌 DB `skin_type_rules` 테이블로 관리 (재배포 없이 튜닝 가능)
- 점수 차이가 작을 때 (≤2점 차이) → 두 타입 사이임을 안내 + 보조 질문으로 확정
- QnA 응답 원본 + 5축 점수 + 최종 타입 모두 DB 저장 (추후 룰 재산정 가능하게)

### 11.5 크롤링 / 데이터

- 올리브영 `robots.txt` 사전 확인 필수
- 요청 간 2~5초 랜덤 딜레이 + User-Agent 로테이션
- 식약처 API: 일 1,000건 제한 → 멀티 키 발급 검토
- 성분명 정규화 실패 시 수동 검토 큐(`normalization_queue` 테이블) 활용

### 11.6 챗봇 (P1a)

- Claude API 모델: `claude-sonnet-4-20250514`
- Context Injection 순서: 사용자 프로필 → 현재 제품 정보 → 대체품 결과 → 성분 사전 참조 → 최근 10턴 대화
- 의료 진단 질문은 반드시 "피부과 전문의 상담 권장" 안내로 전환
- 사용자당 일일 50회 제한 (미로그인 10회), Redis로 카운팅
- 챗봇 내 제품 카드 삽입: LLM 응답의 `[PRODUCT_CARD:product_id]` 마커를 프론트가 파싱하여 컴포넌트 렌더링

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
- `docs/prototype.html` — 화면 디자인 시연 (브라우저에서 직접 열어 확인)
- `tasks/` — 개별 작업 태스크 목록
