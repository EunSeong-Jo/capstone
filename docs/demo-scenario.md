# 데모 시나리오 — "조 감독 시연"

> 목적: 지도교수 시연·발표에서 **비로그인 → 로그인/진단 → 화장대 등록(OCR·챗봇) → 개인화 추천 → 장바구니 → 구매**의 한 줄기를 끊김 없이 보여준다.
>
> 최종 갱신: 2026-09-11

---

## 0. 실행 전제

프론트엔드만 있으면 된다. **백엔드·DB 불필요.**

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

상태(로그인·진단·화장대·장바구니·주문)는 전부 브라우저 `localStorage`에 저장된다
(`swappy:*` 키). 인증 API(Task 12)가 아직 없어 로그인은 `src/data/personas.json`
대조로 처리한다. 제품 목록은 백엔드가 없으면 목업으로 자동 폴백한다
(`useProducts` → `isMock`).

> 시연을 처음부터 다시 하려면 브라우저 개발자도구 → Application → Local Storage에서
> `swappy:*` 키를 지우거나, 시크릿 창을 새로 연다.

---

## 1. 테스트 계정 (페르소나)

원본: [`frontend/src/data/personas.json`](../frontend/src/data/personas.json) — 프론트와 백엔드 시드가 함께 읽는다.
팀 구성(PPT "02 팀 구성 및 역할")과 동일 인물·역할로 맞췄다 — 게스트 포함 6종.

| 구분 | 역할 | 이메일 | 피부타입 | 보유 화장품 | 예산 |
|---|---|---|---|---|---|
| **게스트** | — | (로그인 안 함) | 미정 | 0개 | — |
| 조은성 | 팀장 · 프론트엔드 통합 | `eunseong@swappy.app` | 수분팡팡 옹달샘 | 2개 (라운드랩 독도 토너 / 이니스프리 그린티 세럼) | 4~7만원 |
| 최동균 | 부팀장 · 상품 데이터 · DB | `donggyun@swappy.app` | 겉바속촉 수부지 | 3개 (이니스프리 토너 / 에스트라 아토베리어 크림 / 닥터지 레드블레미쉬) | 3~5만원 |
| 박주원 | 편집 · 백엔드 · RAG 챗봇 | `juwon@swappy.app` | 반질반질 물개 | 3개 (코스알엑스 토너 / 브링그린 시카 세럼 / 라운드랩 클렌징폼) | 1.5~3.5만원 |
| 심유빈 | 학술 · OCR · UI | `yubin@swappy.app` | 조심조심 유리구슬 | 2개 (아벤느 시칼파 크림 / 라로슈포제 시카플라스트 밤) | 2.5~4.5만원 |
| 김미송 | 총무 · UI/UX · 피부진단 | `misong@swappy.app` | 바스락 사막 | 5개 (바이오더마·라운드랩·토리든·라로슈포제·웰라쥬) | 5~8만원 |

비밀번호는 전부 `swappy1234`.

로그인 3가지 방법:

1. **데모 퀵버튼** — 로그인 화면의 "데모 계정으로 바로 로그인" 칩 5개 (시연 권장)
2. **이메일 로그인** — 위 표의 이메일 + `swappy1234`
3. **게스트** — "로그인 없이 둘러보기"

---

## 2. 조 감독 시나리오 — 단계별 워크스루

주인공: **게스트 → `donggyun@swappy.app` (최동균 · 부팀장)** — 다른 팀원 계정으로 바꿔도 동일한 흐름이 각자의 피부타입·보유 화장품으로 재현된다.

### 구간 1 — 비로그인으로 둘러보기

| # | 화면 | 액션 | 시스템 반응 | 확인 포인트 |
|---|---|---|---|---|
| 1 | Splash `/` | 앱 진입 | 스플래시 → 온보딩/로그인 유도 | — |
| 2 | Login `/login` | **"로그인 없이 둘러보기"** | `continueAsGuest()` → `/home` 이동, scope=`guest` | 로그인 없이 홈 진입됨 |
| 3 | Home `/home` | 스크롤 | 추천은 기본 피부타입(옹달샘)·목업 기준. 대시보드는 목업 프로필 | 게스트도 카탈로그·대체품 캐러셀 열람 가능 |
| 4 | ProductDetail `/detail/:id` | 추천 카드 탭 | 전성분·상품정보 표시 | 상세는 게스트도 접근 |

