# Task ID: 12

**Title:** 회원가입 및 사용자 인증 시스템 구현

**Status:** pending

**Dependencies:** 1 ⧖

**Priority:** high

**Description:** PRD v1.8 F1 요구사항에 따라 이메일/비밀번호 기반 회원가입, JWT stateless 인증(access 30분/refresh 30일), Soft-gate 정책(게스트 모드 지원), 관심 도메인 선택 UI를 구현하고 users/user_profiles 테이블 및 인증 API를 개발합니다.

**Details:**

## 구현 상세

### 1. 데이터베이스 스키마 구현

#### 1.1 users 테이블
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,  -- bcrypt 해싱
    auth_provider VARCHAR(20) DEFAULT 'local',  -- local / kakao / google
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_users_email ON users(email);
```

#### 1.2 user_profiles 테이블
```sql
CREATE TABLE user_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    skin_type VARCHAR(20),  -- 8타입 enum: ondalsam, mulgae, subuji, hwasan, samak, injeolmi, yuriguseul, memilmuk
    skin_type_traits JSONB DEFAULT '{}',  -- 보조 특성
    skin_quiz_answers JSONB DEFAULT '[]',  -- QnA 응답 원본
    skin_quiz_scores JSONB DEFAULT '{}',  -- 5축 점수
    interested_domains JSONB DEFAULT '["cosmetics"]',  -- 관심 도메인
    allergy_ingredients JSONB DEFAULT '[]',  -- 알레르기 성분
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### 1.3 refresh_tokens 테이블 (토큰 관리)
```sql
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,  -- SHA-256 해시
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    revoked_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);
```

### 2. FastAPI 백엔드 구현

#### 2.1 인증 모듈 구조
```
backend/
├── app/
│   ├── api/
│   │   └── v1/
│   │       └── auth.py          # 인증 API 라우터
│   ├── core/
│   │   ├── security.py          # JWT, 비밀번호 해싱
│   │   └── config.py            # 설정 (SECRET_KEY 등)
│   ├── models/
│   │   ├── user.py              # SQLAlchemy User 모델
│   │   └── user_profile.py      # UserProfile 모델
│   ├── schemas/
│   │   └── auth.py              # Pydantic 스키마
│   └── services/
│       └── auth_service.py      # 비즈니스 로직
```

#### 2.2 비밀번호 보안 (bcrypt)
```python
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)
```

#### 2.3 JWT 토큰 구현
```python
from jose import jwt, JWTError
from datetime import datetime, timedelta

# 설정값 (config.py)
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 30

def create_access_token(user_id: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": user_id, "exp": expire, "type": "access"}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {"sub": user_id, "exp": expire, "type": "refresh"}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
```

#### 2.4 API 엔드포인트 구현

**POST /api/v1/auth/signup**
```python
@router.post("/signup", response_model=AuthResponse)
async def signup(
    request: SignupRequest,
    db: AsyncSession = Depends(get_db)
):
    # 이메일 중복 검사
    existing = await get_user_by_email(db, request.email)
    if existing:
        raise HTTPException(400, "이미 등록된 이메일입니다")
    
    # 비밀번호 유효성 검사 (최소 8자, 영문+숫자)
    validate_password(request.password)
    
    # 사용자 생성
    user = User(
        email=request.email,
        password_hash=hash_password(request.password),
        auth_provider="local"
    )
    db.add(user)
    
    # 프로필 초기 생성
    profile = UserProfile(
        user_id=user.id,
        interested_domains=["cosmetics"]
    )
    db.add(profile)
    await db.commit()
    
    # 토큰 발급
    access_token = create_access_token(str(user.id))
    refresh_token = create_refresh_token(str(user.id))
    
    # refresh_token DB 저장 (해시)
    await store_refresh_token(db, user.id, refresh_token)
    
    return AuthResponse(
        user_id=str(user.id),
        access_token=access_token,
        refresh_token=refresh_token
    )
```

**POST /api/v1/auth/login**
```python
@router.post("/login", response_model=AuthResponse)
async def login(
    request: LoginRequest,
    db: AsyncSession = Depends(get_db)
):
    user = await get_user_by_email(db, request.email)
    if not user or not verify_password(request.password, user.password_hash):
        raise HTTPException(401, "이메일 또는 비밀번호가 올바르지 않습니다")
    
    if not user.is_active:
        raise HTTPException(403, "비활성화된 계정입니다")
    
    # 마지막 로그인 시간 업데이트
    user.last_login_at = datetime.utcnow()
    await db.commit()
    
    access_token = create_access_token(str(user.id))
    refresh_token = create_refresh_token(str(user.id))
    await store_refresh_token(db, user.id, refresh_token)
    
    return AuthResponse(
        user_id=str(user.id),
        access_token=access_token,
        refresh_token=refresh_token
    )
```

