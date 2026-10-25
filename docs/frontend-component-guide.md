# swappy 프론트엔드 컴포넌트 가이드

> Capacitor + React 18 + TypeScript + Tailwind CSS 3 기반  
> 이 문서를 기준으로 UI를 개발하세요. 임의로 색상·간격을 하드코딩하지 마세요.

---

## 목차

1. [기술 스택 & 실행 방법](#1-기술-스택--실행-방법)
2. [프로젝트 구조](#2-프로젝트-구조)
3. [디자인 토큰 사용법](#3-디자인-토큰-사용법)
4. [컴포넌트 카탈로그](#4-컴포넌트-카탈로그)
5. [화면(페이지) 구조](#5-화면페이지-구조)
6. [개발 규칙](#6-개발-규칙)
7. [Capacitor 네이티브 빌드](#7-capacitor-네이티브-빌드)

---

## 1. 기술 스택 & 실행 방법

| 항목 | 내용 |
|------|------|
| 프레임워크 | React 18 + TypeScript |
| 빌드 도구 | Vite 6 |
| 스타일 | Tailwind CSS 3 |
| 라우팅 | React Router v6 |
| 하이브리드 앱 | Capacitor |

```bash
# 전체 스택 실행 (Docker)
docker compose up --build

# 프론트엔드만 로컬 실행
cd frontend
npm install
npm run dev        # http://localhost:3000

# 네이티브 앱 빌드 (iOS/Android 추가 후)
npm run build
npx cap sync
npx cap open ios   # Xcode 실행
npx cap open android  # Android Studio 실행
```

---

## 2. 프로젝트 구조

```
frontend/src/
├── components/
│   ├── ui/             # 원자 단위 공통 컴포넌트
│   │   ├── Button.tsx
│   │   ├── Chip.tsx
│   │   └── Badge.tsx
│   ├── layout/         # 레이아웃 컴포넌트
│   │   ├── PageWrapper.tsx
│   │   ├── Header.tsx
│   │   └── BottomNav.tsx
│   ├── product/        # 제품 관련 컴포넌트
│   │   └── ProductCard.tsx
│   └── skin/           # 피부타입 관련 컴포넌트
│       └── SkinTypeBadge.tsx
├── pages/
│   ├── Onboarding/     # 스플래시 / 온보딩
│   ├── QnA/            # 피부타입 진단 문항
│   ├── Result/         # QnA 결과 & 캐릭터
│   ├── Popup/          # 추천 세트 Bottom Sheet
│   ├── Home/           # 메인 홈
│   ├── Detail/         # 제품 상세 + 대체품 TOP3
│   ├── Search/         # 검색 (텍스트 + 이미지)
│   └── Mypage/         # 마이페이지
├── types/
│   └── index.ts        # 공유 타입 정의
├── App.tsx             # 라우터 설정
├── main.tsx
└── index.css           # CSS 변수 + Tailwind 설정
```

---

## 3.디자인 토큰 사용법

> **절대로 색상 값을 직접 입력하지 마세요.** 반드시 아래 토큰을 사용하세요.

### 3.1 Tailwind 클래스 (권장)

```tsx
// ✅ 올바른 방법
<div className="bg-primary text-white">         // 주요 액션
<div className="bg-primary-light text-primary"> // 강조 배경
<div className="text-accent">                   // 할인율, 경고
<div className="bg-surface border border-border"> // 페이지/카드 배경

// ❌ 잘못된 방법
<div style={{ background: '#3D8F6F' }}>
```

### 3.2 CSS 변수 (인라인 스타일이 필요한 경우)

```tsx
// 동적 스타일에만 사용
<div style={{ background: isActive ? 'var(--primary)' : 'var(--gray10)' }}>
```

### 3.3 전체 토큰 목록

| 토큰 | Tailwind 클래스 | CSS 변수 | 용도 |
|------|----------------|----------|------|
| 메인 컬러 | `bg-primary` / `text-primary` | `var(--primary)` `#3D8F6F` | 주요 버튼, 브랜드 |
| 연한 메인 | `bg-primary-light` | `var(--primary-light)` `#EAF5EF` | 칩 배경, 강조 |
| 진한 메인 | `bg-primary-dark` | `var(--primary-dark)` `#2B6B52` | 그라디언트 시작 |
| 액센트 | `text-accent` | `var(--accent)` `#FF5C7A` | 할인율, 찜 아이콘 |
| 경고 | `text-warning` | `var(--warning)` `#FF9500` | 중간 유사도 배지 |
| 별점 | `text-star` | `var(--star)` `#FFB800` | ★ 아이콘 |
| 페이지 배경 | `bg-surface` | `var(--surface)` `#F7F8FA` | 페이지 기본 배경 |
| 테두리 | `border-border` | `var(--border)` `#E8EAED` | 카드, 구분선 |
| 서브 텍스트 | `text-gray-70` | `var(--gray70)` `#6B7280` | 브랜드명, 부가 정보 |
| 기본 텍스트 | `text-gray-100` | `var(--gray100)` `#111827` | 제품명, 본문 |

### 3.4 타이포그래피

```tsx
<h1 className="text-4xl font-black">   // 28px, 온보딩 앱명
<h2 className="text-3xl font-black">   // 24px, QnA 결과 타입명
<h3 className="text-2xl font-bold">    // 20px, 배너 제목
<p  className="text-xl font-bold">     // 18px, 상세 제품명
<p  className="text-lg font-semibold"> // 16px, 섹션 제목, 주요 버튼
<p  className="text-base">             // 14px, 본문
<p  className="text-sm">               // 12px, 브랜드명, 부가 정보
<p  className="text-xs">               // 11px, 배지, 보조 라벨
```

---

## 4. 컴포넌트 카탈로그

### 4.1 Button

```tsx
import { Button } from '../components/ui/Button';

// variant: 'primary' | 'next' | 'ghost' | 'outline'

// 온보딩 CTA (흰 배경, 녹색 텍스트)
<Button variant="primary">피부 타입 진단하고 시작하기</Button>

// 일반 다음/제출 버튼 (녹색 배경, 흰 텍스트)
<Button variant="next" disabled={!selected}>다음</Button>

// 투명 배경 (온보딩 보조 버튼, 어두운 배경 위)
<Button variant="ghost">로그인 없이 둘러보기</Button>

// 외곽선 버튼 (흰 배경, 녹색 테두리)
<Button variant="outline">취소</Button>

// 너비 고정
<Button variant="next" fullWidth={false} className="w-32">확인</Button>
```

모든 버튼에 `active:scale-[.97]` 피드백이 내장되어 있습니다.

---

### 4.2 Chip (성분 칩)

```tsx
import { Chip } from '../components/ui/Chip';

// 추천/주요 성분 (녹색)
<Chip label="히알루론산" variant="good" />

// 일반 성분 (회색)
<Chip label="정제수" variant="neutral" />

// 주의 성분 (빨간)
<Chip label="강한 계면활성제" variant="warn" />

// 삭제 가능한 칩 (최근 검색어 등)
<Chip label="이니스프리" variant="neutral" onRemove={() => removeSearch('이니스프리')} />
```

---

### 4.3 Badge (배지)

```tsx
import { Badge } from '../components/ui/Badge';

// 상품 상태 배지
<Badge type="BEST" />   // 주황 배경
<Badge type="NEW" />    // 녹색 배경
<Badge type="SALE" />   // 분홍 배경

// 유사도 배지
<Badge type="sim-high" label="92%" />  // ≥80%: 녹색
<Badge type="sim-mid"  label="67%" />  // 50~79%: 주황
```

---

### 4.4 PageWrapper

```tsx
import { PageWrapper } from '../components/layout/PageWrapper';

// 기본 사용 (하단 탭 없는 화면: 온보딩, QnA, 결과 등)
<PageWrapper>
  <Header title="제목" showBack />
  {/* 내용 */}
</PageWrapper>

// 하단 탭이 있는 화면 (홈, 검색, 마이페이지)
<PageWrapper hasBottomNav>
  {/* 내용 */}
  <BottomNav />
</PageWrapper>
```

safe area(`env(safe-area-inset-*)`)가 자동 처리됩니다.

---

### 4.5 Header

```tsx
import { Header } from '../components/layout/Header';

// 제목만
<Header title="제품 상세" />

// 뒤로가기 포함
<Header title="피부타입 QnA" showBack />

// 오른쪽 슬롯 (찜 버튼 등)
<Header
  title="제품 상세"
  showBack
  rightSlot={<button>♡</button>}
/>
```

---

### 4.6 BottomNav

하단 네비게이션은 `PageWrapper hasBottomNav`와 함께 사용합니다.

```tsx
import { BottomNav } from '../components/layout/BottomNav';

// 화면 맨 아래에 배치
<PageWrapper hasBottomNav>
  {/* 내용 */}
  <BottomNav />
</PageWrapper>
```

활성 탭은 `--primary` 색상, 비활성 탭은 `--gray50`으로 자동 처리됩니다.

---

### 4.7 ProductCard

```tsx
import { ProductCard } from '../components/product/ProductCard';
import { Product } from '../types';

const product: Product = {
  id: 1,
  name: '수분 밸런싱 토너 200ml',
  brand: '이니스프리',
  category: '토너',
  price: 28000,
  originalPrice: 35000,
  discountRate: 20,
  rating: 4.5,
  reviewCount: 1203,
  isBest: true,
};

// 2열 그리드에서 사용
<div className="grid grid-cols-2 gap-3">
  {products.map((p, i) => (
    <ProductCard key={p.id} product={p} index={i} />
  ))}
</div>
```

`index` prop으로 카드 배경 그라디언트 색상이 자동으로 순환됩니다.
클릭 시 `/detail/:id`로 자동 이동합니다.

---

### 4.8 SkinTypeBadge

```tsx
import { SkinTypeBadge } from '../components/skin/SkinTypeBadge';
import { SkinType } from '../types';

const skinType: SkinType = 'ondalsam';

// 홈 화면 상단 피부타입 표시
<SkinTypeBadge skinType={skinType} onRediagnose={() => navigate('/qna')} />

// 재진단 버튼 없이
<SkinTypeBadge skinType={skinType} />
```

---

## 5. 화면(페이지) 구조

| 경로 | 페이지 파일 | 하단 탭 | 설명 |
|------|------------|--------|------|
| `/onboarding` | `pages/Onboarding` | ❌ | 앱 첫 진입 |
| `/qna` | `pages/QnA` | ❌ | 피부타입 진단 |
| `/result` | `pages/Result` | ❌ | 진단 결과 캐릭터 |
| `/popup` | `pages/Popup` | ❌ | 추천 세트 Bottom Sheet |
| `/home` | `pages/Home` | ✅ | 메인 큐레이션 |
| `/detail/:id` | `pages/Detail` | ❌ | 제품 상세 + 대체품 |
| `/search` | `pages/Search` | ✅ | 텍스트/이미지 검색 |
| `/mypage` | `pages/Mypage` | ✅ | 마이페이지 |

### 라우팅 플로우

```
/ → /onboarding
  → "가입하기" → /qna → /result → /popup → /home
  → "둘러보기" → /home

/home 제품 카드 탭 → /detail/:id
하단 탭: /home | /search | /mypage
```

---

## 6. 개발 규칙

### 6.1 TODO 마커 활용

현재 모든 페이지는 Mock 데이터를 사용합니다. API 연동 시 `TODO` 주석을 찾아 교체하세요.

```tsx
// TODO: Task 13 완료 후 실제 문항으로 교체
const MOCK_QUESTIONS = [...]

// TODO: Task 6 완료 후 실제 API 연동
const MOCK_RESULTS = [...]
```

### 6.2 피부타입 타입 사용

```tsx
import { SkinType, SKIN_TYPE_META } from '../types';

const type: SkinType = 'ondalsam';
const meta = SKIN_TYPE_META[type];
// meta.label → '수분팡팡 옹달샘'
// meta.emoji → '💧'
// meta.summary → '수분·유분 균형, 이상적 피부'
```

### 6.3 API 호출 패턴 (Task 6 완료 후 작성 예정)

```tsx
// 임시 패턴 — 실제 API 클라이언트 확정 후 업데이트
const res = await fetch('/api/v1/products/search?q=' + query);
const data = await res.json();
```

### 6.4 모바일 터치 피드백

**모든 탭/클릭 가능한 요소**에 active 상태 추가:

```tsx
// Tailwind
<button className="active:scale-95 transition-transform">
<div    className="active:scale-[.98] transition-transform cursor-pointer">

// 버튼 컴포넌트는 내장됨
```

### 6.5 피해야 할 것

```tsx
// ❌ 하드코딩 금지
style={{ color: '#3D8F6F' }}
style={{ padding: '16px' }}

// ❌ 임의 컬러 클래스 금지
className="text-green-600"  // text-primary 사용
className="bg-gray-100"     // bg-gray-10 또는 bg-surface 사용

// ✅ 토큰 사용
className="text-primary"
className="p-4"
```

---

## 7. Capacitor 네이티브 빌드

### 7.1 iOS 앱 추가 (Mac 환경 필요)

```bash
cd frontend
npm install @capacitor/ios
npx cap add ios
npm run build
npx cap sync ios
npx cap open ios   # Xcode에서 실행
```

### 7.2 Android 앱 (디버그 APK)

안드로이드 프로젝트(`frontend/android/`)는 이미 만들어져 저장소에 들어 있습니다. 빌드·설치는 스크립트로 합니다 —
도구 설치와 문제 해결은 [frontend/README.md](../frontend/README.md)의 "9-1. 안드로이드 디버그 APK"를 보세요.

```bash
cd frontend
npm run android:local                              # 내 PC 로컬 서버로 빌드·설치·실행 (USB로 연결한 폰)
bash scripts/android.sh debug https://서버주소      # 운영 서버(HTTPS)로 APK만 빌드
npm run android:install                            # 만든 APK를 폰에 설치
```

### 7.3 빌드 후 네이티브 동기화 (코드 변경 시)

```bash
npm run build && npx cap sync
```

### 7.4 네이티브 플러그인 (필요 시 추가)

| 기능 | 패키지 |
|------|--------|
| 카메라 (이미지 검색) | `@capacitor/camera` |
| 햅틱 피드백 | `@capacitor/haptics` |
| 상태바 스타일 | `@capacitor/status-bar` |
| 스플래시 화면 | `@capacitor/splash-screen` |
| 키보드 처리 | `@capacitor/keyboard` |

```bash
npm install @capacitor/camera
npx cap sync
```

---

## 참고 문서

- [PRD v1.8](PRD_swappy_v1.8.md) — 전체 기획 명세
- [개발 가이드라인](dev_guidelines.md) — 화면별 체크리스트, API 스펙
- [프로토타입](prototype.html) — 브라우저에서 직접 열어 UI 확인
