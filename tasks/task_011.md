# Task ID: 11

**Title:** 온보딩 UI 전체 흐름 개발 (PRD v1.8, P0)

**Status:** pending

**Dependencies:** 12, 13, 14

**Priority:** high

**Description:** prototype.html 디자인 토큰 기반 React 컴포넌트로 온보딩 스플래시, QnA 화면, 결과 화면, 추천 세트 팝업, Soft-gate 모달을 구현하고, 중간 이탈 시 localStorage 진행률 저장 기능을 포함합니다.

**Details:**

## 구현 상세

### 1. 디자인 토큰 시스템 (prototype.html 기반)
prototype.html에 정의된 CSS 변수를 Tailwind CSS 설정으로 마이그레이션:
- Primary: `#3D8F6F`, Primary-light: `#EAF5EF`, Primary-dark: `#2B6B52`
- Accent: `#FF5C7A`, Accent-light: `#FFF0F3`
- Gray scale: `#FFFFFF` ~ `#111827`
- Typography: `--t-xs: 11px` ~ `--t-4xl: 28px`
- Spacing: `--sp1: 4px` ~ `--sp8: 32px`
- Border radius: `--r-sm: 4px` ~ `--r-full: 999px`
- Shadows: `--shadow-sm`, `--shadow-md`, `--shadow-lg`

### 2. 온보딩 스플래시 화면 (s-onboard)
**레이아웃:**
- 풀스크린 그라디언트 배경: `linear-gradient(160deg, #1B5E40 0%, #3D8F6F 60%, #5BB88A 100%)`
- `.ob-body`: flex column, space-between, padding `32px 24px`

**컴포넌트:**
- 앱 로고: `🧴` 이모지 80px, drop-shadow
- 앱명: "대체뭐야" (font-size: 28px, font-weight: 900)
- 3개 핵심 기능 카드 (`.ob-feat`):
  - 반투명 배경: `rgba(255,255,255,0.15)`, backdrop-filter: `blur(8px)`
  - border-radius: 16px, padding: 12px 16px
  - 아이콘 22px + 텍스트
  - 내용: 🔬 성분 분석, 💰 저렴이 매칭, 🎯 예산 가이드
- 버튼 영역:
  - '피부 타입 진단하고 시작하기' 주요 버튼 (`.btn-primary`): 
    - 52px 높이, border-radius 16px, 배경 #fff, 색상 --primary
  - '로그인 없이 둘러보기' ghost 버튼 (`.btn-ghost`):
    - 44px 높이, border 1.5px solid rgba(255,255,255,0.4)

### 3. QnA 화면 (s-qna)
**상단 진행 바:**
- `.qna-bar`: height 4px, border-radius 999px, 배경 `--gray20`
- `.qna-bar-fill`: `linear-gradient(90deg, #3D8F6F, #5BB88A)`, transition: `width 0.4s ease`
- 단계 표시: "3 / 7" 형태

**문항 카테고리 칩:**
- `.qna-category`: padding 4px 10px, 배경 `--primary-light`, 색상 `--primary`
- 예: "피부 고민", "유분/수분", "민감도"

**4~5지선다 옵션 카드 (`.qna-opt`):**
- padding 16px, border-radius 16px
- 기본: border 2px solid `--gray20`
- 선택 시: border-color `--primary`, background `--primary-light`
- 선택 원형 레터 (`.qna-opt-letter`): 28px, 선택 시 배경 `--primary`, 색상 #fff

**다음 버튼:**
- 선택 전: opacity 0.5, cursor not-allowed
- 선택 후: opacity 1, active 시 scale(0.97)

### 4. 결과 화면 (s-result)
**결과 카드 (`.result-card`):**
- 배경: 연한 그레이(`--gray05`), 카드: #fff, box-shadow: `--shadow-md`
- 캐릭터 이모지: 72px (8종 피부타입별: 🌊 옹달샘, 🦭 물개, 🌋 화산 등 - 임시)
- 타입명: font-size 24px, font-weight 900
- 설명: font-size 14px, line-height 1.7