**POST /api/v1/auth/refresh**
```python
@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    request: RefreshRequest,
    db: AsyncSession = Depends(get_db)
):
    try:
        payload = jwt.decode(request.refresh_token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(401, "유효하지 않은 토큰입니다")
        
        user_id = payload.get("sub")
        
        # DB에서 토큰 유효성 확인
        token_valid = await verify_stored_refresh_token(db, user_id, request.refresh_token)
        if not token_valid:
            raise HTTPException(401, "토큰이 만료되었거나 폐기되었습니다")
        
        new_access_token = create_access_token(user_id)
        return TokenResponse(access_token=new_access_token)
        
    except JWTError:
        raise HTTPException(401, "토큰 검증에 실패했습니다")
```

### 3. Soft-gate 정책 구현

#### 3.1 게스트 모드 지원
```python
# 선택적 인증 의존성
async def get_current_user_optional(
    token: str = Depends(oauth2_scheme_optional)
) -> Optional[User]:
    if not token:
        return None  # 게스트 모드
    return await get_current_user(token)

# 게스트도 접근 가능한 엔드포인트
@router.get("/products/search")
async def search_products(
    q: str,
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    # 게스트/로그인 사용자 모두 검색 가능
    pass
```

#### 3.2 개인화 기능 접근 제한
```python
# 로그인 필수 의존성
async def require_authenticated_user(
    current_user: Optional[User] = Depends(get_current_user_optional)
) -> User:
    if not current_user:
        raise HTTPException(
            status_code=401,
            detail={
                "code": "SOFT_GATE",
                "message": "이 기능을 사용하려면 로그인이 필요합니다",
                "action": "show_login_modal"
            }
        )
    return current_user

# 개인화 기능 (로그인 필수)
@router.get("/recommendations/main")
async def get_main_recommendations(
    current_user: User = Depends(require_authenticated_user)
):
    # 프로필 기반 추천
    pass
```

### 4. 관심 도메인 선택 UI 연동

#### 4.1 도메인 선택 API
```python
@router.patch("/profile/me", response_model=ProfileResponse)
async def update_profile(
    request: UpdateProfileRequest,
    current_user: User = Depends(require_authenticated_user),
    db: AsyncSession = Depends(get_db)
):
    profile = await get_user_profile(db, current_user.id)
    
    if request.interested_domains:
        # 화장품 외 도메인은 "추후 오픈" 처리
        valid_domains = ["cosmetics"]  # P0에서 활성화된 도메인
        profile.interested_domains = [
            d for d in request.interested_domains 
            if d in valid_domains or d in ["supplement", "fashion"]  # 저장은 허용
        ]
    
    profile.updated_at = datetime.utcnow()
    await db.commit()
    
    return ProfileResponse.from_orm(profile)
```

### 5. 보안 고려사항

- 비밀번호 정책: 최소 8자, 영문+숫자 조합 필수
- bcrypt cost factor: 12 (기본값)
- JWT secret key: 256비트 이상 랜덤 생성
- refresh token: DB 저장 시 SHA-256 해시 처리
- CORS 설정: 프론트엔드 도메인만 허용
- Rate limiting: 로그인 실패 5회 시 1분 대기

**Test Strategy:**

## 테스트 전략

### 1. 유닛 테스트

#### 1.1 비밀번호 해싱 테스트
```python
def test_password_hash_and_verify():
    password = "TestPass123"
    hashed = hash_password(password)
    assert hashed != password
    assert verify_password(password, hashed)
    assert not verify_password("WrongPass", hashed)

def test_password_hash_uniqueness():
    password = "TestPass123"
    hash1 = hash_password(password)
    hash2 = hash_password(password)
    assert hash1 != hash2  # bcrypt salt로 인해 매번 다름
```

#### 1.2 JWT 토큰 테스트
```python
def test_access_token_creation_and_validation():
    user_id = "test-user-id"
    token = create_access_token(user_id)
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    assert payload["sub"] == user_id
    assert payload["type"] == "access"

def test_token_expiration():
    # 만료된 토큰 검증 시 JWTError 발생 확인
    pass
```

