# Task ID: 14

**Title:** 프로필 기반 메인 화면 추천 엔진 개발

**Status:** pending

**Dependencies:** 2, 3, 13

**Priority:** high

**Description:** PRD v1.8 F3(P0) 요구사항에 따라 사용자 피부타입 기반 메인 화면 추천 API(GET /api/v1/recommendations/main, GET /api/v1/recommendations/welcome-set)를 개발합니다. skin_type_recommendation_rules 테이블에서 추천 성분 태그를 도출하고, 점수 기반 랭킹으로 상위 12개 제품을 반환하며, Redis TTL 24시간 캐싱과 admin_curated_sets 테이블 기반 환영 세트 기능을 포함합니다.

**Details:**

## 구현 상세

### 1. 데이터베이스 스키마 구현

#### 1.1 skin_type_recommendation_rules 테이블
```sql
CREATE TABLE skin_type_recommendation_rules (
    id SERIAL PRIMARY KEY,
    skin_type VARCHAR(20) NOT NULL,              -- ondalsam, mulgae, subuji, hwasan, samak, injeolmi, yuriguseul, memilmuk
    recommended_tags JSONB NOT NULL,              -- ["균형보습", "항산화", "가벼운유분"]
    avoid_tags JSONB NOT NULL,                    -- ["알코올", "강한계면활성제"]
    priority INT DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(skin_type)
);

CREATE INDEX idx_skin_type_rec_rules_type ON skin_type_recommendation_rules(skin_type);
```

#### 1.2 admin_curated_sets 테이블 (이미 정의된 스키마 확장)
```sql
CREATE TABLE admin_curated_sets (
    id SERIAL PRIMARY KEY,
    skin_type VARCHAR(20) NOT NULL,
    set_name VARCHAR(100) NOT NULL,               -- "옹달샘 균형 케어 입문 세트"
    product_ids JSONB NOT NULL,                   -- [123, 456, 789]
    price_tier VARCHAR(10) NOT NULL,              -- low, mid, high
    categories JSONB DEFAULT '["스킨", "로션", "에센스"]',
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_curated_sets_skin_type ON admin_curated_sets(skin_type);
CREATE INDEX idx_curated_sets_active ON admin_curated_sets(is_active) WHERE is_active = TRUE;
```

#### 1.3 recommendation_cache 테이블 (Redis 백업용)
```sql
CREATE TABLE recommendation_cache (
    cache_key VARCHAR(255) PRIMARY KEY,           -- "main:{skin_type}:{category}"
    recommendations JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);
```

### 2. FastAPI 추천 엔진 서비스 구현

