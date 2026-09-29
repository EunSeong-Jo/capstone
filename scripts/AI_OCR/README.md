# AI Vision OCR 벤치마크 (Claude / GPT-4o)

기존 OCR 3종(Tesseract/EasyOCR/PaddleOCR, `../ocr_benchmark`)이 느리고 정확도가 낮았던 문제를
Claude(및 선택적으로 GPT-4o) Vision API로 대체했을 때의 **정확도와 처리 시간**을 확인하기 위한
독립 실험 스크립트입니다. `../ocr_benchmark`와 같은 이미지·정답 라벨(`labels.csv`)을 그대로
재사용하므로 기존 OCR 결과와 직접 비교할 수 있습니다.

## 1. API 키 준비

**API 키는 이 채팅창에 붙여넣지 말고**, 아래 중 한 가지 방법으로 환경변수로만 등록해주세요.

- `scripts/AI_OCR/.env` 파일 생성 (저장소 전체에서 `.env`는 이미 `.gitignore`에 포함되어 있어
  실수로 커밋되지 않습니다):
  ```
  ANTHROPIC_API_KEY=sk-ant-...
  OPENAI_API_KEY=sk-...   # GPT-4o도 같이 비교하고 싶을 때만
  ```
- 또는 셸에서 직접 export:
  ```bash
  export ANTHROPIC_API_KEY=sk-ant-...
  ```

Claude만 테스트할 거면 `ANTHROPIC_API_KEY`만 있으면 됩니다. GPT-4o와도 비교하려면
`OPENAI_API_KEY`를 추가로 등록하고 `--engines claude,openai`로 실행하세요.

## 2. Python 환경

```bash
python -m venv venv && source venv/bin/activate   # 또는 기존 conda 환경 재사용
pip install -r scripts/AI_OCR/requirements.txt
```

## 3. 실행

```bash
cd scripts/AI_OCR
python run_benchmark.py                                   # Claude만, 전체 이미지
python run_benchmark.py --limit 5                          # 빠른 확인용 5장만
python run_benchmark.py --engines claude,openai             # GPT-4o도 같이 비교
python run_benchmark.py --claude-model claude-sonnet-5       # 더 빠른/저렴한 모델로 속도 비교
```

기본적으로 `../ocr_benchmark/images`와 `../ocr_benchmark/labels.csv`를 그대로 사용합니다
(이미 라벨링된 화장품 패키지 사진 50여 장). 다른 이미지 세트를 쓰려면 `--images-dir`,
`--labels-csv`로 경로를 바꿀 수 있습니다.

## 4. 결과 확인

- `output/summary.md`, `output/summary.csv` — 엔진별 평균 CER/식별점수/평균·p95 레이턴시
  (지표 정의는 `../ocr_benchmark/README.md` 참고 — 동일한 기준 사용)
- `output/comparison_chart.png` — CER / 식별점수 / 레이턴시 비교 막대그래프
- `output/results_raw.csv` — 이미지 × 엔진 단위 상세 결과
- `output/samples/*.png` — **어떻게 텍스트를 추출했는지 보여주는 예시**: 원본 사진과 AI가 실제로
  뽑아낸 텍스트, 정답, CER/식별점수를 나란히 보여주는 이미지 (기본 5장, `--samples`로 조절)

## 참고

- Claude 호출 시 `thinking`을 꺼서 지연시간을 최소화합니다 — 텍스트 추출은 추론이 필요 없는
  작업이고, 이 벤치마크의 목적 자체가 속도 비교이기 때문입니다.
- 기본 모델은 `claude-opus-5`입니다. 속도/비용까지 비교하고 싶으면 `--claude-model
  claude-sonnet-5` 또는 `claude-haiku-4-5`로 여러 번 실행해 `output-dir`을 다르게 지정하세요:
  ```bash
  python run_benchmark.py --claude-model claude-opus-5 --output-dir output_opus5
  python run_benchmark.py --claude-model claude-sonnet-5 --output-dir output_sonnet5
  ```
- `backend/app`의 프로덕션 코드와는 분리되어 있습니다.