#### 1.3 비밀번호 유효성 검사 테스트
```python
def test_password_validation():
    assert validate_password("ValidPass1")  # 통과
    with pytest.raises(ValidationError):
        validate_password("short")  # 8자 미만
    with pytest.raises(ValidationError):
        validate_password("nouppercase1")  # 대문자 없음
    with pytest.raises(ValidationError):
        validate_password("NoNumbers")  # 숫자 없음
```

### 2. 통합 테스트 (API 엔드포인트)

#### 2.1 회원가입 API 테스트
```python
async def test_signup_success(client: AsyncClient):
    response = await client.post("/api/v1/auth/signup", json={
        "email": "test@example.com",
        "password": "TestPass123",
        "agreements": {"terms": True, "privacy": True}
    })
    assert response.status_code == 200
    data = response.json()
    assert "user_id" in data
    assert "access_token" in data
    assert "refresh_token" in data

async def test_signup_duplicate_email(client: AsyncClient):
    # 먼저 사용자 생성
    await create_test_user("dup@example.com")
    
    response = await client.post("/api/v1/auth/signup", json={
        "email": "dup@example.com",
        "password": "TestPass123"
    })
    assert response.status_code == 400
    assert "이미 등록된 이메일" in response.json()["detail"]
```

#### 2.2 로그인 API 테스트
```python
async def test_login_success(client: AsyncClient, test_user):
    response = await client.post("/api/v1/auth/login", json={
        "email": test_user.email,
        "password": "TestPass123"
    })
    assert response.status_code == 200
    assert "access_token" in response.json()

async def test_login_wrong_password(client: AsyncClient, test_user):
    response = await client.post("/api/v1/auth/login", json={
        "email": test_user.email,
        "password": "WrongPassword"
    })
    assert response.status_code == 401
```

#### 2.3 토큰 갱신 API 테스트
```python
async def test_refresh_token_success(client: AsyncClient, auth_tokens):
    response = await client.post("/api/v1/auth/refresh", json={
        "refresh_token": auth_tokens["refresh_token"]
    })
    assert response.status_code == 200
    assert "access_token" in response.json()

async def test_refresh_with_expired_token(client: AsyncClient):
    expired_token = create_expired_refresh_token()
    response = await client.post("/api/v1/auth/refresh", json={
        "refresh_token": expired_token
    })
    assert response.status_code == 401
```

### 3. Soft-gate 정책 테스트

```python
async def test_guest_can_search_products(client: AsyncClient):
    # 토큰 없이 검색 가능
    response = await client.get("/api/v1/products/search?q=토너")
    assert response.status_code == 200

async def test_guest_cannot_access_personalized_recommendations(client: AsyncClient):
    # 토큰 없이 개인화 추천 접근 시 Soft-gate 응답
    response = await client.get("/api/v1/recommendations/main")
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "SOFT_GATE"

async def test_authenticated_user_gets_personalized_recommendations(client: AsyncClient, auth_headers):
    response = await client.get(
        "/api/v1/recommendations/main",
        headers=auth_headers
    )
    assert response.status_code == 200
```

### 4. 데이터베이스 무결성 테스트

```python
async def test_user_profile_created_on_signup(db: AsyncSession):
    # 회원가입 후 user_profiles 레코드 자동 생성 확인
    user = await create_user_via_signup(db, "test@example.com")
    profile = await get_user_profile(db, user.id)
    assert profile is not None
    assert profile.interested_domains == ["cosmetics"]

async def test_cascade_delete_user_profile(db: AsyncSession):
    user = await create_test_user(db)
    await db.delete(user)
    await db.commit()
    profile = await get_user_profile(db, user.id)
    assert profile is None  # CASCADE 삭제 확인
```

### 5. 보안 테스트

```python
async def test_bcrypt_hash_stored_not_plain_password(db: AsyncSession):
    await create_user_via_signup(db, "test@example.com", "PlainPass123")
    user = await get_user_by_email(db, "test@example.com")
    assert user.password_hash != "PlainPass123"
    assert user.password_hash.startswith("$2b$")  # bcrypt prefix

async def test_refresh_token_stored_as_hash(db: AsyncSession, test_user):
    refresh_token = create_refresh_token(str(test_user.id))
    await store_refresh_token(db, test_user.id, refresh_token)
    
    stored = await db.execute(
        select(RefreshToken).where(RefreshToken.user_id == test_user.id)
    )
    token_record = stored.scalar_one()
    assert token_record.token_hash != refresh_token  # 원본이 아닌 해시 저장
```

### 6. E2E 테스트 시나리오

