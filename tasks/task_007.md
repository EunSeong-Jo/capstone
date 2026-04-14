# Task ID: 7

**Title:** AI 챗봇 개발

**Status:** pending

**Dependencies:** 5, 6

**Priority:** medium

**Description:** Claude API를 사용하여 AI 챗봇을 개발합니다.

**Details:**

Claude API를 사용하여 자연어 처리 기반의 AI 챗봇을 개발합니다. Context Injection을 통해 현재 조회 중인 제품 정보를 대화에 활용합니다.

**Test Strategy:**

다양한 시나리오로 챗봇을 테스트하여 응답의 적절성을 평가합니다. 사용자 피드백을 수집하여 개선합니다.

## Subtasks

### 7.1. Claude API 통합

**Status:** pending  
**Dependencies:** None  

AI 챗봇에 Claude API를 통합하여 자연어 처리 기능을 구현합니다.

**Details:**

Claude API를 호출하는 기능을 구현하고, API 응답을 처리하여 챗봇의 대화 흐름에 맞게 변환합니다.

### 7.2. Context Builder 및 RAG 구현

**Status:** pending  
**Dependencies:** 7.1  

맥락 구성기와 성분 설명 사전 기반 RAG를 구현하여 대화의 정확성을 향상시킵니다.

**Details:**

Context Builder로 현재 조회 중인 제품 정보(제품명, 전성분 리스트), 대체품 분석 결과를 대화에 자동 주입합니다. ingredient_dictionary 테이블에서 관련 성분 정보를 조회하는 RAG Lite를 구현합니다. 최근 대화 히스토리 최대 10턴을 유지하고, 오래된 턴은 요약 압축하여 토큰을 절약합니다. System Prompt를 동적으로 조립하며, 의료 진단 질문 시 '피부과 전문의 상담을 권장드려요' 메시지로 차단합니다.

### 7.3. 챗봇 UI 디자인

**Status:** pending  
**Dependencies:** 7.2  

AI 챗봇의 사용자 인터페이스를 디자인하고 구현합니다.

**Details:**

React와 Tailwind CSS를 사용하여 챗봇의 대화창 및 입력창을 디자인하고, 사용자 경험을 고려하여 반응형으로 구현합니다.

### 7.4. 챗봇 응답 테스트

**Status:** pending  
**Dependencies:** 7.3  

다양한 시나리오를 통해 챗봇의 응답 적절성을 테스트합니다.

**Details:**

사용자 시나리오를 기반으로 챗봇의 응답을 테스트하고, 응답의 정확성과 적절성을 평가합니다.

### 7.5. 사용자 피드백 수집 및 분석

**Status:** pending  
**Dependencies:** 7.4  

챗봇 사용자의 피드백을 수집하고 분석하여 개선점을 도출합니다.

**Details:**

베타 테스트를 통해 사용자 피드백을 수집하고, 이를 분석하여 챗봇의 기능 개선 계획을 수립합니다.