#### 2.1 추천 점수 계산 모듈 (app/services/recommendation_engine.py)
```python
import math
from typing import List, Dict, Optional
from sqlalchemy.orm import Session
from app.models import Product, ProductIngredient, ProductRating, SkinTypeRecommendationRule
import redis
import json

class RecommendationEngine:
    def __init__(self, db: Session, redis_client: redis.Redis):
        self.db = db
        self.redis = redis_client
        self.CACHE_TTL = 86400  # 24시간

    def get_recommendation_rules(self, skin_type: str) -> Dict:
        """피부타입별 추천/주의 성분 태그 조회"""
        rule = self.db.query(SkinTypeRecommendationRule).filter(
            SkinTypeRecommendationRule.skin_type == skin_type,
            SkinTypeRecommendationRule.is_active == True
        ).first()
        
        if not rule:
            return {"recommended_tags": [], "avoid_tags": []}
        return {
            "recommended_tags": rule.recommended_tags,
            "avoid_tags": rule.avoid_tags
        }

    def filter_candidates(
        self, 
        category: Optional[str], 
        recommended_tags: List[str], 
        avoid_tags: List[str]
    ) -> List[Product]:
        """후보 제품 1차 필터링: 카테고리 + 추천 태그 포함 + 주의 태그 제외"""
        query = self.db.query(Product).filter(Product.is_available == True)
        
        if category:
            query = query.filter(Product.category == category)
        
        # 추천 태그 1개 이상 포함하는 제품 필터링
        # ingredient_dictionary의 function_tags와 매칭
        # (실제 구현에서는 JOIN으로 처리)
        
        return query.all()

    def calculate_product_score(
        self, 
        product: Product, 
        recommended_tags: List[str],
        brand_counts: Dict[str, int]
    ) -> float:
        """제품 점수 산출 (매칭×0.4 + 별점×0.3 + 리뷰수 로그×0.2 + 다양성×0.1)"""
        # 1. 매칭 성분 수 계산 (0.4)
        matching_count = self._count_matching_ingredients(product.id, recommended_tags)
        matching_score = min(matching_count / 5.0, 1.0) * 0.4  # 최대 5개 매칭 가정
        
        # 2. 별점 평균 (0.3)
        rating = self._get_product_rating(product.id)
        rating_score = (rating / 5.0) * 0.3
        
        # 3. 리뷰 건수 로그 스케일 (0.2)
        review_count = self._get_review_count(product.id)
        review_score = min(math.log10(review_count + 1) / 4.0, 1.0) * 0.2  # log10(10000)=4 최대
        
        # 4. 브랜드 다양성 보정 (0.1)
        brand = product.brand
        diversity_penalty = min(brand_counts.get(brand, 0) * 0.05, 0.1)
        diversity_score = 0.1 - diversity_penalty
        
        return matching_score + rating_score + review_score + diversity_score

    def get_main_recommendations(
        self, 
        skin_type: str, 
        category: Optional[str] = None,
        limit: int = 12
    ) -> List[Dict]:
        """메인 화면 추천 제품 조회 (상위 12개)"""
        # Redis 캐시 확인
        cache_key = f"main:{skin_type}:{category or 'all'}"
        cached = self.redis.get(cache_key)
        if cached:
            return json.loads(cached)
        
        # 추천 룰 조회
        rules = self.get_recommendation_rules(skin_type)
        
        # 후보 필터링
        candidates = self.filter_candidates(
            category, 
            rules["recommended_tags"], 
            rules["avoid_tags"]
        )
        
        # 점수 계산 및 정렬
        brand_counts = {}
        scored_products = []
        
        for product in candidates:
            score = self.calculate_product_score(
                product, 
                rules["recommended_tags"],
                brand_counts
            )
            scored_products.append((product, score))
            brand_counts[product.brand] = brand_counts.get(product.brand, 0) + 1
        
        scored_products.sort(key=lambda x: x[1], reverse=True)
        
        # 동일 브랜드 최대 2개 제한
        result = []
        brand_in_result = {}
        for product, score in scored_products:
            if brand_in_result.get(product.brand, 0) >= 2:
                continue
            result.append(self._serialize_product(product, score, rules["recommended_tags"]))
            brand_in_result[product.brand] = brand_in_result.get(product.brand, 0) + 1
            if len(result) >= limit:
                break
        
        # Redis 캐싱
        self.redis.setex(cache_key, self.CACHE_TTL, json.dumps(result))
        
        return result
```

#### 2.2 환영 세트 서비스 (app/services/welcome_set_service.py)
```python
from typing import List, Dict, Optional
from sqlalchemy.orm import Session
from app.models import AdminCuratedSet, Product

class WelcomeSetService:
    def __init__(self, db: Session):
        self.db = db

    def get_welcome_sets(
        self, 
        skin_type: str, 
        price_tier: Optional[str] = None
    ) -> List[Dict]:
        """피부타입별 사전 큐레이션 세트 조회"""
        query = self.db.query(AdminCuratedSet).filter(
            AdminCuratedSet.skin_type == skin_type,
            AdminCuratedSet.is_active == True
        )
        
        if price_tier:
            query = query.filter(AdminCuratedSet.price_tier == price_tier)
        else:
            # 기본: 저가/중가/고가 각 1개씩
            pass
        
        sets = query.all()
        
        result = []
        for curated_set in sets:
            products = self._get_products_by_ids(curated_set.product_ids)
            total_price = sum(p.get("current_price", 0) for p in products)
            
            result.append({
                "set_id": curated_set.id,
                "set_name": curated_set.set_name,
                "skin_type": curated_set.skin_type,
                "price_tier": curated_set.price_tier,
                "total_price": total_price,
                "products": products,
                "categories": curated_set.categories,
                "description": curated_set.description
            })
        
        return result

    def _get_products_by_ids(self, product_ids: List[int]) -> List[Dict]:
        """제품 ID 목록으로 제품 상세 조회"""
        products = self.db.query(Product).filter(
            Product.id.in_(product_ids)
        ).all()
        
        return [self._serialize_product(p) for p in products]
```

