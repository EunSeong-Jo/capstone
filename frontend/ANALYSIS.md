# 팀원 제출물 병합 분석 (2026-07)

> 팀원들이 제출한 원본(Anima/Figma export, HTML 목업, 디자인 PDF/PNG/SVG)을 `frontend/src`에 실제로
> 병합하면서 확인한 내용을 정리한 문서입니다. 원본 폴더들은 이 문서로 요약한 뒤 삭제했습니다 —
> 다시 찾아볼 원본이 필요하면 git 히스토리(`git log --diff-filter=A -- <경로>`)에서 복구할 수 있습니다.
> 팀원 제출 규칙은 [`README.md`](./README.md) 10절, 제출 전 셀프 점검은
> [`scripts/check-submission.mjs`](./scripts/check-submission.mjs) 참고.

## 0. 개요

병합 대상은 총 6건이었습니다.

| 기능 | 원본 형태 | 원본 작성자(브랜치) | 최종 위치 |
|---|---|---|---|
| 최근본 | Anima(Figma) export React | misong (`history_misong`) | `/history` (탭) |
| 좋아요 | Anima(Figma) export React | (`code/좋아요_React`) | `/history` (탭) |
| 자주구매 | Anima(Figma) export React | (`code/자주구매_React`) | `/history` (탭) |
| 마이페이지 | 손으로 짠 React (Figma Make) | 동균 (`dg_mypage`) | `/mypage/*` 12개 라우트 |
| 카테고리 | 손으로 짠 React + 디자인 PNG/PDF/SVG | yb (`category_yb`) | `/category`, `/category/skincare` |
| 검색 | HTML 목업(Anima 아님) | jw (`search_jw`) | `/search` |

앞의 4건(최근본/좋아요/자주구매/마이페이지)은 3개 폴더씩(`_React`/`_HTML`/zip) 또는 zip 하나로 왔고,
카테고리는 완성된 React 앱(`frontend/category-standalone/`, 이미 병합되어 삭제됨)과 디자인 이미지가
따로 왔고, 검색은 순수 HTML/CSS 목업이었습니다.

---

## 1. 최근본 → History

**원본**: `code/최근본_React/src/Component/Component.tsx` (544줄, Anima export, absolute-pixel 배치).

**진짜 목표 디자인 재확인**: 1차 병합 때는 Anima export만 보고 "최근 본 상품 그리드"로 단순하게
구현했는데, 이후 루트에 있던 `PNG/제목 없음.svg`(Figma 원본, 8.6MB, 여러 화면 프레임 포함)를 직접
렌더링해서 비교해보니 실제 목표는 훨씬 컸습니다: **History가 `최근 본 / 좋아요 상품 / 좋아요 브랜드 /
자주 구매` 4개 탭을 가진 허브 화면**이었고, 각 탭은 다음을 포함했습니다.

- 최근 본: 상단 "AI INSIGHT" 배너("스킨케어에 관심이 많으시네요" + "분석보기"), 리스트형 카드(이미지+
  브랜드+평점+가격+찜+장바구니 버튼), 하단 "AI추천 최근 관심 기반 추천" 섹션
- 좋아요 상품: 카테고리 필터칩, "총 N개"/할인상품 체크박스/전체삭제, "이런 상품도 있어요!" 추천 그리드
- 좋아요 브랜드: 찜한 브랜드 카드 + 해당 브랜드 상품 가로스크롤 + "또 다른 브랜드를 확인해보세요"
- 자주 구매: 필터칩 + 정렬 + "N회 구매" 뱃지 + "재구매가 많은 다른 상품도 있어요!"

대표 이미지: [`docs/design/references/최근본.png`](../docs/design/references/최근본.png)