### 구간 2 — 로그인하며 피부타입 진단 (게스트 진단 승계)

| # | 화면 | 액션 | 시스템 반응 | 확인 포인트 |
|---|---|---|---|---|
| 5 | Login `/login` | 데모 퀵버튼 **"최동균"** (또는 이메일 로그인) | `loginAs('donggyun')` → scope=`donggyun`. 화장대가 페르소나 보유품 3개로 1회 시드됨 | 로그인 후 `/onboarding`으로 이동 |
| 6 | Onboarding | "피부타입 몰라요" → 6문항 응답 | 마지막 문항에서 답 배열이 `computeDiagnosis()`로 전달 → 5축 점수·8타입 순위 산출 | **답에 따라 결과 타입이 실제로 달라짐** (하드코딩 아님) |
| 7 | Result 카드 | 결과 확인 → "추천받기" | `saveDiagnosis({source:'quiz'})` → `swappy:diag:v1:donggyun` 저장, `/home` 이동 | 1·2·3순위와 5축 점수가 결과에 반영 |
| 8 | Home 상단 | — | (게스트 상태에서 먼저 진단했던 경우) "로그인 전 진단한 피부타입을 계정으로 가져왔어요" 배너 노출 | **게스트 → 계정 진단 승계** (`guest_token` 승계 설계 재현) |

> 승계를 보여주려면: 먼저 게스트로 `/onboarding` 진단 완료 → 그 다음 로그인.
> `swappy:diag:v1:guest`가 `swappy:diag:v1:<persona>`로 옮겨지고 게스트 사본은 삭제된다.

### 구간 3 — 내 화장품을 화장대에 등록

**경로 A — OCR 스캔**

| # | 화면 | 액션 | 시스템 반응 | 확인 포인트 |
|---|---|---|---|---|
| 9 | Closet `/closet` → "제품 추가" | 스캔 화면 이동 | `/scan` | 시드된 보유품 3개가 이미 보임 |
| 10 | Scan `/scan` | 셔터 탭 | "성분을 읽는 중…" 1.4초 → 인식 결과 시트 (제품명 + 전성분 칩 + 안전/주의 카운트) | `data/ocrFixtures.ts`의 준비된 결과가 순환 반환 |
| 11 | 결과 시트 | **"화장대에 추가"** | `ClosetContext.addItem({addedVia:'scan', status:'scanned'})` → `/closet` | 화장대에 "스캔 완료 · OCR 스캔으로 추가" 항목 생성 |

**경로 B — 챗봇**

| # | 화면 | 액션 | 시스템 반응 | 확인 포인트 |
|---|---|---|---|---|
| 12 | 챗봇 `/mypage/chat-support` | "🧴 내 화장품 등록하기" 버튼 (또는 "화장품 등록"이라고 입력) | 봇이 "브랜드와 제품명을 한 줄로" 요청, `registerMode` 진입 | 이 구간은 서버 호출 없이 로컬 처리 |
| 13 | 챗봇 입력 | `토리든 다이브인 저분자 히알루론산 세럼 50ml` | 첫 어절=브랜드로 분리 → `addItem({addedVia:'chatbot'})` → "화장대에 추가했어요" + "내 화장대 보기" 버튼 | 화장대에 "챗봇으로 추가" 항목 생성 |

### 구간 4 — 피부타입 + 보유 화장품을 반영한 추천

| # | 화면 | 액션 | 시스템 반응 | 확인 포인트 |
|---|---|---|---|---|
| 14 | Home `/home` | 새로고침/재진입 | 대시보드가 **최동균 닉네임 + 진단 피부타입(수부지)**로 표시. 마스코트·경험치 바 반영 | 로그인·진단이 홈에 연결됨 |
| 15 | Home "🎯 …맞춤 추천 세트" | — | `useRecommendations(skinType, 보유품)` — 피부타입 선호 키워드로 점수화, **보유 화장품 제외**, 서로 다른 카테고리 3종 + 세트 합계 | 보유 중인 제품이 추천에서 빠짐 |
| 16 | Home "🧴 내 화장대와 비슷한 추천" / "💰 더 저렴한 대체품" | "더보기" | `/alternatives?seed=<화장대 항목 id>&from=home` | 화장대 항목 기준으로 대체품 화면 진입 |
| 17 | Alternatives `/alternatives` | 유사도·가격·궁합 태그 확인 | 유사도 %/절약률/피부 궁합 배지 | 대체품 추천 근거 표시 (유사도 엔진은 현재 목업/선케어만 실적재) |

