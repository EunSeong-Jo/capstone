# Task ID: 9

**Title:** 서버 배포 및 모니터링 설정

**Status:** pending

**Dependencies:** 7, 8

**Priority:** medium

**Description:** AWS EC2에 서버를 배포하고 모니터링 시스템을 설정합니다.

**Details:**

AWS EC2에 FastAPI 서버를 배포하고, Prometheus와 Grafana를 사용하여 모니터링 시스템을 설정합니다. Sentry를 통해 에러를 추적합니다.

**Test Strategy:**

서버의 가용성을 테스트하고, 모니터링 대시보드에서 실시간 데이터를 확인합니다. 장애 발생 시 알림이 제대로 작동하는지 검증합니다.

## Subtasks

### 9.1. AWS EC2 인스턴스 생성

**Status:** pending  
**Dependencies:** None  

AWS EC2에서 FastAPI 서버를 호스팅할 인스턴스를 생성합니다.

**Details:**

AWS 관리 콘솔에 로그인하여 EC2 대시보드에서 새로운 인스턴스를 생성합니다. 필요한 AMI, 인스턴스 유형, 보안 그룹 설정을 구성합니다.

### 9.2. FastAPI 서버 배포

**Status:** pending  
**Dependencies:** 9.1  

생성한 EC2 인스턴스에 FastAPI 서버를 배포합니다.

**Details:**

SSH를 통해 EC2 인스턴스에 접속한 후, FastAPI 애플리케이션을 클론하고 필요한 패키지를 설치합니다. Uvicorn을 사용하여 서버를 실행합니다.

### 9.3. Prometheus 설치 및 설정

**Status:** pending  
**Dependencies:** 9.2  

모니터링을 위해 Prometheus를 설치하고 설정합니다.

**Details:**

EC2 인스턴스에 Prometheus를 설치하고, FastAPI 서버의 메트릭을 수집할 수 있도록 설정 파일을 작성합니다. Prometheus 서비스를 시작합니다.

### 9.4. Grafana 설치 및 대시보드 구성

**Status:** pending  
**Dependencies:** 9.3  

Grafana를 설치하고 Prometheus 데이터 소스를 연결하여 대시보드를 구성합니다.

**Details:**

EC2 인스턴스에 Grafana를 설치한 후, Prometheus를 데이터 소스로 추가합니다. 기본 대시보드를 생성하여 모니터링 데이터를 시각화합니다.

### 9.5. Sentry 에러 추적 및 structlog 구조화 로깅 통합

**Status:** pending  
**Dependencies:** 9.2  

에러 추적을 위한 Sentry와 구조화 로깅을 위한 structlog를 함께 설정합니다.

**Details:**

Sentry 계정을 생성하고 FastAPI 애플리케이션에 Sentry SDK를 설치하여 에러 추적을 설정합니다. structlog를 설치하고 JSON 포맷으로 구조화 로깅을 구현합니다. 검색 쿼리, 유사도 결과, 이미지 분석 로그를 수집합니다. P0 단계에서는 로컬 파일 로깅을 사용하고, P1 단계에서는 서버 집중 로깅으로 전환합니다.

### 9.6. Celery Task Queue 설정 (P1 단계)

**Status:** pending  
**Dependencies:** 9.2  

비동기 작업 처리를 위한 Celery와 Redis 브로커를 구성합니다.

**Details:**

Celery를 설치하고 Redis를 브로커로 설정합니다. Celery Beat 자동 스케줄러를 구성하여 주 1회 데이터 자동 갱신 작업을 등록합니다. 크롤링 작업을 비동기로 처리하여 서버 성능을 최적화합니다. P1 단계에서 구현하며, P0 단계에서는 수동 스크립트 실행을 사용합니다.
