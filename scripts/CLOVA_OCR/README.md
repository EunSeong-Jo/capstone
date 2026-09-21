# 네이버 CLOVA OCR(General) 벤치마크

기존 OCR 3종(`../ocr_benchmark`)이 화장품 라벨의 한글 텍스트를 잘 못 읽는 문제를,
한국어 학습 데이터로 만들어진 네이버 CLOVA OCR로 대체했을 때의 정확도·속도를 확인하기
위한 독립 실험 스크립트입니다. 같은 이미지·정답 라벨(`../ocr_benchmark/labels.csv`)을
재사용하므로 기존 결과와 직접 비교할 수 있습니다.

## ⚠️ 비용 확인 필요

NAVER Cloud Platform 공식 문서(`guide.ncloud-docs.com/docs/en/clovaocr-domain`)에는
**"Additional fees apply when you subscribe to the API Gateway"**라고 명시돼 있습니다.
일부 블로그 글은 "월 5,000건 무료"라고 소개하지만 이는 확인 못 한 정보입니다.
**계정을 만들기 전에 NCP 콘솔에서 실제 요금제를 직접 확인하세요.** 결제 수단 등록이
필요할 수 있습니다.

## 1. NCP 계정 및 API 키 발급

1. [NAVER Cloud Platform](https://www.ncloud.com)에 가입합니다 (본인인증 필요할 수 있음).
2. 콘솔에서 **Menu > All Services > AI Services > CLOVA OCR**로 이동해 도메인을 생성합니다
   (도메인 타입: General, 리전당 1개만 생성 가능).
3. 도메인의 **API Gateway integration** 설정에서 **[Create]**를 눌러 **Secret Key**를 발급받습니다.
4. **[Automatic integrations]**에서 **APIGW Invoke URL**을 복사합니다.

## 2. API 키 등록

**API 키는 이 채팅창에 붙여넣지 말고**, `scripts/CLOVA_OCR/.env` 파일을 만들어 등록하세요
(저장소 전체에서 `.env`는 `.gitignore`에 포함되어 있어 실수로 커밋되지 않습니다):

```
CLOVA_OCR_SECRET=your_secret_key_here
CLOVA_OCR_INVOKE_URL=https://xxxxx.apigw.ntruss.com/custom/v1/xxxxx/general
```

## 3. Python 환경

```bash
python -m venv venv && source venv/bin/activate   # 또는 기존 conda/venv 재사용
pip install -r scripts/CLOVA_OCR/requirements.txt
```

## 4. 실행

```bash
cd scripts/CLOVA_OCR
python run_benchmark.py                # 전체 이미지
python run_benchmark.py --limit 5      # 빠른 확인용 5장만
```

기본적으로 `../ocr_benchmark/images`와 `../ocr_benchmark/labels.csv`를 그대로 사용합니다.

## 5. 결과 확인

- `output/summary.md`, `output/summary.csv` — mean_cer/식별점수/평균 레이턴시
  (지표 정의는 `../ocr_benchmark/README.md` 참고 — 동일한 기준 사용)
- `output/comparison_chart.png`
- `output/results_raw.csv` — 이미지 단위 상세 결과

## 참고

- CLOVA OCR General API는 로컬 이미지를 base64로 인코딩해 보낸다(공개 URL 불필요).
- `backend/app`의 프로덕션 코드와는 분리되어 있습니다.