1. **회원가입 → 로그인 → 토큰 갱신 플로우**
   - 새 사용자 가입 → access/refresh 토큰 수신
   - 로그아웃 후 재로그인 → 새 토큰 발급
   - access 토큰 만료 시 refresh로 갱신

2. **게스트 → 로그인 전환 시나리오**
   - 게스트로 제품 검색 → 정상 동작
   - 개인화 추천 클릭 → Soft-gate 모달 트리거
   - 로그인 완료 → 개인화 추천 접근 가능

3. **도메인 선택 저장 확인**
   - 가입 후 화장품+영양제 선택
   - 프로필 조회 시 선택값 유지 확인

## Subtasks

### 12.1. 데이터베이스 스키마 및 마이그레이션 파일 생성

**Status:** pending  
**Dependencies:** None  

users, user_profiles, refresh_tokens 테이블을 포함한 인증 관련 데이터베이스 스키마를 설계하고 SQLAlchemy 모델 및 Alembic 마이그레이션 파일을 생성합니다.

**Details:**

1. backend/app/models/ 디렉토리에 user.py, user_profile.py 파일 생성
2. users 테이블: id(UUID PK), email(UNIQUE NOT NULL), password_hash, auth_provider(local/kakao/google), created_at, last_login_at, is_active
3. user_profiles 테이블: user_id(FK), skin_type(enum 8종), skin_type_traits(JSONB), skin_quiz_answers(JSONB), skin_quiz_scores(JSONB), interested_domains(JSONB default ['cosmetics']), allergy_ingredients(JSONB)
4. refresh_tokens 테이블: id(UUID), user_id(FK), token_hash(SHA-256), expires_at, created_at, revoked_at
5. 각 테이블에 필요한 인덱스 생성 (idx_users_email, idx_refresh_tokens_user, idx_refresh_tokens_hash)
6. Alembic 마이그레이션 파일 생성 및 테스트

### 12.2. 비밀번호 보안 및 JWT 토큰 관리 모듈 구현

**Status:** pending  
**Dependencies:** 12.1  

bcrypt 기반 비밀번호 해싱/검증 유틸리티와 JWT access/refresh 토큰 생성/검증 함수를 포함한 보안 모듈을 구현합니다.

**Details:**

1. backend/app/core/security.py 생성
2. passlib.context.CryptContext를 사용한 bcrypt 해싱 구현 (cost factor 12)
3. hash_password(password: str) -> str 함수 구현
4. verify_password(plain_password: str, hashed_password: str) -> bool 함수 구현
5. python-jose를 사용한 JWT 토큰 구현
6. create_access_token(user_id: str) -> str: 만료 30분, payload에 sub, exp, type='access' 포함
7. create_refresh_token(user_id: str) -> str: 만료 30일, type='refresh'
8. decode_token(token: str) -> dict: 토큰 검증 및 디코딩
9. backend/app/core/config.py에 JWT_SECRET_KEY, ALGORITHM='HS256', 토큰 만료 설정 추가
10. refresh_token DB 저장 시 SHA-256 해시 처리 함수

### 12.3. 인증 API 엔드포인트 구현 (signup, login, refresh)

**Status:** pending  
**Dependencies:** 12.1, 12.2  

회원가입, 로그인, 토큰 갱신 API 엔드포인트를 FastAPI 라우터로 구현하고 Pydantic 스키마를 정의합니다.

**Details:**

1. backend/app/schemas/auth.py: SignupRequest, LoginRequest, RefreshRequest, AuthResponse, TokenResponse Pydantic 모델 정의
2. backend/app/api/v1/auth.py 라우터 생성
3. POST /api/v1/auth/signup: 이메일 중복 검사, 비밀번호 유효성 검사(최소 8자, 영문+숫자), users 테이블 생성, user_profiles 초기 생성(interested_domains=['cosmetics']), JWT 토큰 쌍 발급, refresh_token DB 저장
4. POST /api/v1/auth/login: 이메일로 사용자 조회, 비밀번호 검증, is_active 확인, last_login_at 업데이트, 토큰 발급
5. POST /api/v1/auth/refresh: refresh_token 검증, DB에서 토큰 유효성 확인(해시 비교, revoked_at 체크), 새 access_token 발급
6. backend/app/services/auth_service.py: 비즈니스 로직 분리 (get_user_by_email, store_refresh_token, verify_stored_refresh_token)
7. 적절한 HTTP 에러 코드와 한글 에러 메시지 반환

### 12.4. 인증 미들웨어 및 Soft-gate 의존성 구현

**Status:** pending  
**Dependencies:** 12.2, 12.3  

