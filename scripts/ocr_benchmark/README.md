# OCR 3종 벤치마크 (Tesseract vs EasyOCR vs PaddleOCR)

화장품 패키지 사진에서 제품명을 인식하는 OCR 엔진을 채택하기 전, 3개 SOTA 엔진의
정확도(CER/WER)와 처리 속도를 비교하기 위한 독립 실험 스크립트입니다.
`backend/app`의 프로덕션 코드와는 분리되어 있습니다.

## 1. 사전 준비: 한글 Tesseract 언어팩 확인

```bash
tesseract --list-langs | grep kor
```

`kor`이 보이지 않으면 설치:

```bash
brew install tesseract-lang
```

## 2. Python 환경 생성

Apple Silicon에서 PaddlePaddle의 wheel 가용성 문제를 피하기 위해 Python 3.11 conda 환경을 사용합니다.

```bash
conda create -n ocr_bench python=3.11 -y
conda activate ocr_bench
pip install -r scripts/ocr_benchmark/requirements.txt
```

## 3. 테스트 이미지 준비

보유 중인 화장품 패키지 사진(50장 이상 권장)을 `scripts/ocr_benchmark/images/`에 넣습니다.

## 4. 라벨 템플릿 생성

```bash
cd scripts/ocr_benchmark
python generate_label_template.py
```

`labels.csv`가 생성됩니다. 컬럼은 `filename, 한글명, 영어명, 브랜드, condition, notes`이며
새로 스캔된 이미지는 전부 빈 칸으로 채워집니다.
재실행해도 이미 채워둔 행은 덮어쓰지 않고 새 이미지만 추가됩니다.

## 5. 정답 라벨링 (직접 확인 필수)

`labels.csv`를 열어 각 행의 사진을 실제로 보고 `한글명`·`영어명`·`브랜드` 칸에 정확한 텍스트를
나눠서 입력합니다. 실제 벤치마크에 쓰이는 `ground_truth`는 `run_benchmark.py`가
`브랜드 + 한글명`(한글명이 없으면 `브랜드 + 영어명`)을 조합해 자동으로 만듭니다.

**라벨링 범위: 브랜드명 + 제품명만.** PRD(`docs/PRD_swappy_v1.8.md`) 상 OCR 모듈의 실제 역할은
사진 속 브랜드명·제품명만 인식해 DB와 fuzzy-match하는 것이고, 전성분 리스트는 OCR이 아니라
이미 수집된 DB 데이터에서 가져온다. 따라서:
- `한글명`/`영어명`에는 전성분 텍스트 전체가 아니라 **제품명만** 입력하고, 브랜드는 `브랜드` 칸에
  따로 입력한다 (예: 브랜드="이니스프리", 한글명="그린티 씨드 세럼" / 브랜드="Cetaphil", 영어명="Moisturising Lotion").
- 한글/영어 중 한쪽만 라벨에 보이면 그쪽만 채우고 나머지는 비워둔다.
- 성분표 사진이라도 프레임 안에 브랜드/제품명이 함께 보이면 그 부분만 정답으로 입력한다.
- 사진 안에 브랜드/제품명이 전혀 보이지 않는 경우(예: 성분표만 클로즈업된 사진), 어떤 OCR 엔진도
  맞힐 수 없는 케이스이므로 `한글명`과 `영어명`을 모두 비워두고 `condition`에 `no_name_in_frame`,
  `notes`에 실제 제품명(참고용, 있다면)을 남겨 벤치마크 대상에서 제외한다
  (`한글명`·`영어명`이 둘 다 비어 있으면 `run_benchmark.py`가 자동으로 건너뛴다).
- 브랜드나 제품명 판독이 불확실한 경우 `condition`에 `brand_unconfirmed` 또는
  `name_unconfirmed`를 남겨 재확인이 필요함을 표시한다.

## 6. 벤치마크 실행

```bash
python run_benchmark.py
```

- 최초 실행 시 EasyOCR/PaddleOCR 모델을 다운로드하므로 수 분 걸릴 수 있습니다 (멈춘 것이 아닙니다).
- `한글명`·`영어명`이 둘 다 비어 있는 행은 자동으로 건너뜁니다.
- `--region-detection` 플래그를 추가하면 이미지 전체를 그대로 넣는 대신, EasyOCR의 CRAFT
  검출기로 브랜드/제품명 후보 영역만 크롭(+작은 텍스트 업스케일)해서 3개 엔진에 넣습니다.
  기존 결과와 비교하려면 태그를 다르게 줘서 따로 저장하세요:
  ```bash
  python run_benchmark.py --tag baseline
  python run_benchmark.py --region-detection --tag region_detect
  ```
- `--tesseract-psm`(기본 11, sparse text)로 Tesseract의 페이지 분할 모드를 바꿀 수 있습니다.
  `--region-detection`으로 이미 크롭된 입력을 넣을 때는 6(균일한 단일 블록 가정)도 시도해보세요:
  ```bash
  python run_benchmark.py --region-detection --tesseract-psm 6 --tag region_detect_psm6
  ```

## 7. 결과 확인

- `output/summary.md`, `output/summary.csv` — 엔진별 평균 CER/WER/정확일치율/trigram 유사도/평균·p95 레이턴시
- `output/comparison_chart.png` — CER/WER/레이턴시 비교 막대그래프
- `output/results_raw.csv` — 이미지 × 엔진 단위 상세 결과 (실패 케이스 확인용)

## 참고: 지표 정의

- **CER**: 문자 단위 편집거리 / 정답 길이 (핵심 지표)
- **WER**: 단어 단위 편집거리 / 정답 단어 수 (한글 패키지 텍스트는 띄어쓰기가 일정하지 않아 보조 지표로만 참고)
- **exact_match**: 정규화(NFC) 후 완전 일치 여부
- **trigram_similarity**: 프로덕션의 PostgreSQL `pg_trgm` 유사도를 근사한 trigram Jaccard 유사도 — 실제 DB 매칭 성공 가능성을 가늠하는 용도

## 알려진 주의사항

- 3개 엔진 모두 CPU로 강제 실행 (레이턴시 비교 공정성)
- CER/WER 계산 전 NFC 정규화 적용 (한글 자모 결합/분리 형태 차이로 인한 왜곡 방지)
- PaddlePaddle/EasyOCR 등은 numpy 2.0 미만 필요
