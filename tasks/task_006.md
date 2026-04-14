# Task ID: 6

**Title:** 백엔드 API 개발

**Status:** pending

**Dependencies:** 3, 4

**Priority:** high

**Description:** FastAPI를 사용하여 백엔드 API를 개발합니다.

**Details:**

FastAPI를 사용하여 제품 검색, 이미지 분석, 유사도 계산, 가성비 비교 API를 개발합니다. Swagger를 통해 자동으로 API 문서를 생성합니다.

**Test Strategy:**

Postman을 사용하여 각 API 엔드포인트를 테스트하고, 예상되는 응답을 반환하는지 확인합니다. 부하 테스트를 통해 성능을 측정합니다.

## Subtasks

### 6.1. 제품 검색 API 개발

**Status:** pending  
**Dependencies:** None  

FastAPI를 사용하여 제품 검색 기능을 구현합니다.

**Details:**

제품 검색 API는 사용자가 입력한 키워드에 따라 데이터베이스에서 제품 정보를 검색하여 반환합니다. PostgreSQL과 연결하여 쿼리를 작성합니다.

### 6.2. 이미지 분석 API 개발

**Status:** pending  
**Dependencies:** 6.1  

Tesseract OCR과 EasyOCR을 활용하여 이미지 분석 API를 개발합니다.

**Details:**

이미지 분석 API는 사용자가 업로드한 이미지를 받아 텍스트를 추출하고, 이를 제품 데이터베이스와 매칭합니다. OpenCV를 사용하여 이미지 전처리를 수행합니다.

### 6.3. 유사도 계산 API 개발

**Status:** pending  
**Dependencies:** 6.1  

제품 간 유사도를 계산하는 API를 구현합니다.

**Details:**

유사도 계산 API는 제품 ID나 성분 데이터를 입력받아, 해당 제품과 유사한 제품들을 계산하여 반환합니다. TF-IDF와 코사인 유사도 알고리즘을 사용합니다.

### 6.4. 가성비 비교 API 개발

**Status:** pending  
**Dependencies:** 6.1  

제품의 가성비를 비교하는 API를 개발합니다.

**Details:**

가성비 비교 API는 제품의 가격과 용량 데이터를 기반으로 ml당 가격을 계산하여 비교 결과를 반환합니다. 데이터베이스에서 필요한 정보를 조회합니다.

### 6.5. Swagger API 문서화 설정

**Status:** pending  
**Dependencies:** 6.1, 6.2, 6.3, 6.4  

Swagger를 사용하여 자동으로 API 문서를 생성합니다.

**Details:**

Swagger를 설정하여 모든 API 엔드포인트에 대한 문서를 자동으로 생성합니다. 이를 통해 개발자와 사용자 모두 API 사용법을 쉽게 이해할 수 있도록 합니다.
