# Task ID: 4

**Title:** 이미지 인식 모듈 개발

**Status:** pending

**Dependencies:** 1 ⧖

**Priority:** high

**Description:** Tesseract OCR과 EasyOCR을 사용하여 제품 이미지를 분석합니다.

**Details:**

OpenCV를 사용하여 이미지 전처리를 수행하고, Tesseract와 EasyOCR을 통해 텍스트를 추출합니다. 추출된 텍스트를 PostgreSQL의 pg_trgm을 사용하여 제품 데이터베이스와 매칭합니다.

**Test Strategy:**

다양한 조건의 이미지로 테스트하여 인식률을 측정하고, 인식 실패 시 텍스트 검색으로 Fallback이 작동하는지 확인합니다.

## Subtasks

### 4.1. 이미지 전처리 및 텍스트 영역 검출

**Status:** pending  
**Dependencies:** None  

OpenCV로 이미지를 전처리하고, EAST 또는 CRAFT 모델로 텍스트 영역을 검출합니다.

**Details:**

OpenCV로 이미지 리사이즈(최대 1280px), 자동 회전 보정(EXIF Orientation), 밝기/대비 정규화, 노이즈 제거(Gaussian Blur)를 수행합니다. EAST Text Detector 또는 CRAFT를 사용하여 패키지 라벨, 브랜드 로고 텍스트 영역(ROI)을 우선 검출합니다. 검출된 ROI는 Tesseract와 EasyOCR에 입력되어 정확도를 향상시킵니다.

### 4.2. Tesseract OCR을 통한 텍스트 추출 구현

**Status:** pending  
**Dependencies:** 4.1  

Tesseract OCR을 사용하여 전처리된 이미지에서 텍스트를 추출합니다. 추출된 텍스트의 정확성을 높이기 위한 설정을 조정합니다.

**Details:**

Tesseract의 설정을 최적화하여 다양한 폰트와 크기의 텍스트를 인식할 수 있도록 합니다. 추출된 텍스트는 후속 단계에서 사용됩니다.

### 4.3. EasyOCR을 통한 텍스트 추출 구현

**Status:** pending  
**Dependencies:** 4.1  

EasyOCR을 사용하여 전처리된 이미지에서 텍스트를 추출합니다. Tesseract와의 비교를 통해 인식률을 평가합니다.

**Details:**

EasyOCR의 모델을 활용하여 다양한 언어의 텍스트를 인식합니다. Tesseract와의 결과를 비교하여 최적의 방법을 결정합니다.

### 4.4. 추출된 텍스트를 PostgreSQL에 매칭

**Status:** pending  
**Dependencies:** 4.2, 4.3  

Tesseract와 EasyOCR에서 추출된 텍스트를 PostgreSQL 데이터베이스의 제품 데이터와 매칭합니다. pg_trgm을 사용하여 유사도를 평가합니다.

**Details:**

추출된 텍스트를 기반으로 데이터베이스에서 유사한 제품을 검색합니다. 매칭 결과는 후속 분석에 사용됩니다.

### 4.5. 전체 모듈 테스트 및 성능 평가

**Status:** pending  
**Dependencies:** 4.2, 4.3, 4.4  

개발된 이미지 인식 모듈의 전체적인 성능을 테스트하고, 인식률 및 오류 발생 시 대처 방안을 평가합니다.

**Details:**

다양한 조건의 이미지를 사용하여 모듈의 인식률을 측정합니다. 인식 실패 시 Fallback 기능이 작동하는지 확인합니다.