**추천/주의 성분 칩:**
- `.r-chip.good`: 배경 `--primary-light`, 테두리 `--primary`
- `.r-chip.warn`: 배경 `--accent-light`, 테두리 `--accent`

**CTA 버튼:**
- '추천 세트 보기': 52px, 배경 `--primary`

**만족도 5점 척도 미니 설문:**
- 별점 또는 숫자(1~5) 선택 UI
- 선택적 피드백 텍스트 입력

### 5. 추천 세트 팝업 (bottom-sheet)
**오버레이:**
- `.popup-overlay`: 배경 rgba(0,0,0,0.5), backdrop-filter: blur(2px)

**시트:**
- `.popup-sheet`: border-radius 20px 20px 0 0, max-height 75%
- 드래그 핸들: width 36px, height 4px, 배경 `--gray30`, border-radius 2px

**세트 카드 (`.popup-card`):**
- 피부타입별 3종 세트 (저가/중가/고가)
- 이미지 60x60, 카테고리 칩, 제품명, 가격
- 매칭률 배지: padding 3px 8px, 배경 `--primary-light`

### 6. Soft-gate 모달
**트리거 조건:**
- 개인화 기능 접근 시 (찜하기, 맞춤 추천, 히스토리 등)
- 게스트 모드에서만 노출

**디자인:**
- 중앙 정렬 모달, 배경 오버레이
- 가입 혜택 설명 + CTA 버튼
- '나중에 하기' 옵션

### 7. localStorage 진행률 저장
**저장 항목:**
- `onboarding_progress`: { currentStep: number, answers: object, timestamp: ISO string }
- 각 문항 답변 시 자동 저장
- 재방문 시 이어서 진행 가능

**구현:**
```typescript
interface OnboardingProgress {
  currentStep: number;
  answers: Record<number, string>;
  timestamp: string;
}

const saveProgress = (step: number, answers: Record<number, string>) => {
  localStorage.setItem('onboarding_progress', JSON.stringify({
    currentStep: step,
    answers,
    timestamp: new Date().toISOString()
  }));
};

const loadProgress = (): OnboardingProgress | null => {
  const saved = localStorage.getItem('onboarding_progress');
  return saved ? JSON.parse(saved) : null;
};
```

### 8. 컴포넌트 구조
```
src/
├── components/
│   ├── onboarding/
│   │   ├── OnboardingSplash.tsx      # 스플래시 화면
│   │   ├── OnboardingQnA.tsx         # QnA 화면
│   │   ├── OnboardingResult.tsx      # 결과 화면
│   │   ├── ProgressBar.tsx           # 진행 바 (0.4s 애니메이션)
│   │   ├── QuestionCard.tsx          # 문항 카드
│   │   ├── OptionCard.tsx            # 선택지 카드
│   │   └── SatisfactionSurvey.tsx    # 만족도 설문
│   ├── common/
│   │   ├── Button.tsx                # Primary/Ghost 버튼
│   │   ├── Chip.tsx                  # 카테고리/성분 칩
│   │   ├── BottomSheet.tsx           # 추천 세트 팝업
│   │   └── Modal.tsx                 # Soft-gate 모달
│   └── recommendation/
│       └── RecommendSetCard.tsx      # 추천 세트 카드
├── hooks/
│   └── useOnboardingProgress.ts      # localStorage 진행률 관리
├── pages/
│   └── Onboarding.tsx                # 온보딩 플로우 통합 페이지
└── styles/
    └── tokens.css                    # 디자인 토큰 정의
```

### 9. 애니메이션 및 트랜지션
- 화면 전환: transform translateX, duration 0.35s, cubic-bezier(0.4, 0, 0.2, 1)
- 진행 바: width transition 0.4s ease
- 버튼 hover/active: transform scale(0.97)
- bottom-sheet: slide-up animation

**Test Strategy:**

## 테스트 전략

### 1. 유닛 테스트
- 각 컴포넌트의 props 전달 및 렌더링 확인
- useOnboardingProgress 훅의 저장/불러오기 로직 테스트
- 버튼 disabled 상태 (선택 전 '다음' 버튼 opacity 0.5) 검증

