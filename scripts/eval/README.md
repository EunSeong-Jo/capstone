# AI 기능 평가 (`scripts/eval/`)

swappy의 AI 기능(유사도·궁합·진단·추천·OCR·챗봇·AI 기억)을 **제3자가 방법을 보고 납득할 수 있게** 평가하는 도구 모음이다.
얼굴 사진 AI 분석은 외부 모델(Perfect Corp)이라 제외했다.

- 지표·합격선: [`data/eval/PROTOCOL.md`](../../data/eval/PROTOCOL.md) (결과를 보기 전에 정해 커밋한 문서 — 바꾸면 변경 이력을 남긴다)
- 데이터 출처·한계: [`data/eval/DATASHEET.md`](../../data/eval/DATASHEET.md)
- 결과 리포트: `docs/evaluation/index.html` (브라우저로 연다)
- 결과 JSON: `data/eval/results/<날짜>/*.json` · 녹화: `data/eval/recordings/`

## 지켜야 할 규칙

1. **로컬 DB에서만 돌린다.** 호스트의 `.env` 는 운영(Neon)을 가리킨다. 모든 명령 앞에 로컬 주소를 환경변수로 준다.
   스크립트는 접속 호스트가 `localhost`/`postgres` 가 아니면 멈춘다.
   ```bash
   export DATABASE_DSN=postgresql://swappy:swappy_dev@localhost:5432/swappy
   ```
2. `.env` 를 `source` 하지 않는다(비밀번호가 출력된다). 키는 앱 설정(`app.config.settings`)이 알아서 읽는다.
3. **test 결과를 보고 합격선·파라미터·임계값을 바꾸지 않는다.** 바꿔야 한다면 `PROTOCOL.md` 변경 이력에 날짜와 이유를 적고, 바꾸기 전 결과도 같이 공개한다.
4. 평가 중 만든 임시 계정은 끝나면 지워진다(챗봇·기억).
5. 호출 비용이 드는 건 두 가지뿐이다: OCR(`ocr.py run`, CLOVA) · 챗봇(`chat.py record`, Claude). 채점(`score`)은 녹화·캐시만 읽는다.

## 사람이 채울 판정 파일 (6개)

판정은 **모델 판정을 보지 않은 채** 한다. 파일에는 모델 판정이 들어 있지 않다.
유사도의 `similarity_test_methods.csv`(어느 방식이 낸 후보인지)는 **판정이 끝나기 전에 열지 않는다.**

| # | 파일 | 채울 곳 | 건수 | 기준 |
|---|---|---|---|---|
| 1 | `data/eval/similarity_test_pool.csv` | `grade` | 702 | 0 대체 불가 · 1 부분 대체(핵심 기능 일부만 같음) · 2 대체 가능 |
| 2 | `data/eval/skin_fit_test_pool.csv` | 마지막 열 | 120 | 전성분 표기와 타입 프로필(5축 0~10)만 보고 **적합 / 보통 / 주의** |
| 3 | `data/seed/ingredient_functions/review_sample.csv` | `verdict` | 299 | AI가 붙인 성분 기능 라벨이 맞으면 `맞음`, 틀리면 `틀림`(고친 값은 `corrected_functions`) |
| 4 | `data/eval/diagnosis_personas.csv` | 행 추가 | 30 | 아래 설명 |
| 5 | `data/ocr_test/labels_test.csv` | `in_catalog`, `product_ids` | 37 | 사진을 보고 카탈로그에 있으면 `Y` + id(`|` 구분, 용량·기획 변종 모두), 없으면 `N` |
| 6 | `data/eval/chat_human_pool.csv` | `정확성_1to5`, `유용성_1to5` | 24 | 정확성=사실·함정에 속지 않았는가, 유용성=도움이 되는가 |

- **페르소나(4번)**: `python3 scripts/eval/diagnosis.py template` 이 문항을 보여 준다. 채점 가중치를 보기 **전에** "이런 사람"을 한 줄로 쓰고(`persona_text`),
  `expected_type`(8개 코드 중 하나: ondalsam mulgae subuji hwasan samak injeolmi yuriguseul memilmuk)과, 그 사람이 고를 선택지 번호를 `q1`~`q6` 에 적는다.
- **OCR 제품 id 찾기(5번)**: `python3 scripts/eval/ocr.py find "알로에"` 가 이름에 포함된 제품과 id를 보여 준다.
  `in_catalog` 를 비워 두면 채점에서 제외된다(빈칸을 "없음"으로 오해하지 않기 위해서다).
