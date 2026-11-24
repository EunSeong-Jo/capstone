# swappy 구성도 모음

[README](../../README.md)에는 시스템 구성도만 두고, 나머지 그림은 여기에 모았습니다.
숫자는 2026-11-24 DB 실측값입니다. 값이 다르면 [DB 스키마](db-schema.md)가 정본입니다.

| 구분 | 그림 |
|---|---|
| 프로세스 흐름도 | [1.1 데이터 수집·적재](#11-데이터-수집적재) · [1.2 대체품 추천 요청](#12-대체품-추천-요청) · [1.3 얼굴 사진 AI 분석](#13-얼굴-사진-ai-분석) · [1.4 챗봇 도구 호출](#14-챗봇-도구-호출) |
| 사용자 시나리오 | [2. 사용자 시나리오 구성도](#2-사용자-시나리오-구성도) |
| 상세 구성도 | [3.1 백엔드 계층](#31-백엔드-계층) · [3.2 프론트엔드 화면](#32-프론트엔드-화면) · [3.3 데이터 모델](#33-데이터-모델) |

---

## 1. 프로세스 흐름도

### 1.1 데이터 수집·적재

제품과 성분 데이터는 미리 수집·정제해 DB에 넣고, 무거운 계산(유사도·궁합)은 **배치로 미리** 해 둡니다. 모든 단계는 멱등이라 다시 돌려도 안전합니다.

```mermaid
flowchart LR
    subgraph SRC["원천"]
        OY["올리브영<br/>제품 페이지"]
        KCA["화장품협회<br/>성분 PDF"]
    end

    subgraph COLLECT["pipeline/collect"]
        RAW["수집 CSV<br/>data/raw"]
        DICT["성분 사전 CSV"]
    end

    subgraph LOAD["pipeline/load"]
        SI["seed_ingredients<br/>성분 21,910"]
        LP["load_products<br/>전성분 파싱"]
        SF["seed_ingredient_<br/>functions<br/>기능 라벨 1,686"]
    end

    subgraph BATCH["pipeline/batch"]
        CS["compute_similarities"]
        CF["compute_skin_fit"]
    end

    subgraph DB["PostgreSQL"]
        PROD[("products<br/>ingredients<br/>product_<br/>ingredients")]
        FUNC[("ingredient_<br/>functions")]
        SIMT[("similarities<br/>105,620행")]
        FITT[("product_<br/>skin_fit<br/>제품 × 8타입")]
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

스크립트는 모두 `backend/pipeline/` 아래에 단계별로 있고, `backend/` 안에서 실행합니다.

```bash
python pipeline/load/load_products.py
```

자세히: [DB 스키마 · 적재 파이프라인](db-schema.md#적재-파이프라인) · [점수 로직 §11](../algorithms/ai-and-scoring-logic.md#11-데이터-수집적재-파이프라인)

### 1.2 대체품 추천 요청

대체품 화면은 **미리 계산한 유사도를 읽기만** 해서 빠르고, 한 번 본 제품은 Redis 캐시에서 바로 나갑니다.

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

### 1.3 얼굴 사진 AI 분석

부적합한 사진은 **외부로 보내기 전에** 서버에서 거르고, 위치 정보(EXIF)를 지운 사진만 분석 업체로 보냅니다. 원본 사진은 보관하지 않습니다.

```mermaid
flowchart LR
    CAM["앱 촬영<br/>MediaPipe<br/>얼굴 확인"] --> GATE{"서버<br/>사전 검증"}
    GATE -- 실패 --> RETRY["다시 찍기 안내<br/>한도 차감 없음"]
    GATE -- 통과 --> PC["EXIF 제거<br/>Perfect Corp<br/>5축 변환"]
    PC --> MIX{"QnA<br/>응답?"}
    MIX -- 전부 --> M1["QnA 0.6<br/>+ 사진 0.4"]
    MIX -- 일부 --> M2["답한 축만<br/>0.5 혼합"]
    MIX -- 없음 --> M3["사진 5축<br/>그대로"]
    M1 & M2 & M3 --> RANK["8타입 순위<br/>결과 화면"]
```

무료는 월 1회·8항목, 구독은 월 4회·16항목입니다. 자세히: [점수 로직 §4](../algorithms/ai-and-scoring-logic.md#4-얼굴-사진-ai-분석) · [백엔드 README](../../backend/README.md#얼굴-사진-ai-분석-perfect-corp)

### 1.4 챗봇 도구 호출

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

도구 10종과 안전 규칙은 [점수 로직 §8-6](../algorithms/ai-and-scoring-logic.md#8-6-퍼스널-ai-serviceschatchat_toolspy-memorypy-preferencepy-skin_reportpy-briefingpy-personal_contextpy)에 있습니다.

---

## 2. 사용자 시나리오 구성도

비회원은 검색·카테고리·제품 상세까지 둘러볼 수 있고, 피부타입 진단과 개인 데이터(화장대·장바구니 등)는 로그인한 뒤에 씁니다.

```mermaid
flowchart TD
    START(["스플래시<br/>온보딩"]) --> GUEST["비회원<br/>둘러보기"]
    START --> AUTH["회원가입<br/>로그인"]
    GUEST -. 개인 기능 사용 시 .-> AUTH

    AUTH --> DIAG{"피부타입 진단"}
    DIAG --> QNA["6문항 QnA"]
    DIAG --> PHOTO["얼굴 사진<br/>AI 분석"]
    QNA --> RESULT["8타입 결과<br/>1~3순위"]
    PHOTO --> RESULT

    RESULT --> HOME["홈 맞춤 추천<br/>날씨 · 브리핑"]
    HOME --> CLOSET["화장대에<br/>내 제품 등록"]
    CLOSET --> ADD{"등록 방법"}
    ADD --> SEARCH["제품명 검색"]
    ADD --> SCAN["사진으로 찾기<br/>(OCR)"]
    ADD --> CHAT["챗봇에게 부탁"]

    CLOSET --> ALT["대체품 · 리필<br/>다른 용량"]
    CLOSET --> ANALYSIS["성분 분석<br/>피부 궁합"]
    HOME --> BUDGET["예산 가이드<br/>루틴 3안"]

    ALT --> CART["장바구니"]
    BUDGET --> CART
    CART --> ORDER["주문 → 배송<br/>후기 · 포인트"]
    ORDER --> GIFT["선물하기"]

    HOME --> AI["AI 피부관리<br/>변화 리포트<br/>AI 기억"]
    AI -. 재진단 권유 90일 .-> DIAG
```

- 시연용 단계별 워크스루(페르소나 5명 · 데모 계정 · 구간 1~6): [데모 시나리오](../guides/demo-scenario.md)
- 화면별 기능 목록: [프로젝트 총정리 §5](PROJECT_OVERVIEW.md#5-기능-카탈로그-화면별)
- 사용자 페르소나: [프로젝트 총정리 §1.4](PROJECT_OVERVIEW.md#14-사용자-페르소나-prd-v18) · [PRD v1.8](../product/PRD_swappy_v1.8.md)

---

## 3. 상세 구성도

### 3.1 백엔드 계층

라우터는 요청 검증과 응답만 맡고, 계산은 모두 `services/`에 있습니다. 같은 서비스를 화면 API와 챗봇 도구가 함께 씁니다. 챗봇(`chat`)은 `matching` · `skin` · `recommend`를 도구로 불러 답합니다.

```mermaid
flowchart LR
    subgraph API["api/ 라우터 87개"]
        direction LR
        a1["auth · me"]
        a2["products<br/>ingredients"]
        a3["recommendations"]
        a4["diagnosis<br/>skin_photo"]
        a5["personal/"]
        a6["chat · memory<br/>insights"]
        a7["skin_fit<br/>analysis"]
        a8["weather<br/>care_tip"]
    end

    subgraph SVC["services/ 계산 엔진"]
        direction LR
        s1["matching/<br/>유사도"]
        s2["skin/<br/>진단 · 궁합"]
        s3["recommend/<br/>추천 · 예산"]
        s4["chat/<br/>LLM · RAG"]
        s5["personal_ai/<br/>기억 · 취향"]
        s6["photo/<br/>사진 분석"]
        s7["scan/<br/>OCR"]
        s8["commerce/<br/>알림 · 주문"]
    end

    subgraph DATA["models/ SQLAlchemy"]
        direction LR
        m1["product<br/>recommendation"]
        m2["user<br/>personal"]
        m3["diagnosis<br/>skin_photo"]
    end

    API --> SVC --> DATA
```

- **라우터** `backend/app/api/` — API 목록은 Swagger `/api/docs` · [프로젝트 총정리 §6](PROJECT_OVERVIEW.md#6-백엔드-api) · [점수 로직 §2](../algorithms/ai-and-scoring-logic.md#2-기능-목록-백엔드-api-기준)
- **서비스** `backend/app/services/` — [점수 로직 총정리](../algorithms/ai-and-scoring-logic.md)
- **모델** `backend/app/models/` — [DB 스키마](db-schema.md) · 마이그레이션은 [백엔드 README](../../backend/README.md#alembic)

### 3.2 프론트엔드 화면

화면 라우트 46개를 영역별로 묶은 지도입니다. 하단 내비게이션은 홈 · 카테고리 · 검색 · 화장대 · 마이입니다.

```mermaid
flowchart TD
    ROOT["/ 스플래시"] --> ONB["/onboarding"]
    ONB --> LOGIN["/login · /signup"]
    ONB --> QNA["/qna → /result"]
    LOGIN & QNA --> HOME

    subgraph HOMEG["홈 · 탐색"]
        HOME["/home"]
        CAT["/category/:code"]
        SEARCH["/search"]
        SCAN["/scan"]
    end

    HOME & CAT & SEARCH & SCAN --> DETAIL["/detail/:id"]
    DETAIL --> ALT["/alternatives<br/>/compare"]
    DETAIL --> CART["/cart"] --> ORDER["/mypage/<br/>order-history"]
    DETAIL --> GIFT["/gift/:productId"]

    subgraph CLOSETG["화장대 · 기록"]
        CLOSET["/closet"] --> ANAL["/analysis/:id"]
        HIST["/history · /likes"]
    end
    CLOSET --> ALT

    subgraph MY["마이페이지"]
        MYP["/mypage"] --> AIME["/mypage/<br/>ai-me"]
        MYP --> SET["/mypage/<br/>settings/*"]
    end
```

- 화면 규격 · 컨벤션 · 목업 금지 규칙: [프론트 README §7-1](../../frontend/README.md#7-1-화면-규격-표준--2026-07-ui-통일에서-확정)
- 컴포넌트 카탈로그 · 디자인 토큰: [컴포넌트 가이드](../guides/frontend-component-guide.md) · [개발 가이드라인](../guides/dev_guidelines.md)
- 전체 라우트 정의: [`frontend/src/App.tsx`](../../frontend/src/App.tsx)

### 3.3 데이터 모델

테이블 38개를 도메인으로 묶으면 다음과 같습니다. 컬럼 · 인덱스 · 행수는 정본 문서에 있습니다.

**제품 · 성분 · 추천**

```mermaid
erDiagram
    BRANDS ||--o{ PRODUCTS : "만든다"
    CATEGORIES ||--o{ PRODUCTS : "분류"
    PRODUCTS ||--o{ SIMILARITIES : "대체품 후보"
    PRODUCTS ||--o{ PRODUCT_SKIN_FIT : "8타입 궁합"
    PRODUCTS ||--o{ PRODUCT_INGREDIENTS : "전성분"
    INGREDIENTS ||--o{ PRODUCT_INGREDIENTS : "포함"
    INGREDIENTS ||--o| INGREDIENT_FUNCTIONS : "기능 라벨"
```

**사용자 활동**

```mermaid
erDiagram
    USERS ||--o{ DIAGNOSES : "진단"
    USERS ||--o{ SKIN_ANALYSES : "사진 분석"
    USERS ||--o{ CLOSET_ITEMS : "화장대"
    USERS ||--o{ ORDERS : "주문"
    ORDERS ||--|{ ORDER_ITEMS : "품목"
    ORDER_ITEMS ||--o| REVIEWS : "후기"
    PRODUCTS ||--o{ CLOSET_ITEMS : ""
    PRODUCTS ||--o{ ORDER_ITEMS : ""
```

> 위 그림은 38개 중 대표 테이블만 고른 것입니다. 전체 관계도는 [DB 스키마 · 관계도](db-schema.md#관계도)에 있습니다.
