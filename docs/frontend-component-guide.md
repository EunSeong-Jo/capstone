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
| 하이브리드 앱 | Capacitor 8 (Android) |
| 모션 | framer-motion |
| 얼굴 확인 | MediaPipe Tasks Vision |

```bash
# 전체 스택 실행 (Docker)
docker compose up --build

# 프론트엔드만 로컬 실행
cd frontend
npm ci             # package-lock 기준 동일 버전 설치
npm run dev        # http://localhost:3000

# 네이티브 앱 빌드 — Android 프로젝트는 저장소에 있다(iOS는 아직 추가하지 않음, 7장 참고)
npm run build
npx cap sync
npx cap open android  # Android Studio 실행
```

---

## 2. 프로젝트 구조

```
frontend/src/
├── components/         # 기능별 폴더 (아래는 주요 폴더)
│   ├── ui/             # 원자 단위 공통 컴포넌트 (Button, Chip, Badge, ConfirmDialog, 아이콘)
│   ├── layout/         # PageWrapper, Header, BottomNav(레거시), AndroidBackButton …
│   ├── home/oy/        # 현행 홈·하단 네비(OyBottomNav)·홈 섹션
│   ├── product/        # ProductCard, FitBadge, SkinFitCard, IngredientSheet, OptionPicker, ProductReviews
│   ├── skin/           # 피부 분석(SkinReportCard, SkinAnalysisDetail, FaceConsentSheet …)
│   └── alternatives · analysis · category · closet · compare · history · mypage · orders · reviews · …
├── pages/              # 라우트 단위 (Splash, Login, Signup, Onboarding, Home, Search, Scan, Category,
│                       #   ProductDetail, Analysis, Alternatives, Compare, Closet, Cart, History, Gift,
│                       #   Notifications, Mypage …)
├── api/                # HTTP 클라이언트(client.ts) + 도메인별 호출 (products, personal, chat, skinPhoto …)
├── hooks/              # 데이터 훅 (useProducts, useSimilarProducts, useSkinFit, usePersonalAi …)
├── context/            # 전역 상태 (Auth, Cart, Closet, Diagnosis, Liked, UserProfile, Character, Toast)
├── data/               # 정적 데이터 (진단 문항·점수표·피부타입·카테고리)
├── utils/              # 순수 함수 (alternatives, compare, unitPrice, faceCheck …)
├── mocks/              # 제품 id 없는 정적 문구·오프라인 폴백만
├── types/index.ts      # 공유 타입 정의
├── App.tsx             # 라우터 설정 (lazy 로딩)
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
<Badge type="sim-high" label="92%" />  // 55% 초과: 녹색
<Badge type="sim-mid"  label="47%" />  // 55% 이하: 주황
// 색을 직접 고르지 말고 utils/alternatives.ts의 similarityBadgeType(percent)를 쓰세요
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

> ⚠️ 이 절의 `layout/BottomNav`는 UI 통일 이전 컴포넌트입니다. **현행 표준은 `components/home/oy/OyBottomNav.tsx`**(홈·카테고리·검색·화장대·마이 5탭)이고, `BottomNav`는 `/history`에만 남아 있습니다.

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
클릭 시 `/detail/:id`로 자동 이동합니다. `onSelect`를 넘기면 이동하지 않고 그 함수를 부릅니다(비교할 제품 고르기 등).

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

라우트(46개 + 리다이렉트)의 정본은 `src/App.tsx`입니다. 계정 화면은 `mine()`으로 감싸 `RequireAuth`가 게스트를 막습니다. 대표 경로만 적습니다.

| 경로 | 페이지 | 하단 탭 | 설명 |
|------|------|--------|------|
| `/` · `/login` · `/signup` | `pages/Splash` · `Login` · `Signup` | ❌ | 시작·계정 |
| `/onboarding` · `/qna` | `pages/Onboarding` · `pages/Onboarding` 내 문답 | ❌ | 진단(재진단은 `/qna`) |
| `/home` | `pages/Home` | ✅ | 프로필 대시보드·추천·교체 제안 |
| `/category` · `/category/:code` | `pages/Category` | ✅ | 카테고리·정렬 |
| `/search` · `/scan` | `pages/Search` · `pages/Scan` | ✅ | 검색·사진으로 찾기 |
| `/detail/:id` | `pages/ProductDetail` | ❌ | 제품 상세·궁합·전성분 |
| `/analysis/:id` · `/alternatives` · `/compare` | `pages/Analysis` · `Alternatives` · `Compare` | ❌ | 성분 분석·대체품·직접 비교 |
| `/closet` | `pages/Closet` | ✅ | 내 화장대(히스토리 탭 포함) |
| `/cart` · `/gift/:productId` · `/notifications` | `pages/Cart` · `Gift` · `Notifications` | ❌ | 구매·선물·알림 |
| `/mypage` 와 하위 | `pages/Mypage` | ✅ | 주문·선물·후기·구독·설정·AI 기억 |

(옛 `/result`·`/popup`·`/detail` 폴더 구조는 사라졌습니다. 추천 세트는 홈의 시트, 진단 결과는 온보딩 안에 있습니다.)

### 라우팅 플로우

```
/ → /login → "로그인 없이 둘러보기" → /home (게스트)
          → 가입/로그인 → /onboarding(진단) → /home

