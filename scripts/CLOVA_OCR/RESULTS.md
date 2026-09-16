# CLOVA OCR 벤치마크 결과 (2026-09-12)

## 배경

`../ocr_benchmark`(Tesseract/EasyOCR/PaddleOCR)와 `../AI_OCR`(Claude/GPT-4o)가 전부
한국어를 "여러 언어 중 하나"로만 지원하는 범용 엔진이라는 점에 착안해, 한국어 학습
데이터로 만들어진 네이버 CLOVA OCR(General)을 같은 이미지·라벨(36장, 브랜드/제품명
라벨링 완료분)로 재검증했다.

## 결과 비교 (동일 36장, 동일 채점 기준)

| 엔진 | mean_cer | trigram_similarity | identification_score | full_score_rate% | zero_score_rate% | 평균 레이턴시 |
|---|---|---|---|---|---|---|
| paddleocr + cubic 업스케일 | 0.615 | 0.243 | 1.111 | 36.1 | 61.1 | 62.7s |
| paddleocr + FSRCNN 업스케일 | 0.611 | 0.247 | 1.111 | 36.1 | 61.1 | 62.3s |
| CLOVA OCR (단독, region-detection 없음) | 0.671 | 0.240 | 1.361 | 44.4 | 52.8 | 4.0s |
| **CLOVA OCR + region-detection** | **0.642** | **0.280** | **1.611** | **52.8** | **44.4** | 6.0s |

## 결론

- **CLOVA OCR + region-detection이 정확도·속도 모두 지금까지 시도한 조합 중 최고.**
  paddleocr 대비 full_score_rate가 36.1% → 52.8%로 오르고, 레이턴시는 62.7s → 6.0s로
  10배 이상 빠르다.
- region-detection은 CLOVA에서도 효과가 뚜렷하다(단독 대비 full_score +8.4%p,
  zero_score -8.4%p) — paddleocr 때보다 개선폭이 더 크다.
- FSRCNN 초해상도 업스케일(cubic 대비)은 paddleocr 기준으로는 유의미한 차이가 없었다
  (통제 실험 결과 CER/식별점수/full_score/zero_score가 소수점까지 동일) — 이 데이터셋의
  실패 원인은 해상도 문제가 아니라 정보 자체가 소실된 케이스(블러/저대비/필기체)로 보임.

## 재현 방법

```bash
cd scripts/CLOVA_OCR
python run_benchmark.py                                    # 단독
python run_benchmark.py --region-detection --tag region_detect  # region-detection
```

`.env`에 `CLOVA_OCR_SECRET`/`CLOVA_OCR_INVOKE_URL` 필요 (README.md 참고).

## 비용 관련 주의사항

- NCP 공식 문서 기준 CLOVA OCR은 종량제. 구체적 원화 단가는 NCP 콘솔 요금 계산기에서
  직접 확인 필요(공식 문서에 숫자가 명시되어 있지 않음).
- API Gateway는 CLOVA OCR과 별개로 자체 사용료가 부과됨.
- General + Free 플랜 조합은 미사용 시 기본 유지비가 없는 것으로 보이나(문서 상 추정),
  실제 채택 전 반드시 콘솔에서 재확인할 것.

## 미확인/후속 과제

- Task 2(제품 데이터 수집기)가 아직 없어 실제 pg_trgm DB 매칭 성공률은 검증 못 함 —
  위 identification_score는 매칭을 가늠하는 대리 지표일 뿐.
- 나머지 9장(no_name_in_frame)과 라벨 미확정 3장은 이번 벤치마크에서 자동 제외됨.
- Upstage, Surya, PaddleOCR-VL 등 다른 후보는 아직 미시도.