- **시간을 나눠서 한다.** 10%를 3일 이상 뒤에 다시 판정하면 자기 일관성(kappa)을 낼 수 있다.

## 연기 테스트 (판정을 채우기 전에 한 번)

`python3 scripts/eval/smoke_test.py` — 사람 판정이 채워진 뒤에 타는 채점 코드(test 지표·쌍체 비교·혼동행렬·임계값 적용·리포트)가 끝까지 도는지,
방향이 상식과 맞는지(완벽한 판정이면 일치도 1, 무작위 판정이면 기준선 수준, 95% 미만 채움이면 지표를 내지 않음)를 **가짜 판정**으로 확인한다.
진짜 판정 파일과 `data/eval/results/` 는 건드리지 않고(끝에서 그대로인지 확인) 임시 폴더에서만 돈다. 약 40초, 외부 호출 없음.
채점 코드를 고쳤다면 판정을 다시 채우기 전에 이것부터 돌린다.

## 실행 순서

```bash
export DATABASE_DSN=postgresql://swappy:swappy_dev@localhost:5432/swappy

# ── 처음 한 번 (이미 해 둠) ─────────────────────────────────────────────
python3 scripts/eval/test_stats.py          # 통계 함수 검증
python3 scripts/eval/similarity.py pool     # test 시드·판정 대기 파일 생성(고정 seed)
python3 scripts/eval/skin_fit.py pool       # 궁합 판정 대기 파일
python3 scripts/eval/skin_fit.py invariants # 궁합 불변식 전수 점검(자동)
python3 scripts/eval/diagnosis.py structure # 진단 응답 4,096가지 전수(자동)
python3 scripts/eval/budget.py --n 1000     # 예산·추천 불변식(자동, 백엔드가 떠 있어야 함)
python3 scripts/eval/ocr.py run             # 앞면 사진 OCR(CLOVA 호출, 이미 캐시됨)
python3 scripts/eval/chat.py record --repeat --memory   # 챗봇·기억 녹화(Claude 호출, 이미 녹화됨)

# ── 판정을 채운 뒤 ──────────────────────────────────────────────────────
python3 scripts/eval/similarity.py score
python3 scripts/eval/skin_fit.py score
python3 scripts/eval/diagnosis.py personas
python3 scripts/eval/ocr.py score
python3 scripts/eval/chat.py human-score
python3 scripts/eval/independence.py        # test 표본이 dev 와 겹치지 않는지(id 교집합)
python3 scripts/eval/build_report.py        # → docs/evaluation/index.html
```

`score` 계열은 판정이 95% 미만으로 채워져 있으면 지표를 내지 않고 "대기"로 표시한다(덜 채운 상태로 숫자를 만들지 않기 위해서다).

## 파일 구성

| 파일 | 역할 |
|---|---|
| `common.py` | 로컬 DB 접속(운영·Neon 거부), 경로, `env.json` 정보(코드 커밋·데이터 해시·DB 건수) |
| `stats.py` | Wilson·부트스트랩·쌍체 부트스트랩·kappa·nDCG·AUROC (표준 라이브러리만) |
| `test_stats.py` | `stats.py` 를 손계산 가능한 값으로 검증 |
| `similarity.py` | A. 유사도 — test 시드 추출, 방식별 지표, 기준선 비교 |
| `skin_fit.py` | B. 궁합 — 불변식 전수, 사람 판정 일치 |
| `diagnosis.py` | C. 진단 — 구조(전수)·페르소나 |
| `budget.py` | D. 추천·예산 — 실제 API 호출로 불변식·품질·지연 |
| `ocr.py` | E. OCR — 서비스 경로(`recognize_text` → `match_text`)로 앞면 사진 |
| `chat_cases.py`, `chat.py` | F. 챗봇·AI 기억 — 질문 80개·기억 40문장, 녹화와 채점 |
| `build_report.py` | 결과 JSON → 정적 HTML 리포트 |

## 알려진 한계

[`DATASHEET.md`](../../data/eval/DATASHEET.md) 와 리포트 맨 아래 "이 평가가 보여주지 않는 것" 을 본다.
요약: 판정자 1명, 챗봇은 Claude(Haiku)만, 진단 정확도는 평가하지 않음, 예산·홈 추천의 품질 지표는 서비스가 최적화하는 점수로 잰 것이라 독립 증거가 아님.
