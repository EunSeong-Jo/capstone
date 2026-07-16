# Task ID: 15

**Title:** 예산 기반 구매 가이드 개발

**Status:** pending

**Dependencies:** 14, 6

**Priority:** high

**Description:** PRD v1.8 F10(P1a) 요구사항에 따라 사용자 피부타입 프로필과 예산을 기반으로 최적의 화장품 조합을 추천하는 POST /api/v1/recommendations/budget API를 개발합니다. 그리디+빔서치 알고리즘으로 예산 내 최적 조합 1~3안을 탐색하고, 추천 사유를 자동 생성하며, Redis 캐싱(TTL 1시간)을 적용합니다.

**Details:**

## 구현 상세

### 1. 데이터베이스 스키마 구현

#### 1.1 budget_guide_history 테이블 (추천 이력)
```sql
CREATE TABLE budget_guide_history (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    budget INTEGER NOT NULL,                    -- 입력 예산 (원)
    categories JSONB NOT NULL,                  -- ["스킨", "로션", "에센스"]
    preferences JSONB,                          -- {"alcohol_free": true, "vegan": true}
    result_combinations JSONB NOT NULL,         -- 추천 1~3안 결과
    selected_combination_idx INTEGER,           -- 사용자 선택 안 인덱스 (0,1,2 또는 null)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_budget_guide_user ON budget_guide_history(user_id);
CREATE INDEX idx_budget_guide_created ON budget_guide_history(created_at DESC);
```

#### 1.2 API 요청/응답 스키마
```python
# Pydantic 스키마 정의 (schemas/recommendation.py)
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from enum import Enum

class CategoryEnum(str, Enum):
    SKIN = "스킨"
    LOTION = "로션"
    ESSENCE = "에센스"
    CREAM = "크림"
    SUNSCREEN = "선크림"
    CLEANSER = "클렌저"

class BudgetGuideRequest(BaseModel):
    budget: int = Field(..., ge=10000, le=1000000, description="예산 (원)")
    categories: List[CategoryEnum] = Field(..., min_items=1, max_items=6)
    preferences: Optional[Dict[str, bool]] = Field(
        default=None,
        description="선호 조건: alcohol_free, vegan, fragrance_free 등"
    )

class ProductInCombination(BaseModel):
    product_id: int
    product_name: str
    brand_name: str
    category: str
    price: int
    rating: float
    matching_tags: List[str]     # 피부타입 매칭 성분 태그
    image_url: Optional[str]
    purchase_links: List[Dict]   # [{"store": "올리브영", "url": "...", "price": 12000}]

class RecommendationCombination(BaseModel):
    combination_index: int       # 0, 1, 2
    products: List[ProductInCombination]
    total_price: int
    remaining_budget: int
    matching_score: float        # 0.0 ~ 1.0
    average_rating: float
    recommendation_reason: str   # 자동 생성 추천 사유
    budget_usage_ratio: float    # 예: 0.8 (80% 사용)

class BudgetGuideResponse(BaseModel):
    combinations: List[RecommendationCombination]  # 1~3안
    user_skin_type: str          # 예: "옹달샘"
    total_candidates_searched: int
    processing_time_ms: int
    cache_hit: bool
```

### 2. 예산 기반 추천 엔진 핵심 로직

