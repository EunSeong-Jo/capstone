# Task ID: 2

**Title:** 제품 데이터 수집기 개발

**Status:** pending

**Dependencies:** 1

**Priority:** high

**Description:** 식약처 API와 올리브영 크롤러를 통해 제품 데이터를 수집합니다.

**Details:**

Python 스크립트를 작성하여 식약처 API에서 제품 데이터를 수집합니다. Selenium과 BeautifulSoup을 사용하여 올리브영 웹사이트에서 제품 정보를 크롤링합니다. 수집된 데이터를 PostgreSQL에 저장합니다.

**Test Strategy:**

수집된 데이터의 품질을 검증하기 위해 샘플 데이터를 수동으로 확인합니다. 데이터베이스에 저장된 데이터의 일관성을 체크합니다.

## Subtasks

### 2.1. 식약처 API 데이터 수집 스크립트 작성

**Status:** pending  
**Dependencies:** None  

식약처 API에서 제품 데이터를 수집하기 위한 Python 스크립트를 작성합니다.

**Details:**

식약처 API의 엔드포인트를 확인하고, 필요한 인증 정보를 포함하여 데이터를 요청하는 스크립트를 작성합니다. 수집된 데이터를 JSON 형식으로 변환합니다.

### 2.2. 올리브영 웹 크롤러 구현

**Status:** pending  
**Dependencies:** None  

Selenium과 BeautifulSoup을 사용하여 올리브영 웹사이트에서 제품 정보를 크롤링합니다.

**Details:**

올리브영 웹사이트의 구조를 분석하여 필요한 제품 정보를 추출하는 크롤러를 작성합니다. Selenium을 사용하여 동적 콘텐츠를 로드하고, BeautifulSoup으로 HTML을 파싱합니다.

### 2.3. 수집된 데이터 PostgreSQL에 저장

**Status:** pending  
**Dependencies:** 2.1, 2.2  

식약처 API와 올리브영에서 수집한 데이터를 PostgreSQL 데이터베이스에 저장합니다.

**Details:**

PostgreSQL 데이터베이스에 연결하고, 수집된 데이터를 적절한 테이블에 삽입하는 코드를 작성합니다. 데이터베이스 스키마를 설계하고, 데이터 무결성을 유지합니다.

### 2.4. 데이터 수집 결과 검증

**Status:** pending  
**Dependencies:** 2.3  

수집된 데이터의 품질을 검증하기 위해 샘플 데이터를 수동으로 확인합니다.

**Details:**

수집된 데이터의 정확성과 일관성을 확인하기 위해 샘플 데이터를 추출하고, 예상 결과와 비교합니다. 데이터베이스의 일관성을 체크합니다.

### 2.5. 테스트 자동화 스크립트 작성

**Status:** pending  
**Dependencies:** 2.3  

수집된 데이터의 품질을 자동으로 검증하는 테스트 스크립트를 작성합니다.

**Details:**

수집된 데이터의 품질을 검증하기 위한 자동화된 테스트 스크립트를 작성합니다. 데이터의 형식, 범위, 일관성을 체크하는 테스트 케이스를 포함합니다.

### 2.6. 성분명 정규화 파이프라인 개발

**Status:** pending  
**Dependencies:** 2.3  

INCI Name 매핑, 동의어 통합, 자동 정규화를 통해 성분명 데이터 품질을 향상시킵니다.

**Details:**

INCI Name 매핑 테이블을 구축하고, 500개 이상의 동의어 사전을 생성합니다. 자동 정규화 스크립트를 작성하여 95% 이상의 정규화율을 목표로 합니다. 미매핑 성분은 수동 검토 큐에 추가하여 관리합니다. '정제수' = 'Water' = 'Aqua', '비타민C' = '아스코르빈산' = 'ascorbic acid' 등의 동의어를 통합합니다.

### 2.7. 성분 설명 사전 구축

**Status:** pending  
**Dependencies:** 2.6  

주요 화장품 성분 500종 이상의 설명 사전을 구축하여 검색 화면 및 챗봇에서 활용합니다.

**Details:**

화해 공개 데이터, 대한화장품학회 자료, CIR 데이터베이스에서 성분 정보를 수집합니다. ingredient_dictionary 테이블에 INCI Name, 한글명, 기능 태그(보습/미백/자외선차단 등), EWG 안전등급(1~10), 쉬운 한국어 설명, 주의사항을 입력합니다. P0 단계에서는 검색 시 성분 설명 표시에 사용하고, P1 단계에서 챗봇 Context Injection용 RAG로 활용합니다.

### 2.8. 네이버 쇼핑 API 최저가 수집

**Status:** pending  
**Dependencies:** 2.3  

네이버 쇼핑 API를 통해 제품별 최저가 및 판매처 정보를 수집합니다.

**Details:**

네이버 개발자센터에서 API 키를 발급받고, DB 내 제품명을 기준으로 네이버 쇼핑 API를 호출하여 최저가 정보를 수집합니다. product_prices 테이블에 판매처, 가격, 구매 링크, 수집 시각을 저장합니다. 일 25,000건 호출 제한을 고려하여 배치 처리합니다.