### 구간 5 — 장바구니 → 구매 → 주문내역

| # | 화면 | 액션 | 시스템 반응 | 확인 포인트 |
|---|---|---|---|---|
| 18 | Home 추천 세트 | **"장바구니에 담기"** | 세트 3종을 `CartContext.addToCart` → `/cart` | 상단 앱바 장바구니 뱃지 숫자 증가 |
| 19 | ProductDetail | "장바구니" 또는 "바로 구매" | 해당 제품 담기 → `/cart` | 상세에서도 담기 동작 |
| 20 | Cart `/cart` | 수량 조절/삭제 확인 → **"구매하기"** | `checkout()` → 주문 생성(`swappy:orders:v1:<scope>`), 장바구니 비움 | 주문 완료 화면 + 주문번호 |
| 21 | 주문 완료 | "주문내역 보기" | `/mypage/order-history` | **방금 구매한 주문이 목록 최상단**에 표시 (예시 주문은 그 아래) |

---

## 3. 백엔드 시드 (선택 — 논문/DB 확인용)

프론트 데모에는 필요 없지만, "통합 DB에 진단까지 들어간 실사용자"를 보여주려면:

```bash
# 백엔드 venv, .env에 DATABASE_DSN(Neon) 설정된 상태에서
python scripts/seed_test_users.py --dry-run   # 계획만 출력
python scripts/seed_test_users.py             # users/profiles/diagnoses/diagnosis_ranks 적재 (멱등)
```

- `personas.json`을 그대로 읽어 프론트와 **같은 사람**을 DB에 심는다.
- `users`(bcrypt 해시) · `profiles`(skin_type·scores·budget) · `diagnoses` + `diagnosis_ranks`(1~3순위).
- 이메일이 이미 있으면 갱신하고, 진단 기록은 사용자별로 지운 뒤 재삽입한다.

---

## 4. 이번 작업으로 추가된 것 · 남은 한계

**추가됨**

| 영역 | 파일 |
|---|---|
| 페르소나 원본 | `frontend/src/data/personas.json`, `personas.ts` |
| 전역 상태 | `context/{AuthContext,DiagnosisContext,ClosetContext,CartContext}.tsx`, `context/storage.ts` |
| 진단 스코어링 | `data/skinTypeScoring.ts` (6문항 → 5축 → 8타입) |
| OCR 시뮬레이션 | `data/ocrFixtures.ts`, `pages/Scan/index.tsx` |
| 챗봇 등록 플로우 | `pages/Mypage/ChatSupportPage.tsx` |
| 개인화 추천 | `hooks/useRecommendations.ts`, `hooks/useProducts.ts`(목업 폴백), `pages/Home/index.tsx` |
| 장바구니·구매 | `pages/Cart/index.tsx`, `context/CartContext.tsx`, `OyAppBar` 뱃지, `OrderHistoryPage` 연동 |
| 로그인 | `pages/Login/index.tsx` (페르소나 로그인 + 게스트) |
| 백엔드 시드 | `scripts/seed_test_users.py` |

**한계 (시연 전 알고 있어야 할 것)**

- 전부 `localStorage` 기반이다. 기기·브라우저를 옮기면 상태가 따라오지 않는다.
- 유사도/대체품 추천은 여전히 목업이다 (`similarities` 테이블은 선케어 147건만 실적재).
- OCR은 실제 인식이 아니라 준비된 결과 순환이다 (Task 4 미연동).
- 로그인은 프론트 대조다. 백엔드 JWT 인증(Task 12)과는 연결돼 있지 않다.
- 결제는 `checkout()`이 주문내역으로 옮기는 흉내다 (PG 미연동).
- `useProducts` 목업 폴백은 `mocks/oliveyoung.ts`의 12종 풀이라 추천 다양성이 제한된다.
  백엔드를 함께 띄우면 실제 4,150개에서 추천된다.