**최종 구현**: `/history`를 3개 탭(최근 본/좋아요 상품/자주 구매) 허브로 재구현했습니다.
**"좋아요 브랜드" 탭은 사용자 판단으로 이번 범위에서 제외**했습니다(브랜드 단위 찜 개념 자체가
새로 필요해 범위가 커짐). 탭 상태는 `?tab=recent|liked|frequent` 쿼리 파라미터로 관리하고,
공용 `components/history/HistoryListCard.tsx`(리스트형 카드)·`AiInsightBanner.tsx`를 새로 만들어
3개 탭에서 재사용합니다. 기존에 별도 라우트였던 `/likes`, `/mypage/frequent-purchases`는
`/history?tab=...`로 리다이렉트됩니다(아래 2, 3번 참고).

---

## 2. 좋아요 → History 통합

**원본**: `code/좋아요_React/src/Component/Component.tsx` (402줄, Anima export). 하트 아이콘
컴포넌트(`Heart/Heart.tsx`)가 분리돼 있었던 점 정도가 특징이고, `public/`에 상품 이미지는 없이
아이콘 SVG만 있어서 대표 스크린샷은 없습니다.

**1차 구현**: 처음엔 `/likes`라는 별도 페이지로 만들어서, `frontend/src/context/LikedProductsContext.tsx`
(localStorage 기반 전역 찜 상태)를 새로 만들고 `ProductCard`의 찜 버튼(기존엔 no-op)을 여기 연결했습니다.

**최종 구현**: 1번의 History 통합 작업 때 `/likes` 페이지를 없애고 `/history?tab=liked` 탭으로
흡수했습니다. `LikedProductsContext`는 그대로 전역 상태로 유지되고, `/likes` 라우트는
`/history?tab=liked`로 리다이렉트됩니다.

**알려진 제약**: `ProductDetail`의 "비슷한 상품"/"함께 본 상품" 섹션은 `CategoryProduct` 타입
기반의 별개 로컬 찜 상태를 쓰고 있어(id가 `string`이라 `LikedProductsContext`의 `number` 키와
타입이 다름) 전역 찜 목록과 연동되지 않습니다. 후속 정리가 필요합니다.

---

## 3. 자주구매 → History 통합

**원본**: `code/자주구매_React/src/Component/Component.tsx` (256줄, Anima export). `public/`의 상품
이미지가 전부 10~23px짜리 아이콘 조각이라 대표 스크린샷은 없습니다. 실제 텍스트에서 확인한 구조:
카테고리 필터칩("전체"/"마스크팩"/"뷰티소품"), "총 1개" 카운트, "N회 구매" 뱃지, 하단 "재구매가
많은 다른 상품도 있어요!" 추천 행.

**1차 구현**: `Product` 타입에 `purchaseCount?: number` 추가, `frontend/src/mocks/frequentlyBought.ts`
목업 작성, `/mypage/frequent-purchases` 페이지로 구현(주문/배송 백엔드가 없어 목업 데이터 기반).

**최종 구현**: 1번의 History 통합 작업 때 `/history?tab=frequent` 탭으로 흡수했습니다. 필터칩 +
정렬(구매 많은순/최근 구매순) + "N회 구매" 뱃지 + 하단 추천 가로스크롤 구조는 그대로 유지했습니다.
`mocks/frequentlyBought.ts`는 계속 사용하고, `/mypage/frequent-purchases` 라우트는
`/history?tab=frequent`로 리다이렉트됩니다.

---

## 4. 마이페이지

**원본**: `dg-mypage-design-main/src/app/components/*.tsx` (12개 파일, "Figma Make" export).
Anima export였던 다른 3개와 달리 **손으로 짠 진짜 React 컴포넌트**라 구조/로직 자체가 재사용
가치가 있었습니다. 다만 Tailwind **v4**(frontend는 v3), `react-router@7`(실제로는 미사용 dead
dependency), MUI+Radix+shadcn 전체 스택을 포함하고 있어 그대로 설치할 수 없었고, `theme.css`가
`--primary` 등 전역 CSS 변수와 `button/input/h1~h4` 엘리먼트 셀렉터를 재정의해서 그대로 import하면
앱 전체 스타일이 깨지는 구조였습니다.

대표 이미지(원본 `src/imports/`의 참고 이미지 예시): [`docs/design/references/mypage.jpg`](../docs/design/references/mypage.jpg)