#### 2.1 후보 추출 (카테고리별 상위 N=20개)
```python
# services/budget_recommendation_engine.py
from typing import List, Dict, Optional, Tuple
import redis
import json
import hashlib
from datetime import timedelta

class BudgetRecommendationEngine:
    def __init__(self, db, redis_client, profile_recommendation_engine):
        self.db = db
        self.redis = redis_client
        self.profile_engine = profile_recommendation_engine
        self.CANDIDATES_PER_CATEGORY = 20
        self.BEAM_WIDTH = 5
        self.CACHE_TTL = 3600  # 1시간

    async def get_category_candidates(
        self,
        skin_type: str,
        category: str,
        preferences: Optional[Dict[str, bool]],
        budget_limit: int
    ) -> List[Dict]:
        """
        카테고리별 후보 제품 추출 (프로필 추천 엔진 활용)
        - Task 14의 RecommendationEngine.calculate_product_score() 재사용
        - 예산 한도 내 제품만 필터링
        """
        # 1. skin_type_recommendation_rules에서 추천 태그 조회
        recommended_tags = await self._get_recommended_tags(skin_type)
        avoid_tags = await self._get_avoid_tags(skin_type)
        
        # 2. 카테고리 + 가격 필터 쿼리
        query = """
            SELECT p.id, p.name, p.brand, p.category, p.price, 
                   p.rating, p.review_count, p.ingredient_tags,
                   p.image_url
            FROM products p
            WHERE p.category = $1
              AND p.price <= $2
              AND p.rating >= 3.5  -- 소프트 제약
        """
        
        # 3. 선호 조건 필터 추가
        if preferences:
            if preferences.get("alcohol_free"):
                query += " AND NOT ('알코올' = ANY(p.avoid_tags))"
            if preferences.get("vegan"):
                query += " AND p.is_vegan = TRUE"
            if preferences.get("fragrance_free"):
                query += " AND p.is_fragrance_free = TRUE"
        
        query += " ORDER BY p.rating DESC, p.review_count DESC LIMIT $3"
        
        candidates = await self.db.fetch(query, category, budget_limit, 
                                         self.CANDIDATES_PER_CATEGORY * 2)
        
        # 4. 프로필 매칭 점수 계산 및 정렬
        scored_candidates = []
        for product in candidates:
            score = self._calculate_matching_score(
                product["ingredient_tags"],
                recommended_tags,
                avoid_tags,
                product["rating"]
            )
            scored_candidates.append({
                **dict(product),
                "matching_score": score,
                "matching_tags": self._get_matching_tags(
                    product["ingredient_tags"], recommended_tags
                )
            })
        
        # 매칭 점수 내림차순 정렬 후 상위 N개 반환
        scored_candidates.sort(key=lambda x: x["matching_score"], reverse=True)
        return scored_candidates[:self.CANDIDATES_PER_CATEGORY]

    def _calculate_matching_score(
        self,
        product_tags: List[str],
        recommended_tags: List[str],
        avoid_tags: List[str],
        rating: float
    ) -> float:
        """매칭 점수 계산 (0.0 ~ 1.0)"""
        # 추천 태그 매칭 비율 (60% 가중치)
        if recommended_tags:
            tag_match_ratio = len(set(product_tags) & set(recommended_tags)) / len(recommended_tags)
        else:
            tag_match_ratio = 0.5
        
        # 주의 태그 페널티 (있으면 -0.3)
        avoid_penalty = 0.3 if any(t in product_tags for t in avoid_tags) else 0.0
        
        # 별점 정규화 (20% 가중치, 3.5~5.0 → 0~1)
        rating_score = (rating - 3.5) / 1.5 if rating >= 3.5 else 0
        
        # 최종 점수
        score = (tag_match_ratio * 0.6) + (rating_score * 0.2) - avoid_penalty + 0.2
        return max(0.0, min(1.0, score))
```

#### 2.2 그리디 + 빔서치 조합 탐색
```python
    async def search_optimal_combinations(
        self,
        skin_type: str,
        budget: int,
        categories: List[str],
        preferences: Optional[Dict[str, bool]]
    ) -> List[Dict]:
        """
        그리디 + 빔서치로 예산 내 최적 조합 탐색
        - 빔 폭 = 5
        - 결과: 1~3안 (80%/60%/40% 예산 사용 다양성)
        """
        # 1. 카테고리별 후보 추출
        category_candidates = {}
        for cat in categories:
            category_candidates[cat] = await self.get_category_candidates(
                skin_type, cat, preferences, budget
            )
        
        # 2. 빔서치 초기화
        # 상태: (사용 예산, 매칭 점수 합, 선택된 제품 리스트)
        beams = [(0, 0.0, [])]  # [(used_budget, total_score, products)]
        
        # 3. 카테고리 순회하며 빔 확장
        for category in categories:
            next_beams = []
            
            for used_budget, total_score, products in beams:
                remaining = budget - used_budget
                
                for candidate in category_candidates[category]:
                    if candidate["price"] <= remaining:
                        new_used = used_budget + candidate["price"]
                        new_score = total_score + candidate["matching_score"]
                        new_products = products + [{
                            "product_id": candidate["id"],
                            "product_name": candidate["name"],
                            "brand_name": candidate["brand"],
                            "category": category,
                            "price": candidate["price"],
                            "rating": candidate["rating"],
                            "matching_tags": candidate["matching_tags"],
                            "image_url": candidate.get("image_url"),
                            "matching_score": candidate["matching_score"]
                        }]
                        
                        # 효율 점수: 매칭점수 / 사용예산 비율
                        efficiency = new_score / (new_used / 10000) if new_used > 0 else 0
                        next_beams.append((new_used, new_score, new_products, efficiency))
            
            # 빔 폭 유지: 효율 점수 상위 K개만 유지
            next_beams.sort(key=lambda x: x[3], reverse=True)  # efficiency 기준
            beams = [(b[0], b[1], b[2]) for b in next_beams[:self.BEAM_WIDTH]]
        
        # 4. 최종 1~3안 선택 (가격 다양성 확보)
        return self._select_diverse_combinations(beams, budget, categories)

    def _select_diverse_combinations(
        self,
        beams: List[Tuple],
        budget: int,
        categories: List[str]
    ) -> List[Dict]:
        """
        가격 다양성을 고려한 1~3안 선택
        - 80% 예산 사용 안 (고가)
        - 60% 예산 사용 안 (중가)
        - 40% 예산 사용 안 (저가)
        """
        target_ratios = [0.8, 0.6, 0.4]
        selected = []
        used_product_sets = set()
        
        for target_ratio in target_ratios:
            target_budget = budget * target_ratio
            best_match = None
            best_diff = float('inf')
            
            for used_budget, total_score, products in beams:
                # 모든 카테고리 포함 확인
                product_categories = set(p["category"] for p in products)
                if product_categories != set(categories):
                    continue
                
                # 중복 조합 방지
                product_ids = tuple(sorted(p["product_id"] for p in products))
                if product_ids in used_product_sets:
                    continue
                
                diff = abs(used_budget - target_budget)
                if diff < best_diff and total_score > 0:
                    best_diff = diff
                    best_match = (used_budget, total_score, products)
            
            if best_match:
                used_budget, total_score, products = best_match
                selected.append({
                    "combination_index": len(selected),
                    "products": products,
                    "total_price": used_budget,
                    "remaining_budget": budget - used_budget,
                    "matching_score": total_score / len(products),
                    "average_rating": sum(p["rating"] for p in products) / len(products),
                    "budget_usage_ratio": used_budget / budget
                })
                product_ids = tuple(sorted(p["product_id"] for p in products))
                used_product_sets.add(product_ids)
        
        return selected
```