### 3. API 엔드포인트 구현 (app/routers/recommendations.py)

```python
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from app.database import get_db
from app.services.recommendation_engine import RecommendationEngine
from app.services.welcome_set_service import WelcomeSetService
from app.auth import get_current_user_optional, get_current_user
from app.schemas.recommendation import (
    MainRecommendationResponse,
    WelcomeSetResponse,
    ProductRecommendation
)
import redis

router = APIRouter(prefix="/api/v1/recommendations", tags=["recommendations"])

redis_client = redis.Redis(host='localhost', port=6379, db=0)

@router.get("/main", response_model=MainRecommendationResponse)
async def get_main_recommendations(
    limit: int = Query(12, ge=1, le=50),
    category: Optional[str] = Query(None, description="카테고리 필터"),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user_optional)
):
    """
    메인 화면 큐레이션 추천 API
    - 로그인 사용자: 피부타입 기반 개인화 추천
    - 게스트: 전체 인기 제품 (별점+리뷰 기반)
    """
    engine = RecommendationEngine(db, redis_client)
    
    if current_user and current_user.profile and current_user.profile.skin_type:
        # 로그인 사용자: 피부타입 기반 추천
        skin_type = current_user.profile.skin_type
        recommendations = engine.get_main_recommendations(
            skin_type=skin_type,
            category=category,
            limit=limit
        )
        return MainRecommendationResponse(
            skin_type=skin_type,
            is_personalized=True,
            recommendations=recommendations,
            cache_ttl=86400
        )
    else:
        # 게스트: 인기 제품
        recommendations = engine.get_popular_products(
            category=category,
            limit=limit
        )
        return MainRecommendationResponse(
            skin_type=None,
            is_personalized=False,
            recommendations=recommendations,
            cache_ttl=3600
        )

@router.get("/welcome-set", response_model=List[WelcomeSetResponse])
async def get_welcome_set(
    price_tier: Optional[str] = Query(None, regex="^(low|mid|high)$"),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    가입 직후 추천 세트 API (로그인 필수)
    - 피부타입별 사전 큐레이션 3종 세트 반환
    - price_tier 미지정 시 저가/중가/고가 각 1개
    """
    if not current_user.profile or not current_user.profile.skin_type:
        raise HTTPException(
            status_code=400, 
            detail="피부타입 진단을 먼저 완료해주세요."
        )
    
    skin_type = current_user.profile.skin_type
    service = WelcomeSetService(db)
    
    sets = service.get_welcome_sets(
        skin_type=skin_type,
        price_tier=price_tier
    )
    
    if not sets:
        raise HTTPException(
            status_code=404,
            detail=f"{skin_type} 타입에 대한 추천 세트가 아직 준비되지 않았습니다."
        )
    
    return sets
```

### 4. Pydantic 스키마 정의 (app/schemas/recommendation.py)

```python
from pydantic import BaseModel
from typing import List, Optional

class ProductRecommendation(BaseModel):
    id: int
    name: str
    brand: str
    category: str
    image_url: Optional[str]
    current_price: int
    original_price: Optional[int]
    discount_rate: Optional[int]
    rating: float
    review_count: int
    matching_score: float
    matching_tags: List[str]
    volume_ml: Optional[int]

class MainRecommendationResponse(BaseModel):
    skin_type: Optional[str]
    is_personalized: bool
    recommendations: List[ProductRecommendation]
    cache_ttl: int

class WelcomeSetProduct(BaseModel):
    id: int
    name: str
    brand: str
    category: str
    image_url: Optional[str]
    current_price: int
    matching_percentage: Optional[int]

class WelcomeSetResponse(BaseModel):
    set_id: int
    set_name: str
    skin_type: str
    price_tier: str
    total_price: int
    products: List[WelcomeSetProduct]
    categories: List[str]
    description: Optional[str]
```

### 5. Redis 캐싱 구성

#### 5.1 캐시 키 구조
- 메인 추천: `recommendations:main:{skin_type}:{category}` (TTL: 24시간)
- 환영 세트: `recommendations:welcome:{skin_type}` (TTL: 24시간)
- 인기 제품: `recommendations:popular:{category}` (TTL: 1시간)

