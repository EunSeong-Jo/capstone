# swappy 🌿

[![backend-tests](https://github.com/EunSeong-Jo/capstone/actions/workflows/backend-tests.yml/badge.svg)](https://github.com/EunSeong-Jo/capstone/actions/workflows/backend-tests.yml)

> **AI 기반 피부타입 맞춤 제품 추천 · 성분 유사도 대체품 매칭 서비스**

피부타입 진단(6문항 QnA 또는 얼굴 사진)으로 **8가지 피부 캐릭터** 중 하나를 정하고, 그 피부에 맞는 화장품을 추천합니다.
내가 쓰는 제품을 **화장대**에 올리면 **전성분만 보고** 성분이 비슷하면서 더 싸거나 더 잘 맞는 대체품을 찾아 주고,
예산을 입력하면 토너·에센스·크림·선크림 루틴 조합을 제안합니다. 챗봇은 내 피부·화장대·취향을 알고, 우리 계산 엔진을 도구로 불러 답합니다.

| 제품 | 성분 | 제품–성분 연결 | 유사도 | API | 화면 |
|---:|---:|---:|---:|---:|---:|
| **4,013** | **23,147** | **163,103** | **146,940** | **83**개 | **46**개 |

> 이 문서는 프로젝트의 **입구**입니다. 그림으로 전체를 보여 주고, 자세한 내용은 [문서 지도](#-문서-지도)의 링크로 안내합니다.
> 숫자는 2026-10-31 `main` 기준이며, 값이 다르면 링크된 정본 문서([docs/architecture/db-schema.md](docs/architecture/db-schema.md), [docs/algorithms/ai-and-scoring-logic.md](docs/algorithms/ai-and-scoring-logic.md))가 맞습니다.

---

## 목차

1. [핵심 기능](#-핵심-기능)
2. [시스템 구성도](#-시스템-구성도)
3. [프로세스 흐름도](#-프로세스-흐름도)
   - [데이터 수집·적재](#31-데이터-수집적재)
   - [대체품 추천 요청](#32-대체품-추천-요청)
   - [얼굴 사진 AI 분석](#33-얼굴-사진-ai-분석)
   - [챗봇 도구 호출](#34-챗봇-도구-호출)
4. [사용자 시나리오 구성도](#-사용자-시나리오-구성도)
5. [상세 구성도](#-상세-구성도)
   - [백엔드 계층](#51-백엔드-계층)
   - [프론트엔드 화면](#52-프론트엔드-화면)
   - [데이터 모델](#53-데이터-모델)
6. [기술 스택](#-기술-스택)
7. [빠른 시작](#-빠른-시작)
8. [테스트](#-테스트)
9. [프로젝트 구조](#-프로젝트-구조)
10. [피부타입 캐릭터](#-피부타입-캐릭터-8종)
11. [문서 지도](#-문서-지도)
12. [팀 · 라이선스](#-팀--라이선스)

---

## ✨ 핵심 기능

| 기능 | 한 줄 설명 | 자세히 |
|---|---|---|
| **피부타입 진단** | 5축(수분·유분·민감·색소·트러블) 점수 → 8타입과의 거리로 1~3순위, 경계 타입 안내 | [점수 로직 §3](docs/algorithms/ai-and-scoring-logic.md#3-피부타입-진단-qna) |
| **얼굴 사진 AI 분석** | 서버 사전 검증(YuNet·MediaPipe) → Perfect Corp 분석 → 5축 변환 → QnA와 혼합 | [점수 로직 §4](docs/algorithms/ai-and-scoring-logic.md#4-얼굴-사진-ai-분석) |
| **성분 유사도 · 대체품** | 역할 가중 TF-IDF + 기능 프로필 + 제형 일치(`hybrid`), 같은 카테고리 안에서만 비교 | [점수 로직 §5](docs/algorithms/ai-and-scoring-logic.md#5-성분-유사도--대체품-추천-servicesmatchingsimilaritypy) · [유사도 엔진](docs/algorithms/similarity.md) |
| **피부 궁합** | 성분 기능 라벨 × 타입별 선호·기피 → 0~100점, `good`/`ok`/`caution`/`unknown` | [점수 로직 §6](docs/algorithms/ai-and-scoring-logic.md#6-피부-궁합--성분-분석-servicesskinskin_fitpy--점수-로직의-핵심) |
| **홈 추천 · 예산 가이드** | 궁합·별점·리뷰수·브랜드 다양성 가중합, 예산 안의 루틴 조합을 전부 탐색해 3안 제시 | [점수 로직 §7](docs/algorithms/ai-and-scoring-logic.md#7-추천--예산-가이드) |
| **챗봇** | RAG + 도구 호출(계산 엔진 10종), LLM이 모두 실패해도 DB 규칙으로 답함 | [점수 로직 §8-1](docs/algorithms/ai-and-scoring-logic.md#8-1-챗봇-apichatpy-serviceschatragpy) |
| **퍼스널 AI** | AI 기억 · 내 성분 취향 · 피부 변화 리포트 · 오늘의 브리핑 | [점수 로직 §8-6](docs/algorithms/ai-and-scoring-logic.md#8-6-퍼스널-ai-serviceschatchat_toolspy-memorypy-preferencepy-skin_reportpy-briefingpy-personal_contextpy) |
| **사진으로 제품 찾기** | CLOVA OCR → `pg_trgm` 제품명 대조 → 후보 3개 + "찾는 제품이 없어요" | [점수 로직 §8-3](docs/algorithms/ai-and-scoring-logic.md#8-3-사진으로-제품-찾기-servicesscanocrpy-apiproductspy) · [OCR 벤치마크](research/ocr/OCR_SUMMARY.md) |
| **쇼핑 · 기록** | 화장대·장바구니·찜·주문·취소·반품·후기·포인트·선물·알림 | [기능 카탈로그](docs/architecture/PROJECT_OVERVIEW.md#5-기능-카탈로그-화면별) |

> **대체품·궁합·추천·예산 가이드·취향은 학습한 ML 모델이 아니라 규칙·통계식**입니다(TF-IDF 코사인, 가중합, 지수 포화).
> 모든 점수를 **성분 이름으로 설명**할 수 있게 설계했습니다. 사용한 AI·외부 모델 전체 목록은 [점수 로직 §1](docs/algorithms/ai-and-scoring-logic.md#1-한눈에--사용한-ai외부-모델)에 있습니다.

---

## 🏗 시스템 구성도

하나의 React 번들을 웹과 Android 앱(Capacitor)이 함께 씁니다. 운영 서버는 FastAPI가 API와 프론트 빌드 결과를 **한 주소에서** 서빙합니다.

```mermaid
flowchart LR
    subgraph Client["사용자"]
        APK["Android 앱<br/>(Capacitor)"]
        WEB["웹 브라우저"]
    end

    subgraph AWS["AWS Lightsail 컨테이너 서비스 · 서울"]
        API["swappy 컨테이너<br/>FastAPI + 프론트 정적 파일"]
        REDIS[("Redis 7<br/>캐시 · 호출 한도")]
    end

    DB[("PostgreSQL 16 + pg_trgm<br/>운영: Lightsail DB<br/>개발: Neon · 로컬 Docker")]

    subgraph EXT["외부 API"]
        LLM["LLM<br/>gpt-4o-mini → Claude"]
        PC["Perfect Corp<br/>얼굴 피부 분석"]
        OCR["CLOVA OCR"]
        WX["OpenWeather"]
    end

    APK -- HTTPS --> API
    WEB -- HTTPS --> API
    API <--> REDIS
    API <--> DB
    API --> LLM
    API --> PC
    API --> OCR
    API --> WX
```

- 운영 이미지는 [`Dockerfile.prod`](Dockerfile.prod) 하나입니다. Node로 프론트를 빌드한 뒤 Python 3.11 이미지에 백엔드와 함께 얹습니다.
- 파일은 디스크에 저장하지 않습니다. 후기 사진·분석 이미지는 DB에 바이트로 저장합니다.
- **외부 키가 없어도 서버는 뜹니다.** LLM이 없으면 챗봇은 규칙 폴백으로, OCR이 없으면 제품명 검색으로 안내합니다.
- 배포 절차는 [프로젝트 총정리 §11](docs/architecture/PROJECT_OVERVIEW.md#11-배포운영데모), 운영 DB 이전은 [docs/guides/aws-db-migration.md](docs/guides/aws-db-migration.md)에 있습니다.

---

## 🔄 프로세스 흐름도

### 3.1 데이터 수집·적재

제품과 성분 데이터는 미리 수집·정제해 DB에 넣고, 무거운 계산(유사도·궁합)은 **배치로 미리** 해 둡니다. 모든 단계는 멱등이라 다시 돌려도 안전합니다.

```mermaid
flowchart LR
    subgraph SRC["원천"]
        OY["올리브영 제품 페이지"]
        KCA["대한화장품협회<br/>성분 PDF"]
    end

    subgraph COLLECT["pipeline/collect"]
        RAW["수집 CSV<br/>data/raw"]
        DICT["성분 사전 CSV<br/>extract_ingredient_dict"]
    end

    subgraph LOAD["pipeline/load"]
        SI["seed_ingredients<br/>성분 21,910 + 별칭"]
        LP["load_products<br/>전성분 파싱 · 변형 접기"]
        SF["seed_ingredient_functions<br/>기능 라벨 1,686종"]
    end

    subgraph BATCH["pipeline/batch"]
        CS["compute_similarities"]
        CF["compute_skin_fit"]
    end

    subgraph DB["PostgreSQL"]
        PROD[("products · ingredients<br/>product_ingredients")]
        FUNC[("ingredient_functions")]
        SIMT[("similarities<br/>146,940행")]
        FITT[("product_skin_fit<br/>제품 × 8타입")]
    end

    OY -->|크롤러| RAW
    KCA --> DICT
    DICT --> SI --> PROD
    RAW --> LP --> PROD
    SF --> FUNC
    PROD --> CS
    FUNC --> CS
    PROD --> CF
    FUNC --> CF
    CS --> SIMT
    CF --> FITT
```

스크립트는 모두 `backend/pipeline/` 아래에 단계별로 있고, `backend/` 안에서 `python pipeline/load/load_products.py`처럼 실행합니다.

자세히: [DB 스키마 · 적재 파이프라인](docs/architecture/db-schema.md#적재-파이프라인) · [점수 로직 §11](docs/algorithms/ai-and-scoring-logic.md#11-데이터-수집적재-파이프라인)

### 3.2 대체품 추천 요청

화면에서 대체품을 열면 **미리 계산한 유사도를 읽기만** 합니다. 그래서 응답이 빠르고, 같은 제품은 Redis에서 바로 나갑니다.

```mermaid
sequenceDiagram
    autonumber
    participant U as 사용자
    participant F as 프론트엔드
    participant A as FastAPI
    participant R as Redis
    participant D as PostgreSQL

    U->>F: 제품 상세에서 "대체품" 열기
    F->>A: GET /api/v1/products/{id}/similar
    A->>R: 캐시 조회
    alt 캐시 있음
        R-->>A: 후보 목록
    else 캐시 없음
        A->>D: similarities + products 조회<br/>(같은 카테고리 · 변형 접기)
        D-->>A: 후보 + 공통 성분
        A->>R: 캐시 저장
    end
    A-->>F: 후보 · 점수 · 공통 성분(IDF 큰 순 5개)
    F->>A: 로그인 시 피부 궁합 조회
    A->>D: product_skin_fit 조회
    A-->>F: 궁합 점수 · 판정
    F-->>U: 더 싸거나 더 잘 맞는 대체품 카드
```

### 3.3 얼굴 사진 AI 분석

부적합한 사진은 **외부로 보내기 전에** 서버에서 거르고, 위치 정보(EXIF)를 지운 사진만 분석 업체로 보냅니다. 원본 사진은 보관하지 않습니다.

```mermaid
flowchart LR
    CAM["앱 촬영<br/>MediaPipe 얼굴 확인"] --> GATE{"서버 사전 검증<br/>YuNet 얼굴 검출<br/>크기 · 기울기 · 밝기 · 초점<br/>가림 검사"}
    GATE -- 실패 --> RETRY["다시 찍기 안내<br/>한도 차감 없음"]
    GATE -- 통과 --> CLEAN["EXIF 제거 · JPEG 재생성"]
    CLEAN --> PC["Perfect Corp<br/>업로드 → 작업 → 폴링"]
    PC --> AXES["항목별 점수 → 5축 변환"]
    AXES --> MIX{"QnA 응답이 있나?"}
    MIX -- 전부 --> M1["0.6 × QnA + 0.4 × 사진"]
    MIX -- 일부 --> M2["답한 축만 0.5 혼합"]
    MIX -- 없음 --> M3["사진 5축 그대로"]
    M1 --> RANK["8타입 순위 · 결과 화면"]
    M2 --> RANK
    M3 --> RANK
```

무료는 월 1회·8항목, 구독은 월 4회·16항목입니다. 자세히: [점수 로직 §4](docs/algorithms/ai-and-scoring-logic.md#4-얼굴-사진-ai-분석) · [백엔드 README](backend/README.md#얼굴-사진-ai-분석-perfect-corp)

### 3.4 챗봇 도구 호출

로그인한 사용자의 챗봇은 **사실을 직접 만들지 않고** 우리 계산 엔진을 불러 결과를 문장으로 옮깁니다. 담기·추가는 *제안*만 하고, 실제 실행은 사용자가 버튼을 눌러야 일어납니다.

```mermaid
sequenceDiagram
    autonumber
    participant U as 사용자
    participant A as /api/v1/chat
    participant C as 개인 컨텍스트
    participant L as LLM 체인
    participant T as 계산 엔진(도구)

    U->>A: "건성인데 이 크림보다 싼 거 있어?"
    A->>C: 피부타입 · 화장대 · 예산 · AI 기억 요약
    A->>L: 질문 + 컨텍스트 + RAG 제품 사실 + 도구 목록
    loop 최대 4라운드
        L->>T: find_alternatives · check_skin_fit 등
        T-->>L: DB에서 계산한 결과
    end
    L-->>A: 답변 + propose_add_to_cart(제안)
    A-->>U: 답변 + [담기] 버튼
    Note over A,L: LLM이 모두 실패하면 DB 규칙 폴백(mode: fallback)
```

도구 10종과 안전 규칙은 [점수 로직 §8-6](docs/algorithms/ai-and-scoring-logic.md#8-6-퍼스널-ai-serviceschatchat_toolspy-memorypy-preferencepy-skin_reportpy-briefingpy-personal_contextpy)에 있습니다.

---

## 🧭 사용자 시나리오 구성도

비회원도 진단까지 해 볼 수 있고(Soft-gate), 개인 데이터를 저장할 때부터 로그인합니다.

```mermaid
flowchart TD
    START(["스플래시 · 온보딩"]) --> GUEST["비회원 둘러보기<br/>검색 · 카테고리 · 제품 상세"]
    START --> AUTH["회원가입 · 로그인"]
    GUEST -. 개인 기능 사용 시 .-> AUTH

    AUTH --> DIAG{"피부타입 진단"}
    DIAG --> QNA["6문항 QnA"]
    DIAG --> PHOTO["얼굴 사진 AI 분석"]
    QNA --> RESULT["결과: 8타입 캐릭터<br/>1~3순위 · 경계 타입"]
    PHOTO --> RESULT

    RESULT --> HOME["홈: 피부타입 맞춤 추천<br/>날씨 케어 문구 · 오늘의 브리핑"]
    HOME --> CLOSET["화장대에 내 제품 등록"]
    CLOSET --> ADD{"등록 방법"}
    ADD --> SEARCH["제품명 검색"]
    ADD --> SCAN["사진으로 찾기 (OCR)"]
    ADD --> CHAT["챗봇에게 부탁"]

    CLOSET --> ALT["대체품 · 리필 · 다른 용량 제안"]
    CLOSET --> ANALYSIS["내 제품 성분 분석 · 피부 궁합"]
    HOME --> BUDGET["예산 구매 가이드<br/>루틴 3안"]

    ALT --> CART["장바구니"]
    BUDGET --> CART
    CART --> ORDER["주문 → 배송 → 후기 · 포인트"]
    ORDER --> GIFT["선물하기"]

    HOME --> AI["AI 피부관리 · 퍼스널 AI<br/>피부 변화 리포트 · AI 기억"]
    AI -. 재진단 권유 90일 .-> DIAG
```

- 시연용 단계별 워크스루(페르소나 5명 · 데모 계정 · 구간 1~6): [docs/guides/demo-scenario.md](docs/guides/demo-scenario.md)
- 화면별 기능 목록: [프로젝트 총정리 §5](docs/architecture/PROJECT_OVERVIEW.md#5-기능-카탈로그-화면별)
- 사용자 페르소나: [프로젝트 총정리 §1.4](docs/architecture/PROJECT_OVERVIEW.md#14-사용자-페르소나-prd-v18) · [PRD v1.8](docs/product/PRD_swappy_v1.8.md)

---

## 🧩 상세 구성도

### 5.1 백엔드 계층

라우터는 요청 검증과 응답만 맡고, 계산은 모두 `services/`에 있습니다. 같은 서비스를 화면 API와 챗봇 도구가 함께 씁니다.

```mermaid
flowchart LR
    subgraph API["api/ · 라우터 (엔드포인트 83개)"]
        direction TB
        a1["auth · me<br/>인증 · 프로필"]
        a2["products · ingredients<br/>목록 · 검색 · 상세 · 스캔"]
        a3["recommendations · recommendations_main<br/>대체품 · 홈 추천 · 예산 가이드"]
        a4["diagnosis · skin_photo<br/>QnA 진단 · 사진 분석"]
        a5["personal/<br/>closet · cart · orders · reviews · gifts …"]
        a6["chat · memory · insights · preferences<br/>챗봇 · 퍼스널 AI"]
        a7["skin_fit · analysis<br/>피부 궁합 · 성분 분석"]
        a8["weather · care_tip"]
    end

    subgraph SVC["services/ · 도메인별 계산 엔진"]
        direction TB
        s1["matching/<br/>similarity · option_scope · product_variants"]
        s2["skin/<br/>diagnosis · skin_type · skin_fit · product_analysis"]
        s3["recommend/<br/>product_score · budget_guide · routine_steps"]
        s6["chat/<br/>llm · rag · chat_tools · chat_fallback"]
        s7["personal_ai/<br/>personal_context · memory · preference<br/>skin_report · briefing"]
        s5["photo/<br/>skin_photo · face_gate · occlusion · skin_quota"]
        s8["scan/<br/>ocr · ocr_quota"]
        s9["commerce/<br/>notifications · experience · order_stage"]
    end

    subgraph DATA["models/ · SQLAlchemy"]
        direction TB
        m1["product · recommendation"]
        m2["user · personal"]
        m3["diagnosis · skin_photo"]
    end

    API --> SVC --> DATA
    a6 -. 도구 호출 .-> s1
    a6 -. 도구 호출 .-> s2
    a6 -. 도구 호출 .-> s3
```

| 계층 | 위치 | 문서 |
|---|---|---|
| 라우터 · API 목록 | `backend/app/api/` · Swagger `/api/docs` | [프로젝트 총정리 §6](docs/architecture/PROJECT_OVERVIEW.md#6-백엔드-api) · [점수 로직 §2](docs/algorithms/ai-and-scoring-logic.md#2-기능-목록-백엔드-api-기준) |
| 서비스(계산 엔진) | `backend/app/services/` | [docs/algorithms/ai-and-scoring-logic.md](docs/algorithms/ai-and-scoring-logic.md) |
| 모델 · 마이그레이션 | `backend/app/models/` · `backend/alembic/versions/` | [docs/architecture/db-schema.md](docs/architecture/db-schema.md) · [백엔드 README · Alembic](backend/README.md#alembic) |

### 5.2 프론트엔드 화면

화면 라우트 46개를 영역별로 묶은 지도입니다. 하단 내비게이션은 홈 · 카테고리 · 검색 · 화장대 · 마이입니다.

```mermaid
flowchart LR
    ROOT["/ 스플래시"] --> ONB["/onboarding"]
    ONB --> LOGIN["/login · /signup"]
    ONB --> QNA["/qna → /result"]

    subgraph HOMEG["홈 · 탐색"]
        HOME["/home"]
        CAT["/category/:code"]
        SEARCH["/search"]
        SCAN["/scan · /scan/history"]
        DETAIL["/detail/:id"]
        ALT["/alternatives · /compare"]
    end

    subgraph CLOSETG["화장대 · 기록"]
        CLOSET["/closet"]
        ANAL["/analysis/:id"]
        HIST["/history · /likes"]
    end

    subgraph SHOP["구매 · 소셜"]
        CART["/cart"]
        ORDER["/mypage/order-history"]
        GIFT["/gift/:productId"]
    end

    subgraph MY["마이페이지"]
        MYP["/mypage"]
        AIME["/mypage/ai-me<br/>AI 피부관리"]
        SET["/mypage/settings/*<br/>프로필 · AI 기억 · 사진 동의"]
    end

    QNA --> HOME
    LOGIN --> HOME
    HOME --> DETAIL
    CAT --> DETAIL
    SEARCH --> DETAIL
    SCAN --> DETAIL
    DETAIL --> ALT
    DETAIL --> CART
    CLOSET --> ANAL
    CLOSET --> ALT
    CART --> ORDER
    MYP --> AIME
    MYP --> SET
```

- 화면 규격 · 컨벤션 · 목업 금지 규칙: [frontend/README.md](frontend/README.md#7-1-화면-규격-표준--2026-07-ui-통일에서-확정)
- 컴포넌트 카탈로그 · 디자인 토큰: [docs/guides/frontend-component-guide.md](docs/guides/frontend-component-guide.md) · [docs/guides/dev_guidelines.md](docs/guides/dev_guidelines.md)
- 전체 라우트 정의: [`frontend/src/App.tsx`](frontend/src/App.tsx)

### 5.3 데이터 모델

테이블 38개를 도메인으로 묶으면 다음과 같습니다. 컬럼 · 인덱스 · 행수는 정본 문서에 있습니다.

```mermaid
erDiagram
    BRANDS ||--o{ PRODUCTS : "만든다"
    CATEGORIES ||--o{ PRODUCTS : "분류"
    PRODUCTS ||--o{ PRODUCT_INGREDIENTS : "전성분"
    INGREDIENTS ||--o{ PRODUCT_INGREDIENTS : "포함"
    INGREDIENTS ||--o| INGREDIENT_FUNCTIONS : "기능 라벨(norm_name)"
    PRODUCTS ||--o{ SIMILARITIES : "대체품 후보"
    PRODUCTS ||--o{ PRODUCT_SKIN_FIT : "8타입 궁합"
    USERS ||--o{ DIAGNOSES : "진단"
    USERS ||--o{ SKIN_ANALYSES : "사진 분석"
    USERS ||--o{ CLOSET_ITEMS : "화장대"
    USERS ||--o{ ORDERS : "주문"
    USERS ||--o{ REVIEWS : "후기"
    USERS ||--o{ USER_MEMORIES : "AI 기억"
    PRODUCTS ||--o{ CLOSET_ITEMS : "담김"
    PRODUCTS ||--o{ REVIEWS : "후기 대상"
```

> 위 그림은 38개 중 대표 테이블만 고른 것입니다. 실제 테이블 이름과 전체 관계도는 [docs/architecture/db-schema.md](docs/architecture/db-schema.md#관계도)를 보세요.

---

## 🛠 기술 스택

| 영역 | 기술 |
|---|---|
| **Frontend** | React 18 · TypeScript · Vite · Tailwind CSS · **Capacitor**(Android 앱) · MediaPipe Tasks Vision(촬영 전 얼굴 확인) |
| **Backend** | Python 3.11 · FastAPI(비동기) · SQLAlchemy 2.0 · Alembic · structlog · Sentry |
| **Database** | PostgreSQL 16 + `pg_trgm` · Redis 7(캐시 · 일일 한도) |
| **수치 계산** | numpy + scipy 희소행렬(TF-IDF 코사인 직접 구현, scikit-learn 미사용) |
| **LLM** | OpenAI `gpt-4o-mini` → Anthropic `claude-haiku-5-5` → DB 규칙 폴백 |
| **외부 API** | 네이버 CLOVA OCR · Perfect Corp YouCam(피부 분석) · OpenWeather |
| **이미지 처리** | Pillow(EXIF 제거) · OpenCV YuNet(얼굴 검출) · MediaPipe(가림 검사) |
| **인프라** | Docker Compose(로컬) · AWS Lightsail 컨테이너 + DB(운영) · Neon(개발) |

---

## 🚀 빠른 시작

> **Windows에서 설치 없이 보려면**: `git clone` 후 `Swappy.bat`만 실행하면 서버와 앱 창이 뜹니다 → [docs/guides/로컬실행.md](docs/guides/로컬실행.md)

```bash
git clone https://github.com/EunSeong-Jo/capstone.git
cd capstone

cp .env.example .env
#  .env의 DATABASE_DSN에 Neon 연결 문자열을 넣습니다. (필수 · Neon 조직 dmu 초대 필요)
#  선택: OPENAI_API_KEY / ANTHROPIC_API_KEY(챗봇), CLOVA_OCR_*(사진으로 찾기), PERFECT_CORP_*(피부 분석)

docker compose up --build
```

| 서비스 | URL |
|--------|-----|
| 프론트엔드 | http://localhost:3000 |
| 백엔드 API | http://localhost:8000/health |
| Swagger 문서 | http://localhost:8000/api/docs |

<details>
<summary>Docker 없이 / 로컬 PostgreSQL로 돌리기</summary>

```bash
# 터미널 1 — 백엔드
cd backend && uvicorn app.main:app --reload
# 터미널 2 — 프론트엔드 (프록시 대상을 지정해야 합니다)
cd frontend && VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev

# 로컬 DB가 필요하면 (빈 DB라 스키마·데이터를 직접 넣어야 합니다)
docker compose --profile local-db up
cd backend && alembic upgrade head
python backend/pipeline/load/seed_ingredients.py && python backend/pipeline/load/load_products.py
```

Neon 덤프를 로컬로 복원하는 방법은 [백엔드 README · 로컬 DB로 개발하기](backend/README.md#로컬-db로-개발하기-neon-cu-hrs를-쓰지-않기)에 있습니다.

</details>

| 하려는 일 | 문서 |
|---|---|
| 백엔드 세팅 · 마이그레이션 · 테스트 | [backend/README.md](backend/README.md) |
| 프론트 세팅 · 화면 규격 · APK 빌드 | [frontend/README.md](frontend/README.md) |
| 브랜치 · PR · 공용 DB 주의사항 | [CLAUDE.md](CLAUDE.md#작업-규칙) |

---

## ✅ 테스트

백엔드 테스트 **787건**을 DB가 필요한지에 따라 두 폴더로 나눴습니다.

| 폴더 | 무엇을 검증하나 | 필요한 것 | 건수 | 실행 |
|---|---|---|---:|---|
| [`backend/tests/unit`](backend/tests/unit) | 유사도·궁합·진단 점수, 전성분 파싱, 예산 조합, 챗봇 도구·폴백 규칙(LLM은 가짜) | Python만 | 474 | **GitHub Actions가 푸시·PR마다** |
| [`backend/tests/integration`](backend/tests/integration) | API 응답 계약, DB 조회·쓰기, 이용 한도(Redis) | 데이터가 적재된 Postgres + Redis | 313 | 로컬 Postgres |

```bash
cd backend && pytest tests/unit                               # DB 없이 약 3초
docker exec swappy_backend python -m pytest                   # 전부 (로컬 Postgres)
```

나눈 기준은 짐작이 아니라 실측입니다. DB·Redis 접속을 끊고 전체를 돌렸을 때 통과한 테스트가 unit입니다. 자세히: [백엔드 README · 테스트](backend/README.md#테스트)

---

## 📁 프로젝트 구조

```
capstone/
├── backend/
│   ├── app/                 # ── 서버 런타임 ──
│   │   ├── api/             #   라우터 (엔드포인트 83개, 개인 데이터는 personal/ 패키지)
│   │   ├── services/        #   계산 엔진 — matching · skin · recommend · chat · personal_ai · photo · scan · commerce
│   │   ├── models/          #   SQLAlchemy 모델 — DB 스키마 원본
│   │   ├── schemas/         #   Pydantic 입출력
│   │   └── core/ db/ utils/ assets/
│   ├── pipeline/            # ── DB를 만드는 오프라인 스크립트 ──
│   │   ├── collect/         #   수집 · 성분 사전 추출
│   │   ├── load/            #   적재 · 시드
│   │   ├── batch/           #   유사도 · 궁합 사전 계산
│   │   └── maintenance/     #   정비 · 진단 리포트
│   ├── alembic/versions/    # 마이그레이션
│   └── tests/               # pytest — unit(DB 불필요, CI) · integration(DB 필요)
├── frontend/                # React + Capacitor (Android) — src/ pages · components · hooks · api · context
├── data/                    # raw(수집 CSV) · seed(성분 사전·기능 라벨) · eval(평가 정답셋) · ocr_test(실사진)
├── research/                # 끝난 실험과 측정 — eval(평가 스위트) · image-match · ocr(엔진 벤치마크)
├── tools/                   # demo(시연 시드) · ops(AWS DB · DB 초기화) · standalone(Windows 단독 실행)
├── docs/                    # architecture · algorithms · guides · product · design · deliverables → docs/README.md
├── Swappy.bat               # Windows 단독 실행 진입점
├── Dockerfile.prod          # 운영 이미지 (프론트 빌드 + 백엔드)
├── .github/workflows/       # CI — 백엔드 unit 테스트
└── docker-compose.yml       # 로컬 개발
```

| 폴더 | 원칙 |
|---|---|
| `backend/app` | 서버가 import하는 코드만 둡니다 |
| `backend/pipeline` | DB를 만드는 반복 실행 스크립트입니다. 서버는 import하지 않습니다 |
| `research` | 결론이 난 실험과 측정입니다. 운영 코드가 여기를 참조하지 않습니다 |
| `tools` | 사람이 손으로 돌리는 시연 · 운영 도구입니다 |
| `docs` | 주제마다 정본이 하나입니다 — [docs/README.md](docs/README.md) |

---

## 🎭 피부타입 캐릭터 (8종)

| 캐릭터 | 특성 | 추천 성분 방향 |
|--------|------|---------------|
| 수분팡팡 옹달샘 | 수분·유분 균형 (이상적 피부) | 가벼운 보습 유지 |
| 반질반질 물개 | 지성, 번들거림, 모공 | 살리실산, 논코메도제닉 |
| 겉바속촉 수부지 | 속건조 + 겉번들 | 히알루론산 + 가벼운 유분 조절 |
| 울긋불긋 화산 | 트러블·홍조·염증 | 시카, 판테놀, 진정 성분 |
| 바스락 사막 | 극건성, 당김 강함 | 세라마이드, 시어버터, 고보습 |
| 말랑말랑 인절미 | 건성·탄력 저하, 주름 | 레티놀, 펩타이드, 콜라겐 |
| 조심조심 유리구슬 | 민감성, 자극에 즉각 반응 | 저자극 인증, 무향, 무알코올 |
| 얼룩덜룩 메밀묵 | 색소침착·잡티·톤 불균형 | 나이아신아마이드, 비타민C |

타입별 5축 프로필과 선호·기피 성분 가중치는 [점수 로직 §3-2](docs/algorithms/ai-and-scoring-logic.md#3-2-8타입-프로필-코드-상수) · [§6-2](docs/algorithms/ai-and-scoring-logic.md#6-2-타입별-선호-기능-가중-prefer)에 있습니다.

---

## 📚 문서 지도

**처음 본다면** → [프로젝트 총정리](docs/architecture/PROJECT_OVERVIEW.md) → [점수 로직 총정리](docs/algorithms/ai-and-scoring-logic.md) → [데모 시나리오](docs/guides/demo-scenario.md) 순서를 추천합니다.

| 분류 | 문서 | 내용 |
|---|---|---|
| **색인** | [docs/README.md](docs/README.md) | 문서 폴더 안내 · 주제별 정본 목록 |
| **개요** | [docs/architecture/PROJECT_OVERVIEW.md](docs/architecture/PROJECT_OVERVIEW.md) | 프로젝트 총정리 — 구조, 기능 카탈로그, 고민과 결정 기록, 타임라인 |
| | [docs/product/PRD_swappy_v1.8.md](docs/product/PRD_swappy_v1.8.md) | 제품 요구사항 (§7.9 스키마는 설계 시점 안이라 실제와 다름) |
| **AI · 알고리즘** | [docs/algorithms/ai-and-scoring-logic.md](docs/algorithms/ai-and-scoring-logic.md) | AI · 점수 로직 총정리 (가중치·임계값 전체) |
| | [docs/algorithms/similarity.md](docs/algorithms/similarity.md) | 성분 유사도 엔진과 평가 (nDCG@10 0.799) |
| | [research/ocr/OCR_SUMMARY.md](research/ocr/OCR_SUMMARY.md) · [research/image-match/IMAGE_MATCH_SUMMARY.md](research/image-match/IMAGE_MATCH_SUMMARY.md) | OCR 엔진 벤치마크 · 이미지 유사도 측정 |
| **데이터** | [docs/architecture/db-schema.md](docs/architecture/db-schema.md) | **DB 스키마 정본** — 테이블 38개, 인덱스, 적재 파이프라인 |
| **시나리오 · 시연** | [docs/guides/demo-scenario.md](docs/guides/demo-scenario.md) | 단계별 데모 워크스루 · 데모 계정 · 시연 전 한계 |
| | [docs/guides/로컬실행.md](docs/guides/로컬실행.md) | Windows 단독 실행 (`Swappy.bat`) |
| **개발** | [backend/README.md](backend/README.md) | 백엔드 세팅 · Alembic · Neon 주의사항 · 테스트 |
| | [frontend/README.md](frontend/README.md) | 프론트 기준 · 화면 규격 · APK 빌드 · 협업 규칙 |
| | [docs/guides/frontend-component-guide.md](docs/guides/frontend-component-guide.md) | 컴포넌트 카탈로그 · 디자인 토큰 |
| | [docs/guides/dev_guidelines.md](docs/guides/dev_guidelines.md) | 디자인 시스템 · 화면별 체크리스트 |
| | [CLAUDE.md](CLAUDE.md) | 현황 · 태스크 · 작업 규칙(브랜치·마이그레이션·공용 DB) |
| **운영** | [docs/guides/aws-db-migration.md](docs/guides/aws-db-migration.md) | 운영 DB(AWS) 생성 · 덤프 · 복원 |
| | [프로젝트 총정리 §11](docs/architecture/PROJECT_OVERVIEW.md#11-배포운영데모) | 배포 절차 (Lightsail 컨테이너) |

---

## 👥 팀 · 라이선스

| 이름 | 역할 |
|---|---|
| 조은성 | 팀장 · 프론트 통합 |
| 최동균 | 부팀장 · 상품 데이터 · DB |
| 박주원 | 편집 · 백엔드 · RAG 챗봇 |
| 심유빈 | 학술 · OCR · UI |
| 김미송 | 총무 · UI/UX · 피부진단 |

이 저장소의 모든 내용은 저작권자 5인의 공동 저작물이며 **All Rights Reserved**입니다.
사전 서면 허락 없이 복제 · 수정 · 배포 · 이용할 수 없습니다 → [LICENSE](LICENSE)