#### 2.3 추천 사유 자동 생성
```python
    def generate_recommendation_reason(
        self,
        combination: Dict,
        skin_type: str,
        recommended_tags: List[str]
    ) -> str:
        """추천 사유 자동 생성"""
        products = combination["products"]
        all_matching_tags = set()
        for p in products:
            all_matching_tags.update(p["matching_tags"])
        
        matched_count = len(all_matching_tags & set(recommended_tags))
        total_recommended = len(recommended_tags)
        
        # 피부타입 한글명 매핑
        skin_type_names = {
            "ondalsam": "옹달샘",
            "mulgae": "물개",
            "subuji": "수부지",
            "hwasan": "화산",
            "samak": "사막",
            "injeolmi": "인절미",
            "yuriguseul": "유리구슬",
            "memilmuk": "메밀묵"
        }
        type_name = skin_type_names.get(skin_type, skin_type)
        
        # 추천 사유 템플릿
        reason_parts = []
        
        if matched_count >= total_recommended * 0.7:
            reason_parts.append(f"{type_name} 타입에 맞는 핵심 성분 {matched_count}종을 충족합니다")
        elif matched_count >= total_recommended * 0.5:
            reason_parts.append(f"{type_name} 타입 추천 성분 중 {matched_count}종이 포함되어 있습니다")
        
        avg_rating = combination["average_rating"]
        if avg_rating >= 4.5:
            reason_parts.append("높은 사용자 만족도를 기록한 제품들입니다")
        elif avg_rating >= 4.0:
            reason_parts.append("안정적인 평점의 제품 조합입니다")
        
        remaining = combination["remaining_budget"]
        if remaining >= 10000:
            reason_parts.append(f"잔여 예산 {remaining:,}원으로 선크림 추가를 고려해보세요")
        
        return ". ".join(reason_parts) if reason_parts else "예산 내 최적 조합입니다"
```

### 3. API 엔드포인트 구현