### 2. 통합 테스트
- 온보딩 전체 플로우 테스트: 스플래시 → QnA → 결과 → 추천 세트
- localStorage 진행률 저장/복원 테스트:
  - 중간 이탈 후 재방문 시 이전 단계에서 이어서 진행되는지 확인
  - 72시간 이상 경과 시 진행률 초기화 여부 확인
- Soft-gate 모달 트리거 조건 검증:
  - 게스트 모드에서 개인화 기능 접근 시 모달 노출
  - 로그인 상태에서는 모달 미노출

### 3. UI/UX 테스트
- 디자인 토큰 적용 검증: 색상, 폰트, 간격이 prototype.html과 일치하는지 확인
- 진행 바 애니메이션 0.4s 동작 확인
- 옵션 카드 선택 시 --primary 테두리+배경 적용 확인
- 선택 전 '다음' 버튼 비활성화(opacity 0.5) 확인
- bottom-sheet 드래그 핸들 및 슬라이드 동작 확인

### 4. 반응형 테스트
- 375px(iPhone), 390px(iPhone 14), 414px(iPhone Plus) 뷰포트 테스트
- 긴 텍스트 및 다양한 언어 지원 확인

### 5. 접근성 테스트
- 버튼 및 선택 요소의 포커스 상태 확인
- 스크린 리더 호환성 (ARIA 라벨)
- 키보드 네비게이션 지원

### 6. 성능 테스트
- 초기 로딩 시간 측정 (목표: 2초 이내)
- localStorage 읽기/쓰기 지연 확인
- 애니메이션 프레임 드롭 없이 60fps 유지 확인

## Subtasks

### 11.1. React 프로젝트 초기 설정 및 디자인 토큰 시스템 구축

**Status:** pending  
**Dependencies:** None  

Vite + React + TypeScript 프로젝트를 초기화하고 prototype.html 기반 디자인 토큰을 Tailwind CSS 설정으로 마이그레이션합니다.

**Details:**