#### 5.2 캐시 무효화 트리거
- 제품 가격/별점 업데이트 시
- admin_curated_sets 수정 시
- skin_type_recommendation_rules 수정 시

### 6. 8타입 추천 성분 룰 초기 데이터

```sql
INSERT INTO skin_type_recommendation_rules (skin_type, recommended_tags, avoid_tags) VALUES
('ondalsam', '["균형보습", "항산화", "가벼운유분", "비타민"]', '[]'),
('mulgae', '["피지조절", "모공케어", "산뜻함", "BHA"]', '["과도한유분", "리치텍스처"]'),
('subuji', '["수분공급", "가벼운보습", "피지조절"]', '["무거운오일"]'),
('hwasan', '["진정", "카밍", "약산성", "저자극"]', '["알코올", "인공향료", "강한계면활성제"]'),
('samak', '["고보습", "오일", "세라마이드", "장벽강화"]', '["알코올", "수렴성분"]'),
('injeolmi', '["보습", "영양", "탄력"]', '[]'),
('yuriguseul', '["저자극", "무향", "진정", "시카"]', '["알코올", "인공색소", "방부제"]'),
('memilmuk', '["미백", "비타민C", "나이아신아마이드", "각질케어"]', '["강한자극성분"]');
```

**Test Strategy:**

## 테스트 전략

### 1. 유닛 테스트

#### 1.1 추천 점수 계산 테스트
```python
def test_calculate_product_score_basic():
    """기본 점수 계산 검증"""
    engine = RecommendationEngine(mock_db, mock_redis)
    product = create_mock_product(rating=4.5, review_count=100)
    recommended_tags = ["보습", "진정"]
    brand_counts = {}
    
    score = engine.calculate_product_score(product, recommended_tags, brand_counts)
    
    assert 0 <= score <= 1.0
    assert score > 0.5  # 좋은 평점과 리뷰가 있는 제품

def test_brand_diversity_penalty():
    """동일 브랜드 다양성 페널티 검증"""
    engine = RecommendationEngine(mock_db, mock_redis)
    product = create_mock_product(brand="BrandA")
    brand_counts = {"BrandA": 2}
    
    score_with_penalty = engine.calculate_product_score(product, [], brand_counts)
    
    brand_counts_empty = {}
    score_no_penalty = engine.calculate_product_score(product, [], brand_counts_empty)
    
    assert score_no_penalty > score_with_penalty
```

#### 1.2 후보 필터링 테스트
```python
def test_filter_candidates_includes_recommended():
    """추천 태그 포함 제품 필터링"""
    candidates = engine.filter_candidates(
        category="스킨",
        recommended_tags=["보습", "진정"],
        avoid_tags=["알코올"]
    )
    
    for product in candidates:
        product_tags = get_product_tags(product.id)
        assert any(tag in recommended_tags for tag in product_tags)
        assert "알코올" not in product_tags

def test_filter_excludes_avoid_tags():
    """주의 태그 제품 제외 검증"""
    candidates = engine.filter_candidates(
        category=None,
        recommended_tags=[],
        avoid_tags=["알코올", "인공향료"]
    )
    
    for product in candidates:
        product_tags = get_product_tags(product.id)
        assert not any(tag in ["알코올", "인공향료"] for tag in product_tags)
```

#### 1.3 브랜드 다양성 제한 테스트
```python
def test_brand_limit_max_two():
    """동일 브랜드 최대 2개 제한 검증"""
    recommendations = engine.get_main_recommendations(
        skin_type="ondalsam",
        limit=12
    )
    
    brand_counts = {}
    for rec in recommendations:
        brand = rec["brand"]
        brand_counts[brand] = brand_counts.get(brand, 0) + 1
    
    for brand, count in brand_counts.items():
        assert count <= 2, f"브랜드 {brand}가 {count}개로 제한 초과"
```

### 2. 통합 테스트