```python
# routers/recommendations.py
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
import time

router = APIRouter(prefix="/api/v1/recommendations", tags=["recommendations"])

@router.post("/budget", response_model=BudgetGuideResponse)
async def get_budget_guide(
    request: BudgetGuideRequest,
    current_user = Depends(get_current_user),
    db = Depends(get_db),
    redis_client = Depends(get_redis)
):
    """
    예산 기반 구매 가이드 API
    - 사용자 프로필(피부타입) + 예산 + 카테고리로 최적 조합 추천
    - Redis 캐싱 (TTL 1시간)
    """
    start_time = time.time()
    
    # 1. 사용자 피부타입 조회
    user_profile = await db.fetchrow(
        "SELECT skin_type FROM user_profiles WHERE user_id = $1",
        current_user.id
    )
    if not user_profile or not user_profile["skin_type"]:
        raise HTTPException(status_code=400, detail="피부타입 진단을 먼저 완료해주세요")
    
    skin_type = user_profile["skin_type"]
    
    # 2. 캐시 키 생성 및 조회
    cache_key = _generate_cache_key(
        current_user.id, request.budget, 
        request.categories, request.preferences
    )
    cached = await redis_client.get(cache_key)
    if cached:
        response = BudgetGuideResponse(**json.loads(cached))
        response.cache_hit = True
        response.processing_time_ms = int((time.time() - start_time) * 1000)
        return response
    
    # 3. 추천 엔진 실행
    engine = BudgetRecommendationEngine(db, redis_client, profile_engine)
    
    categories = [cat.value for cat in request.categories]
    combinations = await engine.search_optimal_combinations(
        skin_type=skin_type,
        budget=request.budget,
        categories=categories,
        preferences=request.preferences
    )
    
    if not combinations:
        raise HTTPException(
            status_code=404, 
            detail="입력하신 예산과 조건에 맞는 조합을 찾지 못했습니다"
        )
    
    # 4. 추천 사유 생성
    recommended_tags = await engine._get_recommended_tags(skin_type)
    for combo in combinations:
        combo["recommendation_reason"] = engine.generate_recommendation_reason(
            combo, skin_type, recommended_tags
        )
        # 구매 링크 추가
        for product in combo["products"]:
            product["purchase_links"] = await _get_purchase_links(
                db, product["product_id"]
            )
    
    # 5. 응답 생성 및 캐싱
    processing_time = int((time.time() - start_time) * 1000)
    response = BudgetGuideResponse(
        combinations=[RecommendationCombination(**c) for c in combinations],
        user_skin_type=skin_type,
        total_candidates_searched=len(categories) * engine.CANDIDATES_PER_CATEGORY,
        processing_time_ms=processing_time,
        cache_hit=False
    )
    
    # Redis 캐싱 (TTL 1시간)
    await redis_client.setex(
        cache_key, 
        engine.CACHE_TTL, 
        json.dumps(response.dict())
    )
    
    # 6. 이력 저장
    await db.execute("""
        INSERT INTO budget_guide_history 
        (user_id, budget, categories, preferences, result_combinations)
        VALUES ($1, $2, $3, $4, $5)
    """, current_user.id, request.budget, 
        json.dumps(categories), 
        json.dumps(request.preferences) if request.preferences else None,
        json.dumps([c.dict() for c in response.combinations])
    )
    
    return response

def _generate_cache_key(
    user_id: str, budget: int, 
    categories: List, preferences: Optional[Dict]
) -> str:
    """결정적(deterministic) 캐시 키 생성"""
    data = {
        "user_id": str(user_id),
        "budget": budget,
        "categories": sorted([c.value for c in categories]),
        "preferences": sorted(preferences.items()) if preferences else None
    }
    return f"budget_guide:{hashlib.md5(json.dumps(data, sort_keys=True).encode()).hexdigest()}"

async def _get_purchase_links(db, product_id: int) -> List[Dict]:
    """product_prices 테이블에서 구매 링크 조회"""
    links = await db.fetch("""
        SELECT store_name, price, purchase_url, collected_at
        FROM product_prices
        WHERE product_id = $1
        ORDER BY price ASC
        LIMIT 3
    """, product_id)
    return [{"store": l["store_name"], "url": l["purchase_url"], "price": l["price"]} for l in links]
```

### 4. 성능 최적화

#### 4.1 빔서치 가지치기 조건
```python
def _should_prune(self, used_budget: int, budget: int, score: float, products: List) -> bool:
    """가지치기 조건"""
    # 예산 초과
    if used_budget > budget:
        return True
    
    # 별점 페널티가 큰 경우 (평균 3.5 미만)
    if products:
        avg_rating = sum(p["rating"] for p in products) / len(products)
        if avg_rating < 3.5:
            return True
    
    return False
```

#### 4.2 인덱스 최적화
```sql
-- 카테고리 + 가격 범위 조회 최적화
CREATE INDEX idx_products_category_price ON products(category, price);
CREATE INDEX idx_products_category_rating ON products(category, rating DESC);

-- 프로필 타입별 추천 규칙 조회
CREATE INDEX idx_skin_type_rules ON skin_type_recommendation_rules(skin_type) WHERE is_active = TRUE;
```

### 5. 프론트엔드 연동 포인트

#### 5.1 UI 흐름
1. 메인 화면 "예산으로 구매 가이드 받기" 버튼
2. 예산 입력 (슬라이더 또는 직접 입력)
3. 카테고리 다중 선택 (칩 UI)
4. 선호 조건 토글 (무알코올, 비건 등) - 옵션
5. 추천 조합 1~3안 카드 표시
6. 각 안 클릭 시 상세 비교
7. "외부 쇼핑몰로 이동" → 판매처별 일괄 이동

**Test Strategy:**

## 테스트 전략

### 1. 유닛 테스트

