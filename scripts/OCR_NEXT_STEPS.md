# OCR 개선 작업 — 다음에 할 일 (2026-09-13 기준)

## 지금까지 결론

**CLOVA OCR + region-detection이 현재 1위.** 같은 36장 기준:

| 엔진 | mean_cer | identification_score | full_score% | 레이턴시 |
|---|---|---|---|---|
| paddleocr + cubic | 0.615 | 1.111 | 36.1 | 62.7s |
| paddleocr + FSRCNN | 0.611 | 1.111 | 36.1 | 62.3s |
| CLOVA (단독) | 0.671 | 1.361 | 44.4 | 4.0s |
| **CLOVA + region-detection** | **0.642** | **1.611** | **52.8** | 6.0s |

자세한 내용: `CLOVA_OCR/RESULTS.md`

## 다음 후보 (미시도, 보류)

- **Qwen2.5-VL** — 오픈 가중치 VLM, OCRBench SOTA. 계정 불필요하나 로컬 GPU 구동 시
  Surya·PaddleOCR-VL처럼 무거운 서빙 스택 문제가 재발할 수 있음. 이 환경은 GPU
  추론(paddle에 CUDA 빌드 없음)이 안 되는 것으로 보이므로, 동일하게 CPU로 떨어지면
  승산 없음 — 먼저 GPU 추론 가능 여부 확인 후 진행할 것. **현재는 보류.**

## 결론 — OCR 엔진 탐색은 여기서 종료

**CLOVA + region-detection으로 확정.** 더 나은 후보가 없는 게 아니라(Qwen2.5-VL 등
미시도 후보 있음), 지금까지 나온 `identification_score`가 전부 대리 지표라 엔진을
더 바꿔봐야 실익이 불확실함 — 다음 단계는 엔진 교체가 아니라 Task 4.4(추출된 텍스트를
실제 PostgreSQL 제품 DB에 매칭)로 넘어가서 진짜 매칭률을 봐야 함.

- **Upstage OCR** (2026-09-13) — 가입/API 문서 확인 마찰이 커서 포기. 처음 받아온 curl
  예시가 Document OCR이 아니라 `chat/completions`(Solar LLM 채팅) 엔드포인트였음 —
  콘솔에서 올바른 엔드포인트를 못 찾음. 이 과정에서 실제 API 키가 대화창에 노출돼
  즉시 폐기 권고함. 재시도 시 콘솔의 "Document AI/OCR" 문서를 먼저 정확히 확인할 것.

## 포기한 것

- **Surya** — 이 Windows(GTX 1060) 환경에서 vllm 백엔드 자동선택 → Windows 미지원으로
  멈춤 → llama.cpp 백엔드로 수동 전환해도 모델 로딩이 18분 넘게 안 끝나 중단.
  자세한 경위: `Surya_OCR/RESULTS.md` (관련 대용량 파일은 전부 삭제함, 재시도 시 재다운로드 필요)
- **FSRCNN 초해상도 업스케일** — cubic 대비 유의미한 차이 없음(통제 실험으로 확인).
  이 레버는 더 이상 안 파도 됨.
- **Claude Vision** (2026-09-13) — `AI_OCR/.env`의 `ANTHROPIC_API_KEY`가 없음/무효.
  `--limit 1`로 테스트하면 `mean_cer 1.0`, `zero_score_rate 100%`로 완전히 빈 응답.
  유효한 키가 생기면 `cd scripts/AI_OCR && python run_benchmark.py --engines claude`로
  재시도만 하면 됨(코드는 이미 준비됨, 모델명 `claude-opus-5`도 최신).
- **PaddleOCR-VL-1.6** (2026-09-13) — `paddleocr` 3.7.0에 내장된 `PaddleOCRVL` 클래스로
  시도. `pip install "paddlex[ocr]"` 추가 설치 후 정상 동작은 했으나(모델 가중치
  ~1.7GB, `C:\Users\shimu\.paddlex\official_models\`에 캐시됨), **이미지 1장 예측에
  615초(10분+)** 소요 — CLOVA(6초/장) 대비 100배 느림. 이 머신에 paddle GPU 빌드가 없어
  CPU로만 추론(`paddle.device.get_device()` → `cpu`, `cuda.device_count()` → `0`)되기
  때문. 36장 벤치마크 시 6시간+ 걸려 비현실적 — 정확도 확인 없이 속도만으로 탈락.
  GPU 지원 paddle로 바꿔도 승산 있을지는 미확인.

## 처리 안 된 잔여 항목

- `scripts/ocr_benchmark/labels.csv`의 9장(`no_name_in_frame`)은 사진 자체에 제품명이
  없어서 어떤 엔진으로도 테스트 불가 — 새 사진으로 교체하지 않는 한 손댈 수 없음.
- CLOVA 도메인/API 키는 아직 살아있음(NCP 콘솔에서 직접 확인). 안 쓸 거면 도메인 삭제
  권장(과금 방지).
- Task 2(제품 데이터 수집기)가 아직 없어서, 여기서 나온 identification_score는 전부
  "매칭 성공 가능성" 대리 지표일 뿐 실제 DB 매칭 검증은 아직 못 함.

## 재현용 명령어 모음

```bash
# CLOVA + region-detection (현재 최선)
cd scripts/CLOVA_OCR
python run_benchmark.py --region-detection --tag region_detect

# Claude 재시도 (키 교체 후)
cd scripts/AI_OCR
python run_benchmark.py --engines claude
```

## 참고: 이번 세션에 설치된 것

- `scripts/ocr_benchmark/.venv`에 `anthropic`, `openai`, `matplotlib`, `python-dotenv`,
  `tqdm`, `rapidfuzz`, `tabulate`, `pandas`, `pillow`, `paddlex[ocr]`를 추가 설치함
  (AI_OCR 스크립트가 이 venv를 그대로 재사용하도록). `AI_OCR/requirements.txt` 별도
  venv는 안 만듦.
- PaddleOCR-VL-1.6 가중치가 `C:\Users\shimu\.paddlex\official_models\`에 캐시돼 있음
  (레이아웃 모델 PP-DocLayoutV3 + VL 모델 본체, 약 1.7GB). 재시도 안 할 거면 디스크
  정리 대상.