1. Vite + React + TypeScript 프로젝트 초기화 (npm create vite@latest)
2. Tailwind CSS 설치 및 설정
3. prototype.html의 CSS 변수를 tailwind.config.js의 theme.extend로 변환:
   - colors: primary(#3D8F6F), primary-light(#EAF5EF), primary-dark(#2B6B52), accent(#FF5C7A), accent-light(#FFF0F3), gray00~gray100
   - fontSize: t-xs(11px)~t-4xl(28px)
   - spacing: sp1(4px)~sp8(32px)
   - borderRadius: r-sm(4px)~r-full(999px)
   - boxShadow: shadow-sm, shadow-md, shadow-lg
4. 글로벌 스타일(tokens.css) 생성 및 Noto Sans KR 폰트 설정
5. 기본 App.tsx, 라우팅 구조(react-router-dom) 설정

### 11.2. 공통 UI 컴포넌트 개발 (Button, Chip, Modal, BottomSheet)

**Status:** pending  
**Dependencies:** 11.1  

온보딩 전체 흐름에서 재사용되는 공통 UI 컴포넌트를 prototype.html 스타일 기반으로 구현합니다.

**Details:**

1. Button 컴포넌트 (src/components/common/Button.tsx):
   - variant: 'primary'(52px, 배경 #fff, 색상 primary), 'ghost'(44px, 투명 배경, border), 'next'(52px, 배경 primary)
   - disabled 상태: opacity 0.5, cursor not-allowed
   - active 상태: transform scale(0.97)
2. Chip 컴포넌트 (src/components/common/Chip.tsx):
   - variant: 'default'(gray border), 'selected'(primary bg/border), 'good'(primary-light bg), 'warn'(accent-light bg)
   - 카테고리 칩, 성분 칩 용도
3. Modal 컴포넌트 (src/components/common/Modal.tsx):
   - 중앙 정렬, 오버레이 배경(rgba(0,0,0,0.5))
   - 닫기 버튼, 트랜지션 애니메이션
4. BottomSheet 컴포넌트 (src/components/common/BottomSheet.tsx):
   - 드래그 핸들(36x4px), border-radius 20px 20px 0 0
   - max-height 75%, slide-up 애니메이션
   - backdrop-filter: blur(2px)

### 11.3. 온보딩 스플래시 화면 컴포넌트 구현

**Status:** pending  
**Dependencies:** 11.1, 11.2  

앱 진입점인 온보딩 스플래시 화면을 prototype.html의 s-onboard 디자인 기반으로 React 컴포넌트로 구현합니다.

**Details:**

1. OnboardingSplash.tsx 컴포넌트 생성 (src/components/onboarding/OnboardingSplash.tsx):
   - 풀스크린 그라디언트 배경: linear-gradient(160deg, #1B5E40 0%, #3D8F6F 60%, #5BB88A 100%)
   - 상단 영역: 🧴 이모지(80px, drop-shadow), 앱명 '대체뭐야'(28px, font-weight 900), 태그라인
   - 3개 기능 카드(ob-feat): 반투명 배경(rgba(255,255,255,0.15)), backdrop-filter blur(8px)
     - 🔬 성분 분석, 💰 저렴이 매칭, 🎯 예산 가이드
   - 하단 버튼 영역:
     - '피부 타입 진단하고 시작하기' btn-primary → QnA 화면 이동
     - '로그인 없이 둘러보기' btn-ghost → 홈 화면 이동
2. 네비게이션 핸들러 props: onStartDiagnosis, onSkipToHome

### 11.4. QnA 화면 컴포넌트 및 진행 바 구현

**Status:** pending  
**Dependencies:** 11.1, 11.2  

피부타입 진단 QnA 화면을 구현하며, 진행 바(ProgressBar), 문항 카드(QuestionCard), 선택지 카드(OptionCard) 컴포넌트를 개발합니다.

**Details:**

1. ProgressBar.tsx (src/components/onboarding/ProgressBar.tsx):
   - height 4px, border-radius 999px, 배경 gray20
   - fill: linear-gradient(90deg, #3D8F6F, #5BB88A), transition width 0.4s ease
   - props: currentStep, totalSteps
2. QuestionCard.tsx (src/components/onboarding/QuestionCard.tsx):
   - 카테고리 칩(qna-category): 배경 primary-light, 색상 primary
   - 질문 텍스트(qna-q): font-size 18px, font-weight 700
3. OptionCard.tsx (src/components/onboarding/OptionCard.tsx):
   - 4~5지선다 옵션, 기본: border 2px solid gray20
   - 선택 시: border-color primary, background primary-light
   - 레터 마커(A/B/C/D): 28px 원형, 선택 시 배경 primary, 색상 #fff
4. OnboardingQnA.tsx (src/components/onboarding/OnboardingQnA.tsx):
   - 상단: 뒤로가기 버튼, 단계 표시(3/7), ProgressBar
   - 중앙: QuestionCard + OptionCard 목록
   - 하단: '다음' 버튼(선택 전 opacity 0.5, 선택 후 활성화)
   - props: questions(배열), currentStep, onAnswer, onNext, onBack

### 11.5. 결과 화면 및 만족도 설문 컴포넌트 구현

**Status:** pending  
**Dependencies:** 11.1, 11.2  

QnA 완료 후 피부타입 결과를 표시하는 화면과 5점 척도 만족도 미니 설문 컴포넌트를 구현합니다.

**Details:**

1. OnboardingResult.tsx (src/components/onboarding/OnboardingResult.tsx):
   - 배경: gray05(연한 그레이)
   - 결과 카드(result-card): 배경 #fff, box-shadow shadow-md, border-radius 20px
     - 캐릭터 이모지(72px): 8타입별(🌊옹달샘, 🦭물개, 🌋화산, 🏜사막 등)
     - 타입명: font-size 24px, font-weight 900
     - 설명: font-size 14px, line-height 1.7
   - 추천/주의 성분 칩 섹션:
     - .r-chip.good: 배경 primary-light, 테두리 primary
     - .r-chip.warn: 배경 accent-light, 테두리 accent
   - CTA: '추천 세트 보기' 버튼(52px, 배경 primary)
   - '세트 건너뛰고 홈으로' 스킵 버튼
2. SatisfactionSurvey.tsx (src/components/onboarding/SatisfactionSurvey.tsx):
   - 5점 척도 선택 UI(별점 또는 숫자 1~5)
   - 선택적 피드백 텍스트 입력 필드
   - props: onSubmit(rating, feedback)

### 11.6. 추천 세트 팝업(BottomSheet) 및 Soft-gate 모달 구현

**Status:** pending  
**Dependencies:** 11.1, 11.2, 11.5  

피부타입별 추천 세트를 표시하는 BottomSheet 팝업과 게스트 모드 개인화 기능 접근 시 표시되는 Soft-gate 모달을 구현합니다.

**Details:**

1. RecommendSetPopup.tsx (src/components/recommendation/RecommendSetPopup.tsx):
   - BottomSheet 활용, max-height 75%
   - 헤더: 타입명 + '추천 세트' 타이틀, 서브텍스트
   - 세트 카드 목록(popup-card):
     - 이미지(60x60), 카테고리 칩, 제품명, 가격
     - 매칭률 배지: padding 3px 8px, 배경 primary-light
   - 피부타입별 3종 세트(저가/중가/고가) 데이터 표시
   - props: skinType, recommendedProducts, onClose, onNavigateHome
2. SoftGateModal.tsx (src/components/common/SoftGateModal.tsx):
   - 트리거 조건: 게스트 모드에서 개인화 기능(찜하기, 맞춤 추천, 히스토리) 접근 시
   - 중앙 정렬 모달, 배경 오버레이
   - 가입 혜택 설명 텍스트 + 일러스트
   - CTA: '가입하고 시작하기' 버튼
   - '나중에 하기' 옵션 버튼
   - props: isOpen, onSignUp, onLater, onClose

### 11.7. localStorage 진행률 저장 훅 및 이탈 복구 기능 구현

**Status:** pending  
**Dependencies:** 11.1  

온보딩 중간 이탈 시 진행률을 localStorage에 저장하고, 재방문 시 이어서 진행할 수 있는 커스텀 훅을 구현합니다.

**Details:**

1. useOnboardingProgress.ts (src/hooks/useOnboardingProgress.ts):
   - 저장 데이터 인터페이스:
     ```typescript
     interface OnboardingProgress {
       currentStep: number;
       answers: Record<number, string>;
       timestamp: string;
     }
     ```
   - saveProgress(step, answers): 각 문항 답변 시 자동 저장
   - loadProgress(): 저장된 진행률 불러오기
   - clearProgress(): 완료 또는 초기화 시 삭제
   - hasValidProgress(): 유효한 진행률 존재 여부 (72시간 경과 체크)
2. 저장 키: 'onboarding_progress'
3. 자동 저장 트리거: 옵션 선택 시, 화면 전환 시
4. 복구 로직: 앱 재진입 시 loadProgress() 호출, 유효하면 해당 단계부터 시작
5. 만료 로직: 72시간 이상 경과 시 진행률 초기화

### 11.8. 온보딩 플로우 통합 페이지 및 화면 전환 애니메이션 구현

**Status:** pending  
**Dependencies:** 11.3, 11.4, 11.5, 11.6, 11.7  

전체 온보딩 흐름을 통합 관리하는 페이지 컴포넌트를 구현하고, 화면 간 전환 애니메이션을 적용합니다.

**Details:**

1. Onboarding.tsx (src/pages/Onboarding.tsx):
   - 온보딩 전체 상태 관리: currentScreen(splash/qna/result), answers, skinType
   - useOnboardingProgress 훅 연동: 진입 시 복구, 진행 시 저장
   - 화면 전환 핸들러: goToQnA, goToResult, goToHome
   - QnA 완료 시 피부타입 계산 로직 연동 (Task 13 의존)
2. 화면 전환 애니메이션 구현:
   - 공통 트랜지션: transform translateX, duration 0.35s, cubic-bezier(0.4, 0, 0.2, 1)
   - Splash → QnA: 왼쪽으로 슬라이드 아웃
   - QnA → Result: 왼쪽으로 슬라이드 아웃
   - AnimatedTransition 컴포넌트 또는 framer-motion 활용
3. 라우팅 설정: /onboarding 경로에 Onboarding 페이지 매핑
4. 홈 화면 네비게이션: react-router-dom useNavigate 활용