**이식 (12개 전부 완료, 2단계로 진행)**

1단계 — Mypage 기존 메뉴/`shoppingItems`와 바로 매칭되는 6개:
`OrderHistoryPage`→`/mypage/order-history`, `ShippingPage`→`/mypage/shipping`,
`CancelReturnPage`→`/mypage/cancel-return`, `RestockPage`→`/mypage/restock`,
`PointsPage`→`/mypage/points`, `CouponPage`→`/mypage/coupons`.

2단계 — 처음엔 "PRD 범위 밖" 또는 "예정된 AI 챗봇과 컨셉 겹침"을 이유로 보류했다가, 이후
"팀원 작업물에 있으면 일단 구현" 방침으로 마저 이식한 6개:
`MoneyPage`→`/mypage/money`(제목을 "swappy머니"에서 **"Swappy머니"로 변경**, 마이페이지
메인의 적립금/쿠폰 사이에 배치해 금액이 한눈에 보이도록 함), `ReviewPage`→`/mypage/reviews`,
`GiftBoxPage`→`/mypage/giftbox`, `CustomerServicePage`→`/mypage/customer-service`,
`ChatSupportPage`→`/mypage/chat-support`(**임시 챗봇 UI** — 캔드 응답만 반환, 실제 AI 연동
아님. 루트 `CLAUDE.md` Task 7의 실제 AI 챗봇이 완료되면 교체 필요), `InquiryPage`→`/mypage/inquiry`.

**의존성 처리**: 12개 페이지 모두 `react` + 로컬 상대경로 import만 사용(MUI/Radix/lucide 미사용,
grep으로 확인) — **신규 npm 의존성 추가 없이** 전부 이식했습니다.

**스타일 매핑** (하드코딩 hex → frontend 기존 토큰):

| 원본 | 대체 |
|---|---|
| `#1A1A1A` | `text-gray-100` |
| `#888`/`#999`/`#aaa` | `text-gray-50`/`text-gray-70` |
| `#3C7358` (G_DARK) | `var(--primary)`/`text-primary`/`bg-primary` (거의 동일한 색상, 의도적 매칭으로 보임) |
| `#F4F6F4` 배경 | `bg-surface` |
| `rgba(0,0,0,0.06~0.07)` 보더 | `border-gray-20`/`border-gray-10` |
| `#1A6EE8`(적립/충전 금액 파란색) | `text-sky-600` (기존 `PointsPage`가 이미 같은 용도로 사용 중이라 재사용) |
| `#FFF0F3`/`#FFCDD8`/`#E8527A`(FAQ 배너 핑크) | `bg-accent-light`/`text-accent`/`border-accent` |

**아이콘/이미지**: `lucide-react` 아이콘(ArrowLeft, ChevronDown, ShoppingBag 등)은 전부 제거하고
뒤로가기는 공용 `Header showBack`, 나머지는 `components/category/Icon.tsx` 레지스트리 또는
이모지로 대체했습니다. `src/imports/*`의 카카오톡 스크린샷들(빈 상태 일러스트, 봇 아바타 등)은
가져오지 않고 이모지로 대체했습니다. `src/app/components/ui/`(shadcn 컴포넌트 45개)는 이식
대상 페이지들이 사용하지 않아 통째로 미포함했습니다. GiftBox/CustomerService/Inquiry 3곳이
반복 사용하던 "하단 문의 바"는 `components/mypage/SupportContactBar.tsx`로 공용화했습니다.

---

## 5. 카테고리

**원본**: `frontend/category-standalone/`(완성된 React 앱, 이미 병합되어 삭제됨) +
`frontend/category_UI_yb/Category main.png` 등 디자인 이미지.

대표 이미지: [`docs/design/references/category.png`](../docs/design/references/category.png)

**구현 상태**: `CategoryMainPage.tsx`/`CategoryPage.tsx`는 `category-standalone`의 코드를 거의
그대로(byte-identical 수준) 병합해 사용 중입니다. `CategoryPage.tsx`(상품 리스트 화면)는 BEST
랭킹/추천 그리드/탭별 프로모 배너 구조가 디자인 이미지와 잘 맞습니다.