#### 1.1 매칭 점수 계산 테스트
```python
def test_calculate_matching_score_full_match():
    """모든 추천 태그 매칭 시 높은 점수"""
    engine = BudgetRecommendationEngine(mock_db, mock_redis, mock_profile_engine)
    score = engine._calculate_matching_score(
        product_tags=["보습", "진정", "항산화"],
        recommended_tags=["보습", "진정", "항산화"],
        avoid_tags=["알코올"],
        rating=4.5
    )
    assert 0.7 <= score <= 1.0

def test_calculate_matching_score_with_avoid_penalty():
    """주의 성분 포함 시 페널티 적용"""
    engine = BudgetRecommendationEngine(mock_db, mock_redis, mock_profile_engine)
    score = engine._calculate_matching_score(
        product_tags=["보습", "알코올"],
        recommended_tags=["보습", "진정"],
        avoid_tags=["알코올"],
        rating=4.0
    )
    assert score < 0.5  # 페널티로 낮은 점수

def test_calculate_matching_score_low_rating():
    """별점 3.5 미만 시 점수 감소"""
    engine = BudgetRecommendationEngine(mock_db, mock_redis, mock_profile_engine)
    score = engine._calculate_matching_score(
        product_tags=["보습"],
        recommended_tags=["보습"],
        avoid_tags=[],
        rating=3.0
    )
    assert score < 0.6
```

#### 1.2 빔서치 조합 탐색 테스트
```python
@pytest.mark.asyncio
async def test_search_optimal_combinations_returns_multiple_options():
    """1~3개 다양한 예산 사용률의 조합 반환"""
    engine = BudgetRecommendationEngine(mock_db, mock_redis, mock_profile_engine)
    combinations = await engine.search_optimal_combinations(
        skin_type="ondalsam",
        budget=100000,
        categories=["스킨", "로션", "에센스"],
        preferences=None
    )
    assert 1 <= len(combinations) <= 3
    
    # 예산 사용률 다양성 확인
    ratios = [c["budget_usage_ratio"] for c in combinations]
    if len(ratios) >= 2:
        assert ratios[0] > ratios[1]  # 내림차순

@pytest.mark.asyncio
async def test_search_combinations_respects_budget():
    """모든 조합이 예산 이내"""
    engine = BudgetRecommendationEngine(mock_db, mock_redis, mock_profile_engine)
    combinations = await engine.search_optimal_combinations(
        skin_type="hwasan",
        budget=50000,
        categories=["스킨", "로션"],
        preferences=None
    )
    for combo in combinations:
        assert combo["total_price"] <= 50000

@pytest.mark.asyncio
async def test_search_combinations_includes_all_categories():
    """모든 요청 카테고리가 조합에 포함"""
    engine = BudgetRecommendationEngine(mock_db, mock_redis, mock_profile_engine)
    categories = ["스킨", "에센스", "크림"]
    combinations = await engine.search_optimal_combinations(
        skin_type="samak",
        budget=150000,
        categories=categories,
        preferences=None
    )
    for combo in combinations:
        combo_categories = set(p["category"] for p in combo["products"])
        assert combo_categories == set(categories)
```

#### 1.3 추천 사유 생성 테스트
```python
def test_generate_recommendation_reason_high_match():
    """높은 매칭률 시 적절한 사유 생성"""
    engine = BudgetRecommendationEngine(mock_db, mock_redis, mock_profile_engine)
    combination = {
        "products": [
            {"matching_tags": ["보습", "진정"], "rating": 4.5},
            {"matching_tags": ["보습", "항산화"], "rating": 4.3}
        ],
        "average_rating": 4.4,
        "remaining_budget": 15000
    }
    reason = engine.generate_recommendation_reason(
        combination, "ondalsam", ["보습", "진정", "항산화"]
    )
    assert "옹달샘" in reason
    assert "성분" in reason or "충족" in reason

def test_generate_recommendation_reason_with_remaining_budget():
    """잔여 예산 안내 포함"""
    engine = BudgetRecommendationEngine(mock_db, mock_redis, mock_profile_engine)
    combination = {
        "products": [{"matching_tags": ["보습"], "rating": 4.0}],
        "average_rating": 4.0,
        "remaining_budget": 25000
    }
    reason = engine.generate_recommendation_reason(
        combination, "mulgae", ["살리실산", "논코메도제닉"]
    )
    assert "잔여 예산" in reason or "25,000" in reason
```

### 2. 통합 테스트