#### 2.1 메인 추천 API 테스트
```python
@pytest.mark.asyncio
async def test_main_recommendations_authenticated():
    """로그인 사용자 메인 추천 테스트"""
    # 피부타입이 있는 사용자 토큰
    token = create_test_token(user_id=1, skin_type="hwasan")
    
    response = await client.get(
        "/api/v1/recommendations/main?limit=12",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["is_personalized"] == True
    assert data["skin_type"] == "hwasan"
    assert len(data["recommendations"]) <= 12
    
    # 화산 타입에 맞는 추천인지 확인 (진정, 카밍 태그 포함 제품)
    for rec in data["recommendations"]:
        assert "알코올" not in rec.get("matching_tags", [])

@pytest.mark.asyncio
async def test_main_recommendations_guest():
    """게스트 메인 추천 테스트 (인기 제품)"""
    response = await client.get("/api/v1/recommendations/main?limit=12")
    
    assert response.status_code == 200
    data = response.json()
    assert data["is_personalized"] == False
    assert data["skin_type"] is None
    assert len(data["recommendations"]) > 0
```

#### 2.2 환영 세트 API 테스트
```python
@pytest.mark.asyncio
async def test_welcome_set_authenticated():
    """환영 세트 조회 테스트"""
    token = create_test_token(user_id=1, skin_type="ondalsam")
    
    response = await client.get(
        "/api/v1/recommendations/welcome-set",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 200
    sets = response.json()
    assert len(sets) >= 1
    
    for s in sets:
        assert s["skin_type"] == "ondalsam"
        assert s["price_tier"] in ["low", "mid", "high"]
        assert len(s["products"]) == 3  # 기본 3종 세트

@pytest.mark.asyncio
async def test_welcome_set_requires_auth():
    """환영 세트 인증 필수 확인"""
    response = await client.get("/api/v1/recommendations/welcome-set")
    assert response.status_code == 401

@pytest.mark.asyncio
async def test_welcome_set_requires_skin_type():
    """피부타입 미완료 시 에러"""
    token = create_test_token(user_id=2, skin_type=None)
    
    response = await client.get(
        "/api/v1/recommendations/welcome-set",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 400
    assert "피부타입 진단" in response.json()["detail"]
```

### 3. 캐싱 테스트

#### 3.1 Redis 캐싱 동작 테스트
```python
def test_recommendations_cached():
    """추천 결과 캐싱 확인"""
    # 첫 호출
    result1 = engine.get_main_recommendations("ondalsam", limit=12)
    
    # 캐시 키 확인
    cache_key = "recommendations:main:ondalsam:all"
    cached_data = redis_client.get(cache_key)
    assert cached_data is not None
    
    # TTL 확인 (24시간 = 86400초)
    ttl = redis_client.ttl(cache_key)
    assert ttl > 86000

def test_cache_hit_performance():
    """캐시 히트 시 성능 테스트"""
    import time
    
    # 첫 호출 (캐시 미스)
    start = time.time()
    engine.get_main_recommendations("ondalsam", limit=12)
    first_call = time.time() - start
    
    # 두 번째 호출 (캐시 히트)
    start = time.time()
    engine.get_main_recommendations("ondalsam", limit=12)
    second_call = time.time() - start
    
    assert second_call < first_call * 0.1  # 캐시 히트가 10배 이상 빠름
```

### 4. 성능 테스트

#### 4.1 응답 시간 테스트
```python
@pytest.mark.asyncio
async def test_main_recommendations_response_time():
    """메인 추천 응답 시간 2초 이내"""
    import time
    
    token = create_test_token(user_id=1, skin_type="ondalsam")
    
    # 캐시 비우기
    redis_client.flushdb()
    
    start = time.time()
    response = await client.get(
        "/api/v1/recommendations/main?limit=12",
        headers={"Authorization": f"Bearer {token}"}
    )
    elapsed = time.time() - start
    
    assert response.status_code == 200
    assert elapsed < 2.0, f"응답 시간 {elapsed:.2f}초가 목표(2초) 초과"
```

### 5. 데이터 검증 테스트