**디자인 대비 확인된 차이 (사용자 확인 결과 의도적으로 구현하지 않기로 함)**:
- 사이드바 탭이 디자인은 9개(`스킨케어, 마스크팩, 클렌징, 선케어, 메이크업, 바디케어, 헤어케어,
  건강식품, 헬스`)인데 코드는 `건강식품`, `헬스` 2개가 빠진 7개
- 디자인 맨 아래에 아직 콘텐츠가 없는 카테고리를 위한 "COMING SOON" 배너가 있는데 코드엔 없음
- 카테고리 아이콘이 실제 이미지 대신 전부 같은 placeholder

---

## 6. 검색

**원본**: `design_jw/design_ver2.html` — 다른 5건과 달리 **Anima export가 아니라 손으로 만든 HTML/
Tailwind 목업**(PR 제목 "Search_jw UI 피드백 반영 수정본", 즉 피드백까지 반영된 확정본)이었습니다.

**진짜 목표 재확인**: 1차 병합 때는 기존 Search 페이지(최근검색어/인기검색어/결과 그리드)만 있고
jw님 디자인의 핵심인 성분 검색 기능이 전혀 없었습니다. `design_ver2.html`을 직접 읽어서 확인한
실제 스펙:

- 상단 "통합검색"/"성분검색" pill 토글, 검색창 옆 "스마트 성분 스캐너" 버튼(📸)
- 통합검색: 최근 검색 항목(칩, 개별삭제×+전체삭제) → 인기 검색어(급상승/성분/브랜드 필터칩 +
  2열 10개 랭킹) → 배너 → 실시간 판매 BEST
- 성분검색: 최근 검색 항목(통합검색과 별도 저장) → 서브탭 "성분 사전"(3개 카테고리: 20가지
  주의 성분/알레르기 유발 주의 성분/자외선 차단 기능 성분, `+`로 마이 성분에 추가) / "마이 성분"
  (빈 상태: "즐겨찾는 성분이 없어요")
- 스마트 성분 스캐너 모달: bounce 아이콘 + pulse 프로그레스바 + "스캔 및 OCR 분석 중..." + "스캔
  취소하기" (실제 스캔 완료/결과 상태는 원본에도 없음 — 진행 중 상태만 목업)

**최종 구현**: 위 스펙을 전부 반영했습니다. `hooks/useRecentSearches.ts`(통합/성분 검색 독립
저장), `hooks/useMyIngredients.ts`(마이 성분 localStorage), `pages/Search/ScannerModal.tsx`를
새로 만들었습니다. 기존 "내 화장대에서 고르기"·검색 결과 그리드(PRD 핵심 기능인 대체품 추천과
연결됨)는 통합검색 탭 안에 그대로 유지했습니다. 이모지 아이콘(🔍📸💧💥🛡️)과 teal 하드코딩
팔레트는 프로젝트 토큰(`var(--primary)` 계열)으로 치환했습니다.

---

## 7. 반복적으로 걸렸던 문제 (팀 규칙화)

이 문서에 정리한 6건 병합에서 최소 4번 반복된 패턴을 [`README.md`](./README.md) 10절 팀 규칙과
[`scripts/check-submission.mjs`](./scripts/check-submission.mjs) 셀프 점검 스크립트로 만들었습니다:

1. 새 Vite 프로젝트로 통째로 스캐폴딩해서 옴 (자체 `package.json`/`vite.config`/lockfile)
2. Anima/Figma 자동 추출 특유의 absolute-pixel 레이아웃, `Component.tsx`/`Component1.tsx` 같은
   제네릭 이름
3. 상품명·가격 등 콘텐츠가 JSX에 그대로 하드코딩
4. MUI/Radix/lucide/Tailwind v4 등 금지된 의존성이 딸려 옴
5. 원본 export 폴더가 병합 후에도 정리되지 않고 레포에 계속 쌓임