JWT 토큰 검증 미들웨어와 Soft-gate 정책을 위한 선택적/필수 인증 의존성 함수를 구현합니다.

**Details:**

1. backend/app/api/deps.py 또는 backend/app/core/auth_deps.py 생성
2. OAuth2PasswordBearer 스킴 설정 (tokenUrl='/api/v1/auth/login')
3. get_current_user(token: str = Depends(oauth2_scheme)) -> User: 토큰 검증 후 사용자 반환, 실패 시 401
4. get_current_user_optional(token: str = Depends(oauth2_scheme_optional)) -> Optional[User]: 토큰 없으면 None 반환 (게스트 모드 지원)
5. require_authenticated_user(current_user: Optional[User] = Depends(get_current_user_optional)) -> User: None이면 401 반환, detail에 code='SOFT_GATE', message, action='show_login_modal' 포함
6. 로그인 실패 Rate limiting: 5회 실패 시 1분 대기 (Redis 활용, 선택적)
7. 의존성 함수들을 다른 라우터에서 쉽게 import하여 사용할 수 있도록 구조화

### 12.5. 사용자 프로필 API 및 관심 도메인 선택 엔드포인트 구현

**Status:** pending  
**Dependencies:** 12.1, 12.4  

사용자 프로필 조회/수정 API와 관심 도메인 선택 기능을 구현하여 회원가입 흐름을 완성합니다.

**Details:**

1. backend/app/schemas/profile.py: ProfileResponse, UpdateProfileRequest Pydantic 모델 정의
2. backend/app/api/v1/profile.py 라우터 생성
3. GET /api/v1/profile/me: 현재 사용자 프로필 조회 (require_authenticated_user 의존성)
4. PATCH /api/v1/profile/me: 프로필 업데이트 (interested_domains, allergy_ingredients 등)
5. 도메인 선택 로직: cosmetics만 활성화, supplement/fashion은 저장은 허용하되 기능은 '추후 오픈' 처리
6. updated_at 자동 갱신
7. backend/app/services/profile_service.py: get_user_profile, update_user_profile 비즈니스 로직

### 12.6. 소셜 로그인 기반 구조 설계 (Kakao/Google OAuth 준비)

**Status:** pending  
**Dependencies:** 12.3  

Kakao, Google OAuth 2.0 소셜 로그인을 위한 기반 구조를 설계하고 확장 가능한 인터페이스를 구현합니다.

**Details:**

1. backend/app/core/oauth.py 또는 backend/app/services/oauth_service.py 생성
2. OAuthProvider 추상 클래스/인터페이스 정의: authorize_url(), get_access_token(), get_user_info()
3. KakaoOAuthProvider, GoogleOAuthProvider 스텁 클래스 생성
4. users.auth_provider 필드 활용: 'local', 'kakao', 'google' 구분
5. POST /api/v1/auth/oauth/{provider}/callback 엔드포인트 기본 구조 설계
6. 소셜 로그인 사용자의 경우 password_hash는 NULL 또는 랜덤 해시로 처리
7. config.py에 KAKAO_CLIENT_ID, GOOGLE_CLIENT_ID 등 환경변수 자리 확보
8. P0에서는 이메일 가입만 활성화, 소셜 로그인은 P1a에서 완성 예정이므로 주석/문서로 명시

### 12.7. 인증 시스템 통합 테스트 및 API 문서화

**Status:** pending  
**Dependencies:** 12.3, 12.4, 12.5, 12.6  

전체 인증 흐름(회원가입→로그인→프로필→토큰갱신)에 대한 통합 테스트를 작성하고 OpenAPI 문서를 완성합니다.

**Details:**

1. backend/tests/test_auth.py: pytest를 사용한 통합 테스트 작성
2. 테스트 시나리오: 회원가입 → 로그인 → 프로필 조회 → 프로필 수정 → access_token 만료 시뮬레이션 → refresh → 로그아웃(선택적)
3. 게스트 모드 시나리오: 토큰 없이 공개 API 접근 → 개인화 API 접근 시 SOFT_GATE 에러 확인
4. 에러 케이스: 중복 이메일, 잘못된 비밀번호 형식, 틀린 로그인 정보, 만료된 토큰 등
5. FastAPI의 자동 OpenAPI 문서에 적절한 response_model, status_code, description 추가
6. Swagger UI에서 인증 테스트 가능하도록 설정
7. backend/app/api/v1/router.py에 auth, profile 라우터 통합
8. CORS 설정: 프론트엔드 도메인만 허용하도록 backend/app/main.py 설정