#### 5.1 8타입 추천 룰 커버리지
```python
def test_all_skin_types_have_rules():
    """모든 8타입에 추천 룰이 정의되어 있는지 확인"""
    skin_types = [
        "ondalsam", "mulgae", "subuji", "hwasan",
        "samak", "injeolmi", "yuriguseul", "memilmuk"
    ]
    
    for skin_type in skin_types:
        rules = engine.get_recommendation_rules(skin_type)
        assert len(rules["recommended_tags"]) >= 3, f"{skin_type} 추천 태그 부족"

def test_curated_sets_coverage():
    """피부타입×가격대 = 24개 이상 큐레이션 세트 확인"""
    sets = db.query(AdminCuratedSet).filter(
        AdminCuratedSet.is_active == True
    ).all()
    
    coverage = {}
    for s in sets:
        key = f"{s.skin_type}:{s.price_tier}"
        coverage[key] = coverage.get(key, 0) + 1
    
    assert len(coverage) >= 24
```

## Subtasks

### 14.1. 추천 관련 데이터베이스 스키마 설계 및 마이그레이션 작성

**Status:** pending  
**Dependencies:** None  

skin_type_recommendation_rules, admin_curated_sets, recommendation_cache 테이블의 SQLAlchemy 모델과 Alembic 마이그레이션 파일을 작성합니다.

**Details:**

PRD v1.8 F3 요구사항에 따라 추천 엔진에 필요한 3개의 핵심 테이블을 정의합니다:

1. skin_type_recommendation_rules 테이블:
- skin_type(VARCHAR 20, UNIQUE): 8가지 피부타입(ondalsam, mulgae, subuji, hwasan, samak, injeolmi, yuriguseul, memilmuk)
- recommended_tags(JSONB): 추천 성분 태그 배열
- avoid_tags(JSONB): 주의 성분 태그 배열
- priority(INT), is_active(BOOLEAN)
- created_at, updated_at 타임스탬프

2. admin_curated_sets 테이블:
- skin_type, set_name, product_ids(JSONB)
- price_tier(ENUM: low, mid, high)
- categories(JSONB), description(TEXT)
- is_active(BOOLEAN)

3. recommendation_cache 테이블:
- cache_key(VARCHAR 255 PK)
- recommendations(JSONB)
- expires_at(TIMESTAMP)

SQLAlchemy ORM 모델을 app/models/recommendation.py에 작성하고, skin_type ENUM 타입과 적절한 인덱스(skin_type, is_active)를 포함합니다.

### 14.2. 8가지 피부타입별 추천/주의 성분 규칙 초기 데이터 시딩

**Status:** pending  
**Dependencies:** 14.1  

skin_type_recommendation_rules 테이블에 8가지 피부타입별 추천 성분 태그와 주의 성분 태그 초기 데이터를 삽입하는 시드 스크립트를 작성합니다.

**Details:**

PRD v1.8에 정의된 8가지 피부타입별 성분 규칙을 데이터베이스에 삽입합니다:

1. ondalsam(옹달샘): recommended=["균형보습", "항산화", "가벼운유분", "비타민"], avoid=[]
2. mulgae(물개): recommended=["피지조절", "모공케어", "산뜻함", "BHA"], avoid=["과도한유분", "리치텍스처"]
3. subuji(수부지): recommended=["수분공급", "가벼운보습", "피지조절"], avoid=["무거운오일"]
4. hwasan(화산): recommended=["진정", "카밍", "약산성", "저자극"], avoid=["알코올", "인공향료", "강한계면활성제"]
5. samak(사막): recommended=["고보습", "오일", "세라마이드", "장벽강화"], avoid=["알코올", "수렴성분"]
6. injeolmi(인절미): recommended=["보습", "영양", "탄력"], avoid=[]
7. yuriguseul(유리구슬): recommended=["저자극", "무향", "진정", "시카"], avoid=["알코올", "인공색소", "방부제"]
8. memilmuk(메밀묵): recommended=["미백", "비타민C", "나이아신아마이드", "각질케어"], avoid=["강한자극성분"]

app/scripts/seed_recommendation_rules.py에 시드 스크립트 작성, python app/scripts/seed_recommendation_rules.py로 실행 가능하게 구성

### 14.3. 추천 점수 계산 알고리즘 구현 (RecommendationEngine 핵심 로직)

**Status:** pending  
**Dependencies:** 14.1, 14.2  

제품의 추천 점수를 계산하는 핵심 알고리즘을 구현합니다. 매칭 성분(0.4) + 별점(0.3) + 리뷰 수 로그(0.2) + 브랜드 다양성(0.1) 가중치 공식을 적용합니다.

**Details:**

app/services/recommendation_engine.py에 RecommendationEngine 클래스를 구현합니다:

