# Task ID: 1

**Title:** 프로젝트 환경 설정

**Status:** pending

**Dependencies:** None

**Priority:** high

**Description:** Docker Compose를 사용하여 로컬 개발 환경을 설정합니다.

**Details:**

Docker Compose 파일을 작성하여 PostgreSQL, Redis, FastAPI 서버를 포함한 로컬 개발 환경을 설정합니다. 각 서비스의 Dockerfile을 작성하고, 네트워크 설정을 통해 서비스 간 통신을 설정합니다.

**Test Strategy:**

Docker Compose로 모든 서비스가 정상적으로 기동되는지 확인합니다. 각 서비스의 로그를 확인하여 오류가 없는지 점검합니다.

## Subtasks

### 1.1. Docker Compose 파일 작성 및 서비스 정의

**Status:** pending  
**Dependencies:** None  

PostgreSQL, Redis, FastAPI 서버를 포함한 Docker Compose 파일을 작성하고 각 서비스를 정의합니다.

**Details:**

PostgreSQL과 Redis는 공식 이미지를 사용하고, 각 서비스의 이미지, 포트, 환경 변수를 정의합니다. 네트워크 설정을 추가하여 서비스 간 통신이 가능하도록 구성합니다.

### 1.2. FastAPI Dockerfile 작성

**Status:** pending  
**Dependencies:** 1.1  

FastAPI 서버에 대한 커스텀 Dockerfile을 작성합니다.

**Details:**

FastAPI 애플리케이션을 실행하기 위한 Python 환경을 설정하고, 의존성을 설치하며, 애플리케이션 시작 명령을 포함합니다.

### 1.3. 환경 변수 및 초기화 스크립트 설정

**Status:** pending  
**Dependencies:** 1.1  

각 서비스의 환경 변수를 설정하고, PostgreSQL 초기화 스크립트와 Redis 캐싱 전략을 구성합니다.

**Details:**

PostgreSQL의 초기 데이터베이스와 사용자를 생성하는 스크립트를 작성하고, 환경 변수를 .env 파일로 관리합니다. Redis 캐싱 전략을 설정하여 유사도 결과 캐싱(TTL: 24시간), 검색어 자동완성 캐싱, 제품 정보 캐싱을 구현합니다.

### 1.4. 볼륨 및 데이터 지속성 설정

**Status:** pending  
**Dependencies:** 1.1, 1.3  

PostgreSQL과 Redis의 데이터 지속성을 위한 볼륨 설정을 추가합니다.

**Details:**

Docker Compose에서 볼륨을 정의하여 데이터베이스 데이터와 Redis 데이터가 컨테이너 재시작 후에도 유지되도록 설정합니다.

### 1.5. 전체 스택 테스트 및 검증

**Status:** pending  
**Dependencies:** 1.1, 1.2, 1.3, 1.4  

Docker Compose로 전체 스택을 구동하고 서비스 간 통신을 테스트합니다.

**Details:**

docker-compose up 명령으로 모든 서비스를 기동하고, 각 서비스의 로그를 확인하여 오류가 없는지 검증합니다. FastAPI에서 PostgreSQL과 Redis에 정상적으로 연결되는지 테스트합니다.