#### 2.1 API 엔드포인트 테스트
```python
@pytest.mark.asyncio
async def test_budget_guide_api_success(test_client, auth_headers, test_user_with_profile):
    """정상 요청 시 1~3개 조합 반환"""
    response = await test_client.post(
        "/api/v1/recommendations/budget",
        json={
            "budget": 100000,
            "categories": ["스킨", "로션", "에센스"]
        },
        headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert 1 <= len(data["combinations"]) <= 3
    assert data["user_skin_type"] is not None
    assert data["processing_time_ms"] > 0

@pytest.mark.asyncio
async def test_budget_guide_api_with_preferences(test_client, auth_headers):
    """선호 조건 적용 테스트"""
    response = await test_client.post(
        "/api/v1/recommendations/budget",
        json={
            "budget": 80000,
            "categories": ["스킨", "에센스"],
            "preferences": {"alcohol_free": True, "vegan": True}
        },
        headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    # 결과 제품들이 선호 조건 충족하는지 별도 검증 필요

@pytest.mark.asyncio
async def test_budget_guide_api_without_profile(test_client, auth_headers_no_profile):
    """피부타입 미진단 사용자 오류 처리"""
    response = await test_client.post(
        "/api/v1/recommendations/budget",
        json={"budget": 50000, "categories": ["스킨"]},
        headers=auth_headers_no_profile
    )
    assert response.status_code == 400
    assert "피부타입 진단" in response.json()["detail"]

@pytest.mark.asyncio
async def test_budget_guide_api_invalid_budget(test_client, auth_headers):
    """예산 범위 초과 시 validation 오류"""
    response = await test_client.post(
        "/api/v1/recommendations/budget",
        json={"budget": 5000, "categories": ["스킨"]},  # 최소 10000
        headers=auth_headers
    )
    assert response.status_code == 422
```

#### 2.2 Redis 캐싱 테스트
```python
@pytest.mark.asyncio
async def test_budget_guide_caching(test_client, auth_headers, redis_client):
    """동일 요청 캐시 히트 확인"""
    request_body = {
        "budget": 100000,
        "categories": ["스킨", "로션"]
    }
    
    # 첫 번째 요청 (캐시 미스)
    response1 = await test_client.post(
        "/api/v1/recommendations/budget",
        json=request_body,
        headers=auth_headers
    )
    assert response1.json()["cache_hit"] == False
    
    # 두 번째 요청 (캐시 히트)
    response2 = await test_client.post(
        "/api/v1/recommendations/budget",
        json=request_body,
        headers=auth_headers
    )
    assert response2.json()["cache_hit"] == True
    
    # 결과 동일성 (deterministic)
    assert response1.json()["combinations"] == response2.json()["combinations"]
```

### 3. 성능 테스트

#### 3.1 응답 시간 테스트 (1초 이내 목표)
```python
@pytest.mark.asyncio
async def test_budget_guide_performance():
    """60개 후보 기준 1초 이내 응답"""
    import time
    
    engine = BudgetRecommendationEngine(db, redis_client, profile_engine)
    
    start = time.time()
    combinations = await engine.search_optimal_combinations(
        skin_type="ondalsam",
        budget=200000,
        categories=["스킨", "로션", "에센스"],  # 3카테고리 × 20후보 = 60개
        preferences=None
    )
    elapsed = time.time() - start
    
    assert elapsed < 1.0, f"응답 시간 {elapsed:.2f}초 > 1초 목표"
    assert len(combinations) >= 1
```

#### 3.2 결정성(Deterministic) 테스트
```python
@pytest.mark.asyncio
async def test_budget_guide_deterministic():
    """동일 입력에 대해 항상 동일 결과"""
    engine = BudgetRecommendationEngine(db, redis_client, profile_engine)
    
    params = {
        "skin_type": "hwasan",
        "budget": 100000,
        "categories": ["스킨", "로션"],
        "preferences": {"alcohol_free": True}
    }
    
    result1 = await engine.search_optimal_combinations(**params)
    result2 = await engine.search_optimal_combinations(**params)
    
    # 제품 ID 순서까지 동일
    for i, combo in enumerate(result1):
        ids1 = [p["product_id"] for p in combo["products"]]
        ids2 = [p["product_id"] for p in result2[i]["products"]]
        assert ids1 == ids2

### 4. 엣지 케이스 테스트

```python
@pytest.mark.asyncio
async def test_budget_too_low():
    """예산이 너무 낮아 조합 불가 시"""
    response = await test_client.post(
        "/api/v1/recommendations/budget",
        json={"budget": 10000, "categories": ["스킨", "로션", "에센스"]},
        headers=auth_headers
    )
    assert response.status_code == 404
    assert "찾지 못했습니다" in response.json()["detail"]

@pytest.mark.asyncio
async def test_single_category():
    """단일 카테고리 요청"""
    response = await test_client.post(
        "/api/v1/recommendations/budget",
        json={"budget": 30000, "categories": ["스킨"]},
        headers=auth_headers
    )
    assert response.status_code == 200
    for combo in response.json()["combinations"]:
        assert len(combo["products"]) == 1