1. calculate_product_score(product, recommended_tags, brand_counts) -> float:
   - matching_score(0.4): 제품 성분 중 추천 태그 매칭 수 / 5.0 (최대 5개 기준)
   - rating_score(0.3): 제품 평균 별점 / 5.0
   - review_score(0.2): min(log10(review_count + 1) / 4.0, 1.0) - 로그 스케일
   - diversity_score(0.1): 브랜드 중복 시 0.05씩 감점
   - 최종 점수 = 4개 점수의 합계

2. _count_matching_ingredients(product_id, recommended_tags) -> int:
   - product_ingredients 테이블과 ingredient_dictionary 테이블 JOIN
   - ingredient_dictionary.function_tags와 recommended_tags 매칭 수 반환

3. filter_candidates(category, recommended_tags, avoid_tags) -> List[Product]:
   - is_available=True 필터
   - 카테고리 필터 (선택적)
   - avoid_tags에 해당하는 성분 포함 제품 제외
   - 추천 태그 1개 이상 포함 제품만 선택

타입 힌트, docstring, 로깅 포함

### 14.4. Redis 캐싱 레이어 구현 (TTL 24시간)

**Status:** pending  
**Dependencies:** 14.3  

추천 결과를 Redis에 캐싱하고 조회하는 캐시 레이어를 구현합니다. 캐시 키 구조 설계와 TTL 24시간 설정을 포함합니다.

**Details:**

app/services/cache_service.py에 RecommendationCache 클래스를 구현합니다:

1. 캐시 키 구조 설계:
   - 메인 추천: 'recommendations:main:{skin_type}:{category}' (category가 null이면 'all')
   - 환영 세트: 'recommendations:welcome:{skin_type}:{price_tier}'
   - 인기 제품: 'recommendations:popular:{category}'

2. 메서드 구현:
   - get_cache(cache_key: str) -> Optional[List[Dict]]
   - set_cache(cache_key: str, data: List[Dict], ttl: int = 86400)
   - invalidate_cache(pattern: str) - 와일드카드 패턴 삭제
   - build_cache_key(prefix: str, **kwargs) -> str

3. Redis 설정:
   - REDIS_URL 환경변수 사용 (기본: localhost:6379)
   - 연결 풀링 적용
   - JSON 직렬화/역직렬화 처리

4. 캐시 무효화 트리거 (훅 포인트):
   - 제품 가격/별점 업데이트 시
   - admin_curated_sets 수정 시
   - skin_type_recommendation_rules 수정 시

redis-py 라이브러리 사용, 예외 처리(Redis 장애 시 DB 폴백) 포함

### 14.5. GET /api/v1/recommendations/main API 엔드포인트 구현

**Status:** pending  
**Dependencies:** 14.3, 14.4  

메인 화면 큐레이션 추천 API를 구현합니다. 로그인 사용자는 피부타입 기반 개인화 추천, 게스트는 인기 제품을 반환합니다.

**Details:**

app/routers/recommendations.py에 메인 추천 API를 구현합니다:

1. 엔드포인트: GET /api/v1/recommendations/main
   - Query params: limit(int, 기본 12, 최대 50), category(str, 선택적)
   - Response: MainRecommendationResponse 스키마

2. 로그인 사용자 플로우:
   - get_current_user_optional으로 인증 확인
   - user.profile.skin_type 조회
   - RecommendationEngine.get_main_recommendations(skin_type, category, limit) 호출
   - is_personalized=True, cache_ttl=86400 반환

3. 게스트 플로우:
   - get_popular_products(category, limit) 호출 (별점+리뷰 기반)
   - is_personalized=False, cache_ttl=3600 반환

4. 응답 스키마 (app/schemas/recommendation.py):
   - MainRecommendationResponse: skin_type, is_personalized, recommendations[], cache_ttl
   - ProductRecommendation: id, name, brand, category, image_url, current_price, original_price, discount_rate, rating, review_count, matching_score, matching_tags[], volume_ml

5. 동일 브랜드 최대 2개 제한 로직 포함

### 14.6. 환영 세트 서비스 및 admin_curated_sets 데이터 관리

**Status:** pending  
**Dependencies:** 14.1  

