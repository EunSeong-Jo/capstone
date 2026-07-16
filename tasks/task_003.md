# Task ID: 3

**Title:** 성분 유사도 분석 엔진 개발

**Status:** pending

**Dependencies:** 2

**Priority:** high

**Description:** TF-IDF와 코사인 유사도를 사용하여 성분 유사도를 계산합니다.

**Details:**

scikit-learn을 사용하여 성분 데이터를 TF-IDF 벡터로 변환하고, 코사인 유사도를 계산하는 엔진을 개발합니다. 유사도 계산 결과를 캐싱하여 성능을 최적화합니다.

**Test Strategy:**

유사도 계산 결과를 수동으로 검증하고, Ground Truth 데이터셋을 사용하여 Hit Rate를 측정합니다.

## Subtasks

### 3.1. TF-IDF 벡터 변환 구현

**Status:** pending  
**Dependencies:** None  

성분 데이터를 TF-IDF 벡터로 변환하는 기능을 구현합니다.

**Details:**

scikit-learn의 TfidfVectorizer를 사용하여 성분 데이터를 벡터로 변환합니다. 데이터 전처리 과정도 포함합니다.

### 3.2. 코사인 유사도 계산 기능 개발

**Status:** pending  
**Dependencies:** 3.1  

TF-IDF 벡터를 기반으로 코사인 유사도를 계산하는 기능을 개발합니다.

**Details:**

scikit-learn의 cosine_similarity 함수를 사용하여 두 벡터 간의 유사도를 계산합니다. 결과를 반환하는 함수를 작성합니다.

### 3.3. 유사도 결과 캐싱 구현

**Status:** pending  
**Dependencies:** 3.2  

계산된 유사도 결과를 캐싱하여 성능을 최적화합니다.

**Details:**

Redis를 사용하여 유사도 계산 결과를 캐싱합니다. 캐시된 결과를 조회하고 업데이트하는 로직을 구현합니다.

### 3.4. 성능 최적화 테스트

**Status:** pending  
**Dependencies:** 3.3  

캐싱된 유사도 결과의 성능을 테스트하여 최적화를 검증합니다.

**Details:**

유사도 계산의 성능을 측정하고, 캐시 사용 전후의 성능 차이를 비교합니다. 결과를 문서화합니다.

### 3.5. 결과 검증 및 문서화

**Status:** pending  
**Dependencies:** 3.4  

유사도 계산 결과를 검증하고, 최종 결과를 문서화합니다.

**Details:**

Ground Truth 데이터셋을 사용하여 유사도 계산 결과를 검증합니다. 검증 결과를 문서화하여 팀과 공유합니다.

### 3.6. Ground Truth 데이터셋 자동 구축

**Status:** pending  
**Dependencies:** None  

알고리즘 평가를 위한 Ground Truth 데이터셋 50쌍을 자동으로 구축합니다.

**Details:**

소스 1: 뷰티 커뮤니티(파우더룸, 네이버 카페, 인스타)에서 '○○ 저렴이', '○○ 대체품' 키워드로 크롤링하여 제품명 쌍을 자동 추출(목표 30쌍). 소스 2: DB 내 동일 카테고리에서 상위 5개 성분 중 3개 이상 겹치는 제품 쌍을 스크립트로 자동 생성(목표 20쌍). Jaccard Index ≥60% 자동 검증으로 정답 확정. 전 과정 자동화하여 알고리즘 변경 시 1분 내 재실행 가능하도록 구현.

### 3.7. 다중 알고리즘 비교 실험

**Status:** pending  
**Dependencies:** 3.6  

3가지 유사도 알고리즘을 구현하고 Ground Truth 기반으로 Hit Rate를 비교합니다.

**Details:**

알고리즘 1: 위치 가중 TF-IDF + 코사인 유사도(서브태스크 3.1-3.2 활용). 알고리즘 2: Weighted Jaccard Similarity(공통 성분 수 / 전체 성분 수 + 위치 가중치). 알고리즘 3: Rank-Biased Overlap(성분 순서 리스트 간 순위 일치도 측정, 상위 성분 가중). Ground Truth 50쌍에 대해 각 알고리즘의 TOP 3 Hit Rate를 측정하고 비교 분석합니다.

### 3.8. 최적 알고리즘 선정 및 적용

**Status:** pending  
**Dependencies:** 3.7  

실험 결과를 바탕으로 최적 알고리즘을 선정하고 프로덕션에 적용합니다.

**Details:**

3종 알고리즘의 Hit Rate, 계산 속도, 메모리 사용량을 종합 비교 분석합니다. 단일 알고리즘 선택 또는 앙상블(가중 평균) 방식을 결정합니다. 선정 근거를 문서화하여 졸업작품 발표 자료로 활용합니다. 최종 선정된 알고리즘을 ingredient_vectors 테이블에 적용하고 성능을 검증합니다.
