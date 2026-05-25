# Task ID: 5

**Title:** 프론트엔드 개발

**Status:** pending

**Dependencies:** 3, 4, 6

**Priority:** high

**Description:** React 18 + TypeScript + Tailwind CSS로 프론트엔드를 개발합니다. 온보딩 흐름(Task 11)을 제외한 메인 홈, 제품 검색·상세, 대체품 비교, 구매 링크, 마이페이지, 하단 네비게이션, 모바일 반응형 등 핵심 화면을 구현합니다.

**Details:**

React와 Tailwind CSS를 사용하여 전체 앱 UI를 개발합니다. 디자인 토큰 시스템(--primary: #3D8F6F, --accent: #FF5C7A)을 적용합니다. 주요 화면 구성: (1) 온보딩 - 풀스크린 그라디언트 배경, 가입/둘러보기 버튼; (2) 피부타입 QnA - 진행 바, 7~10문항, 옵션 카드 선택 UX; (3) QnA 결과 - 8타입 캐릭터(옹달샘/물개/수부지/화산/사막/인절미/유리구슬/메밀묵) 표시, 추천/주의 성분 칩, CTA; (4) 추천 세트 팝업 - bottom-sheet, 피부타입별 3종 세트; (5) 메인 홈 - 게스트/로그인 분기 큐레이션, 피부타입 배지, 배너 슬라이더; (6) 마이페이지 - 피부타입 카드, 통계, 재진단 메뉴; (7) Soft-gate 모달 - 개인화 기능 접근 시 가입 유도; (8) 검색/결과/비교/챗봇 UI. 기존 프로토타입(docs/prototype.html)의 디자인 토큰 및 컴포넌트 스타일을 참조하여 일관성 유지. 모바일 반응형 디자인을 적용합니다.

**Test Strategy:**

크로스 브라우저 테스트(Chrome, Firefox, Safari, Edge)를 통해 UI가 일관되게 보이는지 확인합니다. 피부타입 QnA 플로우, 온보딩→홈 전환, 게스트/로그인 분기 등 사용자 시나리오를 따라가며 기능이 정상적으로 작동하는지 테스트합니다. Soft-gate 모달이 개인화 기능 접근 시 정상 노출되는지 확인합니다.

## Subtasks

### 5.1. 디자인 토큰 시스템 및 공통 컴포넌트 설정

**Status:** pending  
**Dependencies:** None  

PRD v1.8 디자인 토큰(--primary: #3D8F6F, --accent: #FF5C7A 등)을 Tailwind CSS 설정에 적용하고, 공통 UI 컴포넌트(버튼, 칩, 카드, 모달)를 개발합니다.

**Details:**

docs/prototype.html의 CSS 변수 체계를 Tailwind CSS tailwind.config.js에 맵핑합니다. 공통 컴포넌트: Button(primary/ghost/next), Chip(on/off/warn), Card(product/rank), Modal(bottom-sheet/center), ProgressBar, Icon 등. 색상 토큰: primary(#3D8F6F), primary-light(#EAF5EF), accent(#FF5C7A), accent-light(#FFF0F3), gray 팔레트, shadow 변수. 타이포그래피: Noto Sans KR, 크기 변수(t-xs~t-4xl). 간격/라운딩 변수 적용.

### 5.2. 메인 홈 화면 리뉴얼

**Status:** pending  
**Dependencies:** 5.1  

게스트/로그인 분기 큐레이션, 피부타입 배지, 배너 슬라이더를 포함한 메인 홈 화면을 개발합니다.

**Details:**

prototype.html의 #s-home, header, search-wrap, banner, type-badge, section 스타일 참조. 헤더: 로고('대체뭐야'), 알림/설정 아이콘. 검색 바(search-pill): 돋보기 아이콘, 플레이스홀더, 카메라 아이콘. 배너 슬라이더(banner, bslide): 프로모션/이벤트 배너, 도트 인디케이터. 피부타입 배지(type-badge): 로그인 사용자만 표시, 캐릭터 아이콘, 타입명, 서브텍스트. 게스트 모드: '피부타입 진단하고 맞춤 추천 받기' 배너 표시. 로그인 모드: 피부타입 기반 큐레이션 섹션('당신을 위한 추천'). 섹션: 인기 대체품, 카테고리별 추천 등. 제품 그리드(prod-grid), 랭크 카드(rcard).

### 5.3. 검색 UI 개발

**Status:** pending  
**Dependencies:** 5.1  

사용자가 제품을 검색할 수 있는 검색 UI를 개발합니다. 텍스트 검색 및 이미지 검색 기능을 포함합니다.

**Details:**

검색 입력 필드: 자동완성 기능, 최근 검색어 표시. 검색 필터 칩(chips-row): 카테고리, 브랜드, 가격대 필터. 이미지 검색: 카메라 아이콘 클릭 시 이미지 업로드 또는 촬영. React와 Tailwind CSS를 사용하여 반응형 디자인 적용.

### 5.4. 결과 표시 UI 개발

**Status:** pending  
**Dependencies:** 5.3  

검색 결과 및 대체품 추천 결과를 사용자에게 표시하는 UI를 개발합니다.

**Details:**

검색 결과를 그리드(prod-grid) 또는 리스트 형태로 표시. 각 제품 카드(prod-card): 이미지, 배지(BEST/NEW/SALE), 찜하기 버튼, 브랜드명, 제품명, 별점, 가격. 유사도 점수 배지 표시. 성분 유사도 기반 정렬. Tailwind CSS를 활용하여 스타일링.

### 5.5. 비교 기능 UI 구현

**Status:** pending  
**Dependencies:** 5.4  

사용자가 선택한 제품을 비교할 수 있는 UI를 개발합니다. 가성비 비교표를 포함합니다.

**Details:**

선택된 제품 비교 화면: 2~3개 제품 나란히 표시. 비교 항목: 가격, 용량, ml당 가격, 주요 성분, 별점. 가성비 비교표: 테이블 형태로 시각화. 성분 일치/차이 하이라이트. React 컴포넌트로 비교 로직 구현.

### 5.6. 구매 링크 연결 UI 개발

**Status:** pending  
**Dependencies:** 5.4, 5.5  

외부 쇼핑몰 구매 페이지로 연결되는 UI를 구현합니다.

**Details:**

대체품 결과 카드 및 비교 화면에 올리브영, 쿠팡, 네이버 쇼핑 등 외부 구매 페이지로 연결되는 버튼을 추가합니다. 최저가 정보를 함께 표시하고, 새 탭(target='_blank')으로 열리도록 구현합니다. product_prices 테이블에서 가져온 구매 링크를 사용합니다.

### 5.7. 마이페이지 개발

**Status:** pending  
**Dependencies:** 5.1  

사용자의 피부타입 카드, 사용 통계, 재진단 메뉴를 포함한 마이페이지를 개발합니다.

**Details:**

피부타입 카드: 캐릭터 아이콘, 타입명, 진단일, 추천/주의 성분 요약. 사용 통계: 검색 횟수, 비교 횟수, 찜한 제품 수. 재진단 메뉴: '피부타입 다시 진단하기' 버튼 클릭 시 QnA 화면으로 이동. 설정: 알림, 로그아웃 등. 로그인 상태가 아닌 경우 로그인 유도 UI 표시.

### 5.8. 하단 내비게이션 및 화면 전환 시스템 구현

**Status:** pending  
**Dependencies:** 5.1  

하단 탭 내비게이션(홈/검색/비교/마이페이지)과 화면 전환 애니메이션을 구현합니다.

**Details:**

prototype.html의 bnav 스타일 참조. 하단 내비게이션: 홈, 검색, 비교, 마이페이지 탭. 활성 탭 하이라이트(primary 색상). 화면 전환: 슬라이드 애니메이션(screen.active, screen.slide-left). React Router 또는 상태 기반 화면 관리.

### 5.9. 모바일 반응형 디자인 적용

**Status:** pending  
**Dependencies:** 5.2, 5.3, 5.4, 5.5, 5.7  

모바일 디바이스에서 최적의 사용자 경험을 제공하기 위해 반응형 디자인을 적용합니다.

**Details:**

CSS 미디어 쿼리를 사용하여 다양한 화면 크기(320px~428px 모바일, 768px 태블릿)에 맞춰 UI 요소의 크기와 배치를 조정합니다. 터치 친화적 버튼 크기(최소 44px), 스와이프 제스처 지원. 모든 주요 화면에서 반응형 적용.

### 5.10. 프론트엔드 테스트 및 검증

**Status:** pending  
**Dependencies:** 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9  

개발된 프론트엔드 컴포넌트들을 크로스 브라우저 환경에서 테스트합니다.

**Details:**

Chrome, Firefox, Safari, Edge에서 UI가 일관되게 보이는지 테스트합니다. 사용자 시나리오(온보딩→QnA→결과→추천세트→홈→검색→비교→마이페이지)를 따라가며 모든 기능이 정상적으로 작동하는지 검증합니다. 게스트/로그인 분기, Soft-gate 모달, 피부타입별 UI 변경 테스트.