admin_curated_sets 테이블 기반 환영 세트 조회 서비스를 구현하고, 피부타입별 저가/중가/고가 3종 세트 데이터를 관리합니다.

**Details:**

app/services/welcome_set_service.py에 WelcomeSetService 클래스를 구현합니다:

1. get_welcome_sets(skin_type: str, price_tier: Optional[str] = None) -> List[WelcomeSetResponse]:
   - skin_type + is_active=True 필터
   - price_tier 지정 시 해당 티어만, 미지정 시 각 티어별 1개씩 반환
   - product_ids로 제품 상세 정보 조회
   - 총 가격 계산 (sum of current_price)

2. _get_products_by_ids(product_ids: List[int]) -> List[WelcomeSetProduct]:
   - IN 쿼리로 제품 목록 조회
   - 순서 유지 (product_ids 순서대로)

3. 응답 스키마:
   - WelcomeSetResponse: set_id, set_name, skin_type, price_tier, total_price, products[], categories[], description
   - WelcomeSetProduct: id, name, brand, category, image_url, current_price, matching_percentage

4. 샘플 데이터 시딩:
   - 8개 피부타입 × 3개 가격대 = 24개 세트 기본 데이터
   - app/scripts/seed_curated_sets.py 작성

제품 ID는 Task 2(제품 데이터)와 연동되어야 하므로 임시 제품 ID 사용 후 추후 수정

### 14.7. GET /api/v1/recommendations/welcome-set API 엔드포인트 구현

**Status:** pending  
**Dependencies:** 14.5, 14.6  

가입 직후 추천 세트 API를 구현합니다. 로그인 필수이며 피부타입이 없으면 에러를 반환합니다.

**Details:**

app/routers/recommendations.py에 환영 세트 API를 추가합니다:

1. 엔드포인트: GET /api/v1/recommendations/welcome-set
   - Query params: price_tier(str, 선택적, 값: low/mid/high)
   - Response: List[WelcomeSetResponse]
   - 인증: get_current_user (필수)

2. 비즈니스 로직:
   - 프로필 또는 skin_type이 없으면 400 에러: "피부타입 진단을 먼저 완료해주세요."
   - WelcomeSetService.get_welcome_sets(skin_type, price_tier) 호출
   - 결과가 없으면 404 에러: "{skin_type} 타입에 대한 추천 세트가 아직 준비되지 않았습니다."

3. 에러 응답 스키마:
   - HTTPException with detail message
   - 적절한 상태 코드 (400, 401, 404)

4. OpenAPI 문서화:
   - 태그: recommendations
   - 설명: 가입 직후 추천 세트 API (로그인 필수)
   - 응답 예시 포함

Redis 캐싱은 환영 세트에도 적용 (TTL 24시간)

### 14.8. 추천 API 전체 통합 테스트 및 성능 검증

**Status:** pending  
**Dependencies:** 14.5, 14.7  

구현된 추천 API의 전체 통합 테스트와 성능 검증을 수행합니다. E2E 시나리오, 캐시 효과, 응답 시간을 확인합니다.

**Details:**

tests/integration/test_recommendations.py에 통합 테스트 스위트를 작성합니다:

1. E2E 시나리오 테스트:
   - 회원가입 → QnA 제출 → 피부타입 결정 → 환영 세트 조회 → 메인 추천 조회
   - 게스트 플로우: 메인 추천 조회 (인기 제품)
   - 카테고리 필터링 동작

2. 점수 계산 정확성 검증:
   - 알려진 입력값에 대한 예상 점수 검증
   - 브랜드 다양성 페널티 동작 확인
   - 동일 브랜드 2개 제한 확인

3. 캐시 효과 테스트:
   - 첫 요청: 캐시 미스 → DB 조회
   - 두 번째 요청: 캐시 히트 → 빠른 응답
   - 캐시 무효화 후: 캐시 미스

4. 성능 테스트 (pytest-benchmark 또는 locust):
   - 메인 추천 API: 목표 2초 이내
   - 환영 세트 API: 목표 1초 이내
   - 동시 요청 10개 처리

5. 에지 케이스:
   - 제품이 없는 카테고리
   - 비활성화된 규칙만 있는 피부타입
   - Redis 장애 시 폴백

CI/CD 파이프라인에서 실행 가능하도록 구성
