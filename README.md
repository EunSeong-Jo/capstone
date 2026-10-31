# swappy 🌿

> AI 기반 프로필 맞춤 제품 추천 및 성분 유사도 대체품 매칭 서비스

피부타입 진단(QnA 또는 얼굴 사진)으로 8가지 캐릭터 중 하나를 부여하고, 그 프로필에 맞는 화장품을 추천합니다.
제품 상세에서는 **전성분만 보고** 성분이 비슷한 더 저렴한 대체품을 찾아 주고, 예산을 입력하면 토너·에센스·크림·선크림 루틴 조합을 제안합니다.
챗봇은 내 피부·화장대·취향을 알고, 우리 계산 엔진을 도구로 불러 답합니다.

> 이 문서는 2026-10-31 `main` 기준입니다. 숫자(가중치·임계값)는 코드에서 읽은 값이며 출처 파일을 함께 적었습니다.
> 더 깊은 설명은 [docs/ai-and-scoring-logic.md](docs/ai-and-scoring-logic.md)(점수 로직 총정리), [docs/similarity.md](docs/similarity.md)(유사도 평가), [docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md)(프로젝트 총정리)를 보세요.

---

## 목차

1. [기술 스택](#기술-스택)
2. [빠른 시작](#빠른-시작)
3. [사용한 AI · 외부 모델](#사용한-ai--외부-모델)
4. [핵심 기능과 알고리즘](#핵심-기능과-알고리즘)
   - [성분 유사도 · 대체품 추천](#1-성분-유사도--대체품-추천)
   - [피부 궁합](#2-피부-궁합)
   - [피부타입 진단](#3-피부타입-진단-qna--사진)
   - [얼굴 사진 AI 분석](#4-얼굴-사진-ai-분석)
   - [홈 추천 · 예산 구매 가이드](#5-홈-추천--예산-구매-가이드)
   - [챗봇 (RAG + 도구 호출)](#6-챗봇-rag--도구-호출)
   - [퍼스널 AI](#7-퍼스널-ai-기억--취향--리포트--브리핑)
   - [사진으로 제품 찾기 (OCR)](#8-사진으로-제품-찾기-ocr)
5. [데이터](#데이터)
6. [프로젝트 구조](#프로젝트-구조)
7. [한계와 주의](#한계와-주의)
8. [피부타입 캐릭터](#피부타입-캐릭터-8종)
9. [문서](#문서) · [팀](#팀)

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| **Frontend** | React 18 + TypeScript + Vite + Tailwind CSS, **Capacitor**(Android 앱), MediaPipe Tasks Vision(촬영 전 얼굴 확인) |
| **Backend** | Python 3.11 + FastAPI (비동기), SQLAlchemy 2.0 + Alembic, structlog, Sentry |
| **Database** | PostgreSQL 16 (팀 공용 **Neon**, `pg_trgm`) + Redis 7(캐시·일일 한도) |
| **수치 계산** | numpy + scipy 희소행렬 (TF-IDF 코사인을 직접 구현. scikit-learn은 쓰지 않음) |
| **LLM** | OpenAI `gpt-4o-mini` → 실패 시 Anthropic `claude-haiku-5-5` (선택: 로컬 Ollama) |
| **외부 API** | 네이버 CLOVA OCR, Perfect Corp YouCam(피부 분석), OpenWeather |
| **이미지 처리** | Pillow(EXIF 제거), OpenCV YuNet(얼굴 검출), MediaPipe(가림 검사) |
| **인프라** | Docker Compose(로컬), AWS(운영 DB 이전 절차: [docs/aws-db-migration.md](docs/aws-db-migration.md)) |

---

## 빠른 시작

```bash
git clone https://github.com/EunSeong-Jo/capstone.git
cd capstone

cp .env.example .env
#  .env의 DATABASE_DSN에 Neon 연결 문자열을 붙여넣습니다. (필수 · Neon 조직 dmu 초대 필요)
#  선택: OPENAI_API_KEY / ANTHROPIC_API_KEY(챗봇), CLOVA_OCR_*(사진으로 찾기), PERFECT_CORP_*(피부 분석)

docker compose up --build
```

| 서비스 | URL |
|--------|-----|
| 프론트엔드 | http://localhost:3000 |
| 백엔드 API | http://localhost:8000/health |
| Swagger 문서 | http://localhost:8000/api/docs |

- 뜨는 컨테이너는 `backend`·`frontend` 둘뿐입니다(DB가 Neon이라 로컬 postgres·redis는 기본 기동에서 빠져 있음).
- **외부 키가 없어도 서버는 뜹니다.** LLM 키가 없으면 챗봇은 규칙 폴백으로, OCR 키가 없으면 503으로 제품명 검색을 안내합니다.

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
python scripts/seed_ingredients.py && python scripts/load_products.py
```

</details>

팀 개발 규칙(브랜치·PR·마이그레이션 주의)은 [CLAUDE.md](CLAUDE.md), 프론트 규격은 [frontend/README.md](frontend/README.md), 백엔드 세팅은 [backend/README.md](backend/README.md)를 보세요.

---

## 사용한 AI · 외부 모델

| 영역 | 기술 | 역할 | 코드 |
|---|---|---|---|
| 챗봇 | OpenAI `gpt-4o-mini` → Claude `claude-haiku-5-5` | RAG + **도구 호출** 상담 | `services/llm.py`, `api/chat.py`, `services/chat_tools.py` |
| 챗봇 폴백 | **모델 없음**(규칙 + DB 템플릿) | LLM이 전부 실패해도 DB 사실로만 답함 | `services/chat_fallback.py` |
| 오늘의 케어 문구 | 위와 같은 LLM 체인 | 피부타입 + 날씨 → 한 줄 문구 | `api/care_tip.py` |
| AI 기억 추출 | 위와 같은 LLM 체인 | 대화에서 사용자가 말한 선호·기피를 한 줄씩 저장 | `services/memory.py` |
| 사진으로 제품 찾기 | 네이버 **CLOVA OCR** + PostgreSQL `pg_trgm` | 제품 앞면 사진 → 글자 → 제품명 대조 | `services/ocr.py`, `api/products.py` |
| 얼굴 피부 분석 | **Perfect Corp YouCam AI Skin Analysis** | 얼굴 사진 → 항목별 피부 점수 | `services/skin_photo.py` |
| 얼굴 사진 사전 검증 | OpenCV **YuNet** + MediaPipe **selfie_multiclass** | 부적합 사진을 외부로 보내기 전에 거름 | `services/face_gate.py`, `occlusion.py` |
| 성분 기능 분류 | **Claude가 직접 읽고 판정**(데이터) | 성분 1,683종에 기능·역할·플래그 라벨 | `data/seed/ingredient_functions/` |
| 대체품 정답 판정 | **Claude 1명이 판정**(0/1/2) | 유사도 평가셋 + 점수 보정치 | `data/eval/`, `data/seed/similarity_curated.csv` |
| 날씨 | OpenWeather | 챗봇·케어 문구·브리핑 입력 | `api/weather.py` |
| 이미지 유사도 | DINOv2 / CLIP(ONNX) | **실험만, 운영 미채택** | `scripts/embed_product_images.py` |

> **대체품·피부 궁합·홈 추천·예산 가이드·취향 모델은 ML 모델이 아니라 규칙·통계식**입니다(TF-IDF 코사인, 가중합, 지수 포화). 모델 학습은 하지 않았고, 모든 점수는 **왜 그 점수인지 성분 이름으로 설명**할 수 있게 설계했습니다.

---

## 핵심 기능과 알고리즘

### 1. 성분 유사도 · 대체품 추천

`backend/app/services/similarity.py` · 배치 `scripts/compute_similarities.py` · 조회 `GET /api/v1/products/{id}/similar`

전성분(제품당 평균 약 40개)만 보고 비슷한 제품을 찾습니다. 리뷰·판매량·브랜드는 쓰지 않습니다. 비교는 **같은 카테고리 안에서만**, IDF도 카테고리 안에서 계산합니다.

**왜 IDF인가.** 글리세린 85%, 정제수 84%, 1,2-헥산다이올 81% 등 상위 6종이 거의 모든 제품에 들어 있어 단순 교집합은 무의미합니다. IDF로 가중하면 판테놀·나이아신아마이드처럼 제품을 가르는 성분이 점수를 결정합니다.

```
IDF(성분)   = log(N / df)                       # 모든 제품에 있으면 0
벡터        = IDF 가중, L2 정규화, TF는 이진      # 코사인 = 내적
```

**기본 방식 `hybrid`**:

```
점수 = 0.65 × 역할 가중 TF-IDF 코사인
     + 0.35 × 기능 프로필 코사인
     + 0.20 × 제형 일치                  (가중치 합으로 정규화)
     + 판정 보정   (AI 판정 0점 −0.15 / 2점 +0.10)
```

| 항 | 내용 |
|---|---|
| **역할 가중 TF-IDF** | 성분 역할별로 IDF에 곱함: 활성 1.0 · 에몰리언트 0.6 · 기타 0.35 · 계면활성/점증 0.25 · 용매/방부 0.2 · 오염 이름 0 · 라벨 없음 0.6 |
| **기능 프로필** | 제품이 보습·장벽·진정·미백·주름·항산화·피지·각질·자외선 중 무엇을 얼마나 가졌는지의 분포(+ 역할 3, 무기/유기 자차 2 = 14차원). **앞 성분일수록 크게**(15번째 성분에서 0.5), 확신도 1은 제외, 제곱근으로 눌러 한 기능이 지배하지 않게 함 |
| **제형 일치** | 이름에서 스틱·쿠션·패드·시트·오일·폼·워터·세럼 등을 뽑아 일치 여부를 가산. 스틱↔크림 같은 불일치가 가장 흔한 오답 원인이었음 |
| **변형 접기** | 용량·매수만 다른 제품은 후보 하나로 접고, 같은 옵션 그룹은 서로의 후보에서 제외 |
| **근거 표시** | 공통 성분을 **IDF 큰 순**으로 5개 보여 줌(정제수·글리세린을 근거로 내세우지 않음) |

**평가**(`scripts/eval_similarity.py`, 시드 80개 × 후보 843건, 정답은 AI 1명이 0/1/2로 판정):

| 방식 | nDCG@10 | 정밀도@5 | 결정 |
|---|---|---|---|
| tfidf | 0.635 | 0.330 | 기준선·미적재 시 대체 |
| hybrid v1 | 0.678 | 0.343 | |
| **+ 제형 일치 0.20** | **0.799** | **0.468** | **현재 기본값** |
| + 성분 임베딩(e5-small) | 0.800 | 0.468 | 효과 없어 **제거** |
| jaccard / rbo | 0.603 / 0.344 | 0.273 / 0.153 | **제거** |

> ⚠️ 정답 판정자가 AI라 독립 검증은 아닙니다([한계와 주의](#한계와-주의)).

### 2. 피부 궁합

`services/skin_fit.py` · 사전 계산 `scripts/compute_skin_fit.py` → `product_skin_fit`(제품 × 8타입)

피부타입 규칙의 **정본**입니다. 목록 필터·정렬, 홈 추천, 예산 가이드, 궁합 카드, 전성분 칩이 모두 같은 값을 읽습니다.

```
성분 기여   = 타입별 선호 기능 가중 × 위치감쇠         (활성·에몰리언트, 확신도 ≥ 2만)
위치감쇠    = 1 / (1 + (표기순서 − 1) / 15)
선호 점수   = 1 − exp( −Σ기여 / (REF[타입] × 1.9) )     # 0~1로 포화
감점        = Σ 플래그별 AVOID[타입][플래그] × min(1, BASE + 0.25×(개수−1))
점수        = clip( 100 × (0.30 + 0.70 × 선호 점수) − 감점, 0, 100 )
```

- 성분 라벨: 기능 9종(보습·장벽·진정·미백·주름탄력·항산화·피지모공·각질·자외선) · 역할 · 플래그(**F** 향료 / **L** 건조 알코올 / **I** 자극) · 확신도 1~3
- 타입별 선호 기능과 기피 감점이 다릅니다(예: 사막은 보습·장벽 1.0, 알코올 감점 최대 18 / 유리구슬은 향료 감점 최대 22)
- `REF`(타입별 기준 규모)는 카탈로그 제품의 선호 합 **중앙값**으로 보정 → 중앙값 제품이 약 59점(무난)
- **판정**: `good` 66점 이상 · `caution` 단일 감점 12 이상 / 합 18 이상 / 28점 미만 · `ok` 그 외 · **`unknown`**(근거 성분 3종 미만 — "모르는 것을 '보통'으로 보여주지 않는다")
- **하드 제외**: 향료 → 화산·유리구슬 / 건조 알코올 → 수부지·사막·유리구슬. 그 밖의 의심은 목록에서 빼지 않고 카드에서 '주의'로만 알림
- **내 제품 성분 분석**(`services/product_analysis.py`): 기능 강도 `100 × (1 − exp(−Σ위치가중 / 2.0))`, 50 이상 '강함'·40 미만 '비어 있음'

### 3. 피부타입 진단 (QnA + 사진)

`services/diagnosis.py` (프론트 `src/data/skinTypeScoring.ts`와 같은 로직을 의도적으로 이중 구현 — 비회원이 오프라인에서도 진단을 끝내도록)

1. 5축(수분·유분·민감·색소·트러블)이 **5에서 시작**, 6개 문항의 선택지마다 축별 증감(DB `quiz_options.weights`)을 더해 0~10으로 자름. 미응답은 더하지 않음
2. 내 5축과 8타입 프로필의 **유클리드 거리 d** → 근사도 `1 / (1 + d)`
3. 상위 **3개**만 합이 1이 되게 정규화 → 화면의 "92%"
4. 1·2순위 차가 **0.03 이하**면 `borderline` — "OO에 가깝지만 XX 성향도 있어요"

사진 진단과의 혼합: 문항 전부 + 사진 → `0.6×QnA + 0.4×사진` / 일부 문항 + 사진 → 답한 문항이 건드린 축만 0.5 혼합 / 사진만 → 사진 5축 그대로.

### 4. 얼굴 사진 AI 분석

`services/skin_photo.py`, `face_gate.py`, `occlusion.py`, `skin_quota.py`

```
앱(MediaPipe 얼굴 확인)
 → 서버 사전 검증: YuNet 얼굴 검출 → 규칙 판정(폭 ≥ 60%·기울기 15°·밝기 50~200·초점) → MediaPipe 가림 검사(손·마스크)
 → EXIF(GPS 포함) 제거한 JPEG 재생성, 긴 변 2560px
 → Perfect Corp: 등록 → 업로드 → 작업 생성 → 폴링(최대 60초)
 → 항목별 점수 → 진단 5축으로 변환 → (QnA와 혼합) → 8타입 순위
```

- 사진→5축: Perfect Corp 점수는 높을수록 건강하므로 문제 축은 `(100 − raw) / 10`으로 뒤집음. 업체의 Normal/Oily/Dry/Combination/Redness 분류는 축 ±1로 반영
- **무료(동의) 월 1회·8항목 / 구독 월 4회·16항목.** 성공한 분석만 DB 행 수로 세어 Redis 장애에도 한도가 풀리지 않음. 사전 검증 실패는 한도를 쓰지 않음
- 개인정보: 동의 필수(버전 기록), EXIF 제거, 원본 사진 비보관

### 5. 홈 추천 · 예산 구매 가이드

`services/product_score.py`(홈·예산 가이드 공유) · `services/budget_guide.py`

```
제품 점수 = 0.4 × 피부 궁합(점수/100, 판정불가는 0.5)
          + 0.3 × 별점/5
          + 0.2 × min( log10(리뷰수+1) / log10(100,000), 1 )
          + 0.1 × 브랜드 다양성        # 같은 브랜드가 n번째면 (1 − 0.35n) 배
```

- 후보는 **성분 분석이 끝난 제품만**(hybrid 유사도 보유) + 단일 제품 + 가격 있음 + 타입별 하드 제외 반영
- **예산 가이드**: 단계(토너·에센스·크림·선크림)별 상위 20개 후보 + 단계별 최저가 10개 → 합계가 예산 이하인 조합을 **전부 탐색**(가격순 + 가지치기) → 조합 점수 = 제품 점수 평균 → [최저 조합 합계, 예산]을 3구간(알뜰·균형·여유)으로 나눠 구간별 최고 조합. 앞 안과 겹치는 제품 하나당 −0.03. 4단계를 못 사면 뒤쪽 단계부터 빼서 가능한 만큼 제안

### 6. 챗봇 (RAG + 도구 호출)

`api/chat.py`, `services/rag.py`, `services/chat_tools.py`, `services/chat_fallback.py`

- **RAG**: 질문 토큰으로 제품명·브랜드·성분명을 부분 일치 검색하고 피부타입 하드 제외를 적용해 모델에 DB 사실로 넘김. 제품 사실(이름·가격·성분·평점)은 **제공된 데이터만** 말하게 하는 시스템 프롬프트
- **도구 호출**(최대 4라운드): 모델이 우리 계산 엔진을 불러 씀 — `find_products` · `find_alternatives` · `analyze_product` · `check_skin_fit` · `build_routine` · `recommend_for_me` · `get_skin_report` · `get_today_briefing` · `propose_add_to_cart` · `propose_add_to_closet`
  - **사실은 도구 결과에서만** 나옴(제품·가격·점수·유사도는 기존 서비스가 계산하고 모델은 문장으로 옮김)
  - **읽기만 실행**. 담기는 `propose_*`가 *제안*만 하고, 실제 담기는 사용자가 [담기] 버튼을 눌러야 일어남
  - 도구 인자는 모델이 만든 값이라 믿지 않음(범위 자르기, 제품 id 존재 확인)
- **폴백**: LLM 체인이 전부 실패하면 질문 유형(추천/대체/성분)을 키워드로 분류해 DB(성분 설명·기능 라벨·유사도·궁합)를 정해진 문장에 채움. 환각 없음, 응답에 `mode: "fallback"`
- 비회원은 IP당 일일 3회 한도, 초과 시 로그인 유도
- **오늘의 케어 문구**: 피부타입 + 날씨 → 한 문장(`max_tokens=70`, 34자 초과 시 서버가 자름), `피부타입×날짜`로 25시간 캐시

### 7. 퍼스널 AI (기억 · 취향 · 리포트 · 브리핑)

"쓸수록 나를 아는" 기능들입니다. 공통 원칙: **사실은 계산에서 오고, 모르면 모른다고 말하며, 원인을 단정하지 않습니다.**

| 기능 | 파일 | 동작 |
|---|---|---|
| **개인 컨텍스트** | `personal_context.py` | 피부타입·최근 사진 분석의 약한 항목·예산·화장대·마이 성분을 약 600토큰 요약으로 챗봇 프롬프트에 넣음. 이메일·얼굴 사진·원본 점수는 보내지 않음 |
| **AI 기억** | `memory.py` | 동의한 사용자에게만. 대화에서 **사용자가 직접 한 말**만 한 줄(80자 이하, 최대 20개)로 저장(추정·진단·연락처·URL·프롬프트 지시문은 걸러 냄). "○○ 기억해"는 규칙으로도 저장. 마이페이지에서 보고 고치고 지울 수 있음. 추출 실패는 챗봇 응답에 영향 없음 |
| **내 성분 취향** | `preference.py` | 좋아한 제품(후기 4~5점 +0.6~1.0·재구매 +0.8·찜 +0.4·화장대 +0.3)의 성분에 +, 별로였던 제품(후기 1~2점)에 −를 쌓은 성분 벡터(IDF×역할 가중, 유사도와 같은 척도). 신호가 서로 다른 제품 3개 미만이면 **켜지 않음**(콜드 스타트). 홈 추천에 **0.2만** 섞고 하드 제외는 못 뚫음. "내가 좋아한 ○○ 성분이 들어 있어요"로 설명 |
| **피부 변화 리포트** | `skin_report.py` | 두 사진 분석을 견줘 항목별 좋아짐/나빠짐/비슷함(±3점 미만은 비슷함). 그 기간에 화장대에 더한 제품과 그 항목을 돕는 성분을 **나란히 보여 줄 뿐** "그래서 좋아졌다"고 하지 않음 |
| **오늘의 브리핑** | `briefing.py` | 오늘 날씨(건조·추위·더위·습함 등) × 약한 피부 항목 → "오늘 필요한 기능"을 정하고 **내 화장대에서 그 기능이 가장 강한 제품**을 추천. 문장은 규칙이라 LLM 없이도 동일, 필요한 제품이 없으면 없다고 말함 |

### 8. 사진으로 제품 찾기 (OCR)

`services/ocr.py`, `POST /api/v1/products/scan`

```
사진 → CLOVA OCR(통짜 텍스트) → pg_trgm 유사도(한글명·영문명) ≥ 0.15
     → 용량·기획 변형을 한 후보로 접기 → 상위 3개 + "찾는 제품이 없어요"
```

- **자동 선택하지 않습니다.** 카탈로그에 없는 제품을 텍스트·이미지 어느 신호로도 거절하지 못해 사용자 확인이 필수입니다.
- 실사진 측정(카탈로그에 있는 6개): 텍스트 top-1 **6/6**, 이미지(DINOv2) 1/6 → 이미지 임베딩은 채택하지 않음. 앞면 촬영 전제(뒷면은 정답 1위 0건)
- 엔진 선정: Tesseract·EasyOCR·PaddleOCR·Surya·Claude Vision 등을 36장으로 벤치마크해 CLOVA 선택 ([scripts/OCR_SUMMARY.md](scripts/OCR_SUMMARY.md))
- 호출 한도: 계정당 3회/일, 전체 15회/일, 카운터 장애 시 막는 쪽(fail-closed)

**그 밖의 규칙**: 경험치(스캔 10·후기 20·선물 20·주문 50, 레벨 N→N+1에 N×100) · 포인트(주문액 1%·후기 100P) · 알림은 저장하지 않고 주문·포인트·후기·선물·진단 기록에서 만들어 냄(재진단 권유는 90일 경과).

---

## 데이터

| 항목 | 값 |
|---|---:|
| 제품 | 4,013 (스킨케어·마스크팩·클렌징·선케어, 얼굴용 4종만) |
| 성분 | 23,147 |
| 제품–성분 연결 | 163,103 |
| 성분 설명 | 3,687 |
| 성분 기능 라벨 | 1,683종 (제품 출현 기준 94.4% 커버) |
| 유사도 | 146,940행 |

```
올리브영 크롤러(crawling/*.js, Playwright) → v5 정제 CSV → scripts/load_products.py (멱등)
대한화장품협회 성분 PDF → 성분 사전(21,910) → scripts/seed_ingredients.py
이후 배치: compute_similarities.py → similarities / compute_skin_fit.py → product_skin_fit
```

스키마 정본은 [docs/db-schema.md](docs/db-schema.md), 변경은 **Alembic 마이그레이션으로만** 합니다(공용 DB 주의사항은 [CLAUDE.md](CLAUDE.md)).

---

## 프로젝트 구조

```
capstone/
├── backend/
│   ├── app/
│   │   ├── api/            # 라우터 (products, recommendations, chat, me, skin_photo, memory, ...)
│   │   ├── services/       # similarity, skin_fit, diagnosis, budget_guide, chat_tools, memory, preference, ...
│   │   ├── models/         # SQLAlchemy 모델 (product, user, personal, diagnosis, skin_photo, recommendation)
│   │   ├── schemas/        # Pydantic 입출력
│   │   ├── data_collection/# 식약처 API + 초기 크롤러
│   │   └── utils/          # 전성분 파싱·정규화
│   ├── alembic/versions/   # 마이그레이션 (스키마 원본)
│   └── tests/              # pytest
├── frontend/               # React + Capacitor → frontend/README.md
│   └── src/ pages · components · hooks · api · utils · data
├── crawling/               # 올리브영 JS 크롤러
├── data/                   # raw(수집 CSV) · seed(성분사전·기능 라벨) · eval(유사도 평가셋)
├── scripts/                # 적재·배치·평가·OCR 벤치마크
├── docs/                   # 스키마·PRD·유사도·점수 로직·프로젝트 총정리
└── docker-compose.yml
```

---

## 한계와 주의

솔직하게 적어 둡니다.

- **정답과 라벨이 AI 단독 판정입니다.** 성분 기능 라벨 1,683종, 유사도 평가셋, 보정치 1,443쌍은 모두 Claude 1명의 판정이고, nDCG 0.799도 같은 판정으로 잰 값이라 독립 검증이 아닙니다. 사람(전문가) 표본 검수는 아직 없습니다.
- **피부 궁합은 의학적 판단이 아닙니다.** 같은 피부타입 안에서 제품을 견주는 용도이고, 타입별 선호·기피 가중치는 임상 근거 없이 설계한 값입니다(`REF`만 카탈로그로 보정).
- **8타입 프로필과 퀴즈 가중치는 설계값**입니다. 모든 타입이 "나올 수 있음"만 검증했고, "맞게 나옴"은 실사용 데이터로 검증하지 못했습니다.
- **사진 혼합 비중(0.4/0.5)과 가림 검사 기준은 임시값**입니다. 가림 기준은 합성 사진으로 잡았고 실제 손·마스크 사진으로는 조정하지 않았습니다.
- **이미지 유사도는 채택하지 않았습니다.** 합성 평가 92.3%는 상한이고 실사진은 1/6이었습니다(카탈로그 이미지 약 90%가 판촉 배너).
- 구독·결제·주문은 시연용 흉내이며 실결제가 아닙니다.
- 제품 데이터는 올리브영에서 수집한 것이라 공개 배포 시 출처 표기와 약관을 확인해야 합니다.
- 얼굴 사진은 분석을 위해 외부 업체(Perfect Corp)로 전송됩니다. 동의 흐름은 구현돼 있지만 개인정보 처리방침 문구가 이를 정확히 담는지는 별도 점검이 필요합니다.

---

## 피부타입 캐릭터 (8종)

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

---

## 문서

| 문서 | 내용 |
|---|---|
| [docs/ai-and-scoring-logic.md](docs/ai-and-scoring-logic.md) | AI·점수 로직 총정리(가중치·임계값 전체) |
| [docs/similarity.md](docs/similarity.md) | 성분 유사도 엔진과 평가 |
| [docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md) | 프로젝트 총정리(사용 항목 · 고민과 결정 기록) |
| [docs/db-schema.md](docs/db-schema.md) | DB 스키마 정본 |
| [docs/PRD_swappy_v1.8.md](docs/PRD_swappy_v1.8.md) | 제품 요구사항 |
| [docs/aws-db-migration.md](docs/aws-db-migration.md) | 운영 DB 이전 절차 |
| [backend/README.md](backend/README.md) · [frontend/README.md](frontend/README.md) | 영역별 개발 가이드 |

## 팀

| 이름 | 역할 |
|------|------|
| EunSeong-Jo | 팀장 / 기획 / AI·ML |