```

### 5. 피부타입별 매칭 검증

```python
@pytest.mark.parametrize("skin_type,expected_tags", [
    ("ondalsam", ["균형보습", "항산화"]),
    ("hwasan", ["시카", "판테놀", "진정"]),
    ("samak", ["세라마이드", "고보습"]),
    ("yuriguseul", ["저자극", "무향", "무알코올"]),
])
@pytest.mark.asyncio
async def test_skin_type_matching_tags(skin_type, expected_tags):
    """피부타입별 추천 태그 매칭 확인"""
    engine = BudgetRecommendationEngine(db, redis_client, profile_engine)
    combinations = await engine.search_optimal_combinations(
        skin_type=skin_type,
        budget=150000,
        categories=["스킨", "로션"],
        preferences=None
    )
    
    # 최소 1개 이상 추천 태그 매칭
    for combo in combinations:
        all_tags = set()
        for product in combo["products"]:
            all_tags.update(product["matching_tags"])
        
        matched = all_tags & set(expected_tags)
        assert len(matched) >= 1, f"{skin_type} 타입 추천 태그 미매칭"
```

## Subtasks

### 15.1. budget_guide_history 테이블 및 인덱스 생성

**Status:** pending  
**Dependencies:** None  

예산 기반 구매 가이드 이력을 저장할 budget_guide_history 테이블과 성능 최적화를 위한 인덱스를 PostgreSQL에 생성합니다.

**Details:**

PRD v1.8 F10 요구사항에 따라 budget_guide_history 테이블을 생성합니다. 테이블 컬럼: id(SERIAL PK), user_id(UUID FK users), budget(INTEGER NOT NULL), categories(JSONB NOT NULL), preferences(JSONB nullable), result_combinations(JSONB NOT NULL), selected_combination_idx(INTEGER nullable), created_at(TIMESTAMP WITH TIME ZONE DEFAULT NOW()). 인덱스: idx_budget_guide_user(user_id), idx_budget_guide_created(created_at DESC). 추가로 products 테이블에 카테고리+가격 범위 조회 최적화를 위한 idx_products_category_price(category, price)와 idx_products_category_rating(category, rating DESC) 인덱스를 생성합니다.

### 15.2. Pydantic 요청/응답 스키마 정의

**Status:** pending  
**Dependencies:** 15.1  

예산 기반 구매 가이드 API를 위한 BudgetGuideRequest, BudgetGuideResponse 및 관련 Pydantic 스키마를 schemas/recommendation.py에 구현합니다.

**Details:**

스키마 구현 내용: (1) CategoryEnum - 스킨/로션/에센스/크림/선크림/클렌저 6종 Enum, (2) BudgetGuideRequest - budget(int, 10000~1000000), categories(List[CategoryEnum], 1~6개), preferences(Optional Dict[str,bool] - alcohol_free, vegan, fragrance_free 등), (3) ProductInCombination - product_id, product_name, brand_name, category, price, rating, matching_tags, image_url, purchase_links, (4) RecommendationCombination - combination_index(0,1,2), products, total_price, remaining_budget, matching_score(0.0~1.0), average_rating, recommendation_reason, budget_usage_ratio, (5) BudgetGuideResponse - combinations(1~3안), user_skin_type, total_candidates_searched, processing_time_ms, cache_hit. 모든 스키마에 적절한 Field validators 적용.

### 15.3. BudgetRecommendationEngine 핵심 클래스 구현

**Status:** pending  
**Dependencies:** 15.1, 15.2  

카테고리별 후보 추출과 매칭 점수 계산 로직을 포함한 BudgetRecommendationEngine 클래스를 services/budget_recommendation_engine.py에 구현합니다.

**Details:**

Task 14의 RecommendationEngine을 확장하여 구현. (1) __init__ - db, redis_client, profile_engine 의존성 주입, CANDIDATES_PER_CATEGORY=20, BEAM_WIDTH=5, CACHE_TTL=3600 상수 정의. (2) get_category_candidates() - skin_type_recommendation_rules에서 recommended_tags/avoid_tags 조회 후 카테고리+가격 필터링 쿼리 실행, preferences 적용(alcohol_free, vegan, fragrance_free), 매칭 점수 계산 후 상위 N개 반환. (3) _calculate_matching_score() - 태그 매칭 비율 60%, 주의 태그 페널티 -0.3, 별점 정규화 20%, 최종 점수 0.0~1.0 범위 클램핑. (4) _get_recommended_tags(), _get_avoid_tags() - 피부타입별 추천/주의 태그 DB 조회 헬퍼 메서드.

### 15.4. 그리디+빔서치 조합 탐색 알고리즘 구현

**Status:** pending  
**Dependencies:** 15.3  

예산 내 최적 조합을 탐색하는 search_optimal_combinations() 메서드와 가격 다양성 선택 로직을 BudgetRecommendationEngine에 구현합니다.

**Details:**

PRD v1.8 7.4.2 알고리즘 플로우 구현. (1) search_optimal_combinations() - 카테고리별 후보 추출 후 빔서치 초기화(beams=[(0,0.0,[])]), 카테고리 순회하며 후보 확장, 효율 점수(매칭점수/사용예산) 기준 상위 K=5개 빔 유지, 예산 초과/별점 페널티 가지치기. (2) _select_diverse_combinations() - 80%/60%/40% 예산 사용률 타겟으로 1~3안 선택, 중복 조합 방지(product_ids 집합 비교), 모든 카테고리 포함 검증. (3) _should_prune() - 예산 초과, 평균 별점 3.5 미만 가지치기 조건. 결과: combination_index, products, total_price, remaining_budget, matching_score, average_rating, budget_usage_ratio 포함 Dict 리스트 반환.

### 15.5. 추천 사유 자동 생성 모듈 구현

**Status:** pending  
**Dependencies:** 15.3, 15.4  

피부타입 매칭률, 평균 별점, 잔여 예산을 기반으로 한국어 추천 사유를 생성하는 generate_recommendation_reason() 메서드를 구현합니다.

**Details:**

generate_recommendation_reason() 구현: (1) 조합 내 모든 제품의 matching_tags 수집 후 recommended_tags와 교집합 계산. (2) 피부타입 한글명 매핑 딕셔너리 - ondalsam:옹달샘, mulgae:물개, subuji:수부지, hwasan:화산, samak:사막, injeolmi:인절미, yuriguseul:유리구슬, memilmuk:메밀묵. (3) 추천 사유 템플릿 조합: 매칭률 70% 이상→'{타입명} 타입에 맞는 핵심 성분 N종을 충족합니다', 50% 이상→'{타입명} 타입 추천 성분 중 N종이 포함되어 있습니다', 평균 별점 4.5 이상→'높은 사용자 만족도를 기록한 제품들입니다', 4.0 이상→'안정적인 평점의 제품 조합입니다', 잔여 예산 10000원 이상→'잔여 예산 {N:,}원으로 선크림 추가를 고려해보세요'. 기본 폴백: '예산 내 최적 조합입니다'.

### 15.6. POST /api/v1/recommendations/budget API 엔드포인트 구현

**Status:** pending  
**Dependencies:** 15.2, 15.4, 15.5  

예산 기반 구매 가이드 FastAPI 엔드포인트를 routers/recommendations.py에 구현하고 Redis 캐싱 및 이력 저장 로직을 적용합니다.

**Details:**

API 구현: (1) @router.post('/budget', response_model=BudgetGuideResponse) 데코레이터 적용. (2) 사용자 피부타입 조회 - user_profiles 테이블에서 skin_type 확인, 없으면 HTTPException 400 '피부타입 진단을 먼저 완료해주세요' 반환. (3) 캐시 키 생성 - _generate_cache_key(user_id, budget, categories, preferences) → MD5 해시 기반 결정적 키 'budget_guide:{hash}'. (4) Redis 캐시 조회 - 히트 시 cache_hit=True 설정 후 반환. (5) BudgetRecommendationEngine.search_optimal_combinations() 호출. (6) 결과 없으면 HTTPException 404 '입력하신 예산과 조건에 맞는 조합을 찾지 못했습니다'. (7) 각 조합에 추천 사유 생성 및 구매 링크 추가 - _get_purchase_links() 로 product_prices 테이블에서 가격 ASC 상위 3개 판매처 조회. (8) Redis 캐싱 setex(TTL=3600). (9) budget_guide_history INSERT. (10) processing_time_ms 계산 후 응답 반환.

### 15.7. 통합 테스트 및 성능 검증

**Status:** pending  
**Dependencies:** 15.6  

예산 기반 구매 가이드 전체 기능에 대한 통합 테스트, 엣지 케이스 테스트, 피부타입별 매칭 검증 및 성능 테스트를 수행합니다.

**Details:**

테스트 케이스 구현: (1) 통합 테스트 - 정상 요청 성공, 선호 조건(alcohol_free, vegan) 적용, 인증 없는 요청 401, 피부타입 미완료 400. (2) 엣지 케이스 - 예산 너무 낮아(10000원) 조합 불가 시 404, 단일 카테고리 요청 시 products 길이 1 확인, 6개 카테고리 최대 요청. (3) 피부타입별 매칭 검증 - 8개 타입별 parametrize 테스트, ondalsam→[균형보습,항산화], hwasan→[시카,판테놀,진정], samak→[세라마이드,고보습], yuriguseul→[저자극,무향,무알코올] 등 추천 태그 최소 1개 매칭 확인. (4) 성능 테스트 - 60후보 기준 응답 시간 1초 이내, 캐시 히트 시 10배 이상 빠름. (5) 결정성 테스트 - 동일 파라미터 2회 호출 시 product_ids 순서까지 동일.