/home 제품 카드 탭 → /detail/:id → /analysis/:id · /alternatives · /compare
하단 탭: /home | /category | /search(→ /scan) | /closet | /mypage
```

---

## 6. 개발 규칙

### 6.1 목업과 TODO 마커

**제품 데이터는 전부 실 API**입니다. 제품 id를 담은 목업을 새로 만들지 마세요(`npm run check:dummy`가 막고, 배경은 [frontend/README.md](../frontend/README.md) 7-2절). 남은 목업은 제품 id가 없는 폴백(날씨·케어 문구 오프라인 문구, 인기 검색어 등)뿐이고 `src/mocks/`에 모읍니다.
아직 연동하지 못한 부분에만 `// TODO`를 남깁니다.

### 6.2 피부타입 타입 사용

```tsx
import { SkinType, SKIN_TYPE_META } from '../types';

const type: SkinType = 'ondalsam';
const meta = SKIN_TYPE_META[type];
// meta.label → '수분팡팡 옹달샘'
// meta.emoji → '💧'
// meta.summary → '수분·유분 균형, 이상적 피부'
```

### 6.3 API 호출 패턴

`fetch`를 화면에서 직접 부르지 않습니다. `src/api/client.ts`가 토큰 주입·401 갱신 재시도·에러 변환(`ApiError`)을 맡고, 도메인별 호출은 `src/api/*.ts`, 화면은 `src/hooks/*`의 훅으로 씁니다.

```tsx
// hooks/useProduct.ts — 로딩·에러·404를 훅이 정리해서 준다
const { product, loading, error, notFound, reload } = useProduct(id, { skinType });

// 새 호출은 api/ 아래에 추가하고 client의 request/postJson/patchJson/putJson/deleteJson을 쓴다
export const fetchProduct = (id: number, signal?: AbortSignal) =>
  request<ProductDetail>(`/api/v1/products/${id}`, {}, signal);
```

개인 데이터 조회는 `queryCache`(`api/queryCache.ts`)로 같은 키의 요청을 합치고, 로그인 시 서버·비회원 localStorage를 오가는 규칙은 [frontend/README.md](../frontend/README.md)를 보세요.

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

### 7.1 iOS 앱 추가 (Mac 환경 필요 — 아직 추가하지 않았습니다)

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
- [개발 가이드라인](dev_guidelines.md) — 화면별 체크리스트, 디자인 시스템
- [프로토타입](design/prototype.html) — 브라우저에서 직접 열어 UI 확인
