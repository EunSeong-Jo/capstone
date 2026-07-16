# Task ID: 13

**Title:** 피부타입 QnA 진단 엔진 개발

**Status:** pending

**Dependencies:** 1 ⧖, 2, 12

**Priority:** high

**Description:** PRD v1.8 F2 요구사항에 따라 7~10개 문항의 피부타입 진단 시스템을 구현합니다. 5축(moisture/oil/sensitivity/pigmentation/trouble) 점수 산출, skin_type_mapping_rules 룰 테이블 기반 8타입 매핑, 경계 타입 안내 기능을 포함합니다.

**Details:**

## 구현 상세

### 1. 데이터베이스 스키마 구현

#### 1.1 skin_quiz_questions 테이블 (질문 및 선택지 정의)
```sql
CREATE TABLE skin_quiz_questions (
    id SERIAL PRIMARY KEY,
    question_order INT NOT NULL,                    -- 문항 순서 (1~10)
    category VARCHAR(50) NOT NULL,                  -- 카테고리: moisture_oil, sensitivity, pigmentation, trouble, pore_redness
    question_text TEXT NOT NULL,                    -- 질문 내용
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE skin_quiz_options (
    id SERIAL PRIMARY KEY,
    question_id INT NOT NULL REFERENCES skin_quiz_questions(id) ON DELETE CASCADE,
    option_order CHAR(1) NOT NULL,                  -- A, B, C, D, E
    option_text TEXT NOT NULL,                      -- 선택지 텍스트
    moisture_score INT DEFAULT 0,                   -- 수분 축 점수 (-2 ~ +3)
    oil_score INT DEFAULT 0,                        -- 유분 축 점수 (-2 ~ +3)
    sensitivity_score INT DEFAULT 0,               -- 민감성 축 점수 (-2 ~ +3)
    pigmentation_score INT DEFAULT 0,              -- 색소침착 축 점수 (-2 ~ +3)
    trouble_score INT DEFAULT 0,                    -- 트러블 축 점수 (-2 ~ +3)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_quiz_questions_order ON skin_quiz_questions(question_order);
CREATE INDEX idx_quiz_options_question ON skin_quiz_options(question_id);
```

#### 1.2 skin_type_mapping_rules 테이블 (8타입 매핑 룰)
```sql
CREATE TABLE skin_type_mapping_rules (
    id SERIAL PRIMARY KEY,
    skin_type_code VARCHAR(20) NOT NULL,           -- ongdalsam, mulgae, subji, hwasan, samak, injeolmi, yuriguseul, memilmuk
    skin_type_name_ko VARCHAR(50) NOT NULL,        -- 옹달샘, 물개, 수부지, 화산, 사막, 인절미, 유리구슬, 메밀묵
    skin_type_emoji CHAR(4) NOT NULL,              -- 💧, ✨, 🌊, 🌋, 🏜️, 🍡, 🫧, 🫘
    skin_type_description TEXT,                     -- 타입 설명
    
    -- 각 축별 점수 범위 조건 (NULL은 해당 축 조건 없음)
    moisture_min INT,
    moisture_max INT,
    oil_min INT,
    oil_max INT,
    sensitivity_min INT,
    sensitivity_max INT,
    pigmentation_min INT,
    pigmentation_max INT,
    trouble_min INT,
    trouble_max INT,
    
    priority INT DEFAULT 0,                         -- 조건 충돌 시 우선순위 (높을수록 우선)
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_mapping_rules_type ON skin_type_mapping_rules(skin_type_code);
CREATE INDEX idx_mapping_rules_priority ON skin_type_mapping_rules(priority DESC);
```

#### 1.3 user_profiles 테이블 확장 (Task 12의 기존 구조 확장)
```sql
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS
    quiz_responses JSONB,                           -- 원본 응답 저장: {"q1": "B", "q2": "A", ...}
    
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS
    axis_scores JSONB,                              -- 5축 점수: {"moisture": 8, "oil": 3, "sensitivity": 5, "pigmentation": 2, "trouble": 4}

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS
    skin_type_code VARCHAR(20),                     -- 결정된 피부타입 코드
    
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS
    secondary_type_code VARCHAR(20),                -- 경계 타입 (보조 특성)
    
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS
    skin_diagnosed_at TIMESTAMP WITH TIME ZONE;     -- 진단 일시

CREATE INDEX idx_profiles_skin_type ON user_profiles(skin_type_code);
```

### 2. 진단 문항 설계 (7~10개)

```python
# 문항 데이터 시드
SKIN_QUIZ_QUESTIONS = [
    {
        "order": 1,
        "category": "moisture_oil",
        "text": "세안 후 아무것도 바르지 않았을 때, 피부가 당기기 시작하는 시간은?",
        "options": [
            {"letter": "A", "text": "5분 이내 — 바로 당겨요", "scores": {"moisture": -2, "oil": -1}},
            {"letter": "B", "text": "10~30분 — 조금 있다가 당겨요", "scores": {"moisture": 0, "oil": 0}},
            {"letter": "C", "text": "1시간 이상 — 별로 안 당겨요", "scores": {"moisture": 2, "oil": 1}},
            {"letter": "D", "text": "당김 없이 번들거려요", "scores": {"moisture": 1, "oil": 3}}
        ]
    },
    {
        "order": 2,
        "category": "moisture_oil",
        "text": "오후가 되면 T존(이마, 코) 부위가 어떻게 변하나요?",
        "options": [
            {"letter": "A", "text": "윤기 없이 푸석해요", "scores": {"moisture": -1, "oil": -2}},
            {"letter": "B", "text": "자연스러운 윤기가 나요", "scores": {"moisture": 1, "oil": 1}},
            {"letter": "C", "text": "기름종이가 필요할 정도로 번들거려요", "scores": {"moisture": 0, "oil": 3}},
            {"letter": "D", "text": "T존은 번들, 볼은 건조해요", "scores": {"moisture": -1, "oil": 2}}
        ]
    },
    {
        "order": 3,
        "category": "trouble",
        "text": "한 달 기준, 트러블(여드름, 뾰루지)이 생기는 빈도는?",
        "options": [
            {"letter": "A", "text": "거의 없어요 (0~1개)", "scores": {"trouble": 0}},
            {"letter": "B", "text": "가끔 생겨요 (2~4개)", "scores": {"trouble": 1}},
            {"letter": "C", "text": "자주 생겨요 (5~10개)", "scores": {"trouble": 2}},
            {"letter": "D", "text": "항상 있어요 (10개 이상)", "scores": {"trouble": 3}}
        ]
    },
    {
        "order": 4,
        "category": "sensitivity",
        "text": "새로운 화장품을 사용했을 때 피부 반응은?",
        "options": [
            {"letter": "A", "text": "대부분 잘 맞아요", "scores": {"sensitivity": 0}},
            {"letter": "B", "text": "가끔 따갑거나 붉어져요", "scores": {"sensitivity": 1}},
            {"letter": "C", "text": "자주 트러블이 생겨요", "scores": {"sensitivity": 2, "trouble": 1}},
            {"letter": "D", "text": "웬만한 제품은 못 써요", "scores": {"sensitivity": 3}}
        ]
    },
    {
        "order": 5,
        "category": "pore_redness",
        "text": "모공이 눈에 띄는 부위가 있나요?",
        "options": [
            {"letter": "A", "text": "거의 안 보여요", "scores": {"oil": -1, "trouble": 0}},
            {"letter": "B", "text": "코 주변만 약간 보여요", "scores": {"oil": 1, "trouble": 0}},
            {"letter": "C", "text": "T존 전체가 눈에 띄어요", "scores": {"oil": 2, "trouble": 1}},
            {"letter": "D", "text": "볼까지 넓게 보여요", "scores": {"oil": 3, "trouble": 2}}
        ]
    },
    {
        "order": 6,
        "category": "pore_redness",
        "text": "홍조나 붉은 기가 자주 나타나나요?",
        "options": [
            {"letter": "A", "text": "전혀 없어요", "scores": {"sensitivity": 0, "trouble": 0}},
            {"letter": "B", "text": "운동/음주 후에만 붉어져요", "scores": {"sensitivity": 1}},
            {"letter": "C", "text": "볼이나 코 주변이 항상 붉어요", "scores": {"sensitivity": 2, "trouble": 1}},
            {"letter": "D", "text": "피부 전체가 쉽게 달아올라요", "scores": {"sensitivity": 3, "trouble": 1}}
        ]
    },
    {
        "order": 7,
        "category": "pigmentation",
        "text": "자외선에 노출 후 피부 반응은?",
        "options": [
            {"letter": "A", "text": "금방 빨개졌다가 원래대로 돌아와요", "scores": {"pigmentation": 0}},
            {"letter": "B", "text": "약간 타지만 금방 돌아와요", "scores": {"pigmentation": 1}},
            {"letter": "C", "text": "쉽게 타고 오래 남아요", "scores": {"pigmentation": 2}},
            {"letter": "D", "text": "기미/잡티가 쉽게 생겨요", "scores": {"pigmentation": 3}}
        ]
    },
    {
        "order": 8,
        "category": "pigmentation",
        "text": "다크서클이나 색소침착 고민이 있나요?",
        "options": [
            {"letter": "A", "text": "거의 없어요", "scores": {"pigmentation": 0}},
            {"letter": "B", "text": "피곤할 때만 다크서클이 보여요", "scores": {"pigmentation": 1}},
            {"letter": "C", "text": "항상 어둡고 칙칙해 보여요", "scores": {"pigmentation": 2}},
            {"letter": "D", "text": "기미/검버섯이 있어요", "scores": {"pigmentation": 3}}
        ]
    }
]
```

### 3. 8타입 매핑 룰 정의

```python
# 8타입 매핑 룰 시드 데이터
SKIN_TYPE_MAPPING_RULES = [
    {
        "code": "ongdalsam",
        "name_ko": "옹달샘",
        "emoji": "💧",
        "description": "수분과 유분의 균형이 잘 잡힌 이상적인 피부. 가벼운 보습 루틴만 유지해도 피부가 빛납니다.",
        "conditions": {"moisture": (4, 10), "oil": (2, 6), "sensitivity": (0, 3), "trouble": (0, 3)},
        "priority": 10
    },
    {
        "code": "mulgae",
        "name_ko": "물개",
        "emoji": "✨",
        "description": "유분기가 많은 지성 피부. 과도한 피지 조절이 핵심입니다.",
        "conditions": {"oil": (7, 15), "moisture": (3, 15)},
        "priority": 9
    },
    {
        "code": "subji",
        "name_ko": "수부지",
        "emoji": "🌊",
        "description": "겉은 번들거리지만 속은 건조한 복합성 피부. 유수분 밸런스가 중요합니다.",
        "conditions": {"oil": (5, 15), "moisture": (-5, 3)},
        "priority": 8
    },
    {
        "code": "hwasan",
        "name_ko": "화산",
        "emoji": "🌋",
        "description": "트러블과 홍조가 잦은 민감성 피부. 진정 케어가 필수입니다.",
        "conditions": {"trouble": (5, 15), "sensitivity": (4, 15)},
        "priority": 9
    },
    {
        "code": "samak",
        "name_ko": "사막",
        "emoji": "🏜️",
        "description": "수분이 많이 부족한 극건성 피부. 집중 보습이 필요합니다.",
        "conditions": {"moisture": (-10, 0), "oil": (-10, 2)},
        "priority": 9
    },
    {
        "code": "injeolmi",
        "name_ko": "인절미",
        "emoji": "🍡",
        "description": "건조하면서 탄력이 떨어진 피부. 영양 공급과 안티에이징이 필요합니다.",
        "conditions": {"moisture": (-5, 2), "oil": (-5, 3), "sensitivity": (0, 4)},
        "priority": 7
    },
    {
        "code": "yuriguseul",
        "name_ko": "유리구슬",
        "emoji": "🫧",
        "description": "외부 자극에 민감하게 반응하는 피부. 순한 성분 위주의 케어가 필요합니다.",
        "conditions": {"sensitivity": (5, 15), "trouble": (0, 4)},
        "priority": 8
    },
    {
        "code": "memilmuk",
        "name_ko": "메밀묵",
        "emoji": "🫘",
        "description": "색소침착이 쉽게 생기는 피부. 미백과 자외선 차단이 핵심입니다.",
        "conditions": {"pigmentation": (5, 15)},
        "priority": 8
    }
]
```

### 4. 백엔드 API 구현

#### 4.1 FastAPI 라우터 구조
```python
# app/routers/skin_quiz.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import List, Dict, Optional

router = APIRouter(prefix="/api/v1/profile", tags=["skin-quiz"])

class QuizResponse(BaseModel):
    responses: Dict[str, str]  # {"1": "B", "2": "A", "3": "C", ...}

class QuizResultResponse(BaseModel):
    skin_type_code: str
    skin_type_name: str
    skin_type_emoji: str
    skin_type_description: str
    axis_scores: Dict[str, int]
    secondary_type: Optional[Dict[str, str]]  # 경계 타입
    is_boundary: bool
    recommended_ingredients: List[str]
    warning_ingredients: List[str]

@router.get("/skin-quiz/questions")
async def get_quiz_questions(db: AsyncSession = Depends(get_db)):
    """활성화된 모든 진단 문항 반환"""
    questions = await get_active_questions(db)
    return {"questions": questions, "total": len(questions)}

@router.post("/skin-quiz")
async def submit_skin_quiz(
    quiz_data: QuizResponse,
    current_user: User = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
) -> QuizResultResponse:
    """
    피부타입 진단 제출 및 결과 반환
    - 5축 점수 계산
    - 8타입 매핑
    - 경계 타입 판정 (점수차 2점 이하)
    - user_profiles에 저장 (로그인 사용자)
    """
    # 1. 응답 검증
    validate_responses(quiz_data.responses)
    
    # 2. 5축 점수 계산
    axis_scores = calculate_axis_scores(db, quiz_data.responses)
    
    # 3. 타입 매핑
    primary_type, secondary_type, is_boundary = map_skin_type(db, axis_scores)
    
    # 4. 결과 저장 (로그인 사용자)
    if current_user:
        await save_quiz_result(
            db, 
            user_id=current_user.id,
            responses=quiz_data.responses,
            axis_scores=axis_scores,
            skin_type_code=primary_type.code,
            secondary_type_code=secondary_type.code if secondary_type else None
        )
    
    return QuizResultResponse(
        skin_type_code=primary_type.code,
        skin_type_name=primary_type.name_ko,
        skin_type_emoji=primary_type.emoji,
        skin_type_description=primary_type.description,
        axis_scores=axis_scores,
        secondary_type={
            "code": secondary_type.code,
            "name": secondary_type.name_ko,
            "emoji": secondary_type.emoji
        } if secondary_type else None,
        is_boundary=is_boundary,
        recommended_ingredients=get_recommended_ingredients(primary_type.code),
        warning_ingredients=get_warning_ingredients(primary_type.code)
    )
```

#### 4.2 진단 알고리즘 핵심 로직
```python
# app/services/skin_diagnosis.py

def calculate_axis_scores(db: AsyncSession, responses: Dict[str, str]) -> Dict[str, int]:
    """응답을 기반으로 5축 점수 계산"""
    scores = {
        "moisture": 0,
        "oil": 0,
        "sensitivity": 0,
        "pigmentation": 0,
        "trouble": 0
    }
    
    for question_id, option_letter in responses.items():
        option = await get_option_by_question_and_letter(db, int(question_id), option_letter)
        if option:
            scores["moisture"] += option.moisture_score
            scores["oil"] += option.oil_score
            scores["sensitivity"] += option.sensitivity_score
            scores["pigmentation"] += option.pigmentation_score
            scores["trouble"] += option.trouble_score
    
    return scores

def map_skin_type(
    db: AsyncSession, 
    axis_scores: Dict[str, int]
) -> Tuple[SkinTypeRule, Optional[SkinTypeRule], bool]:
    """
    5축 점수를 기반으로 피부타입 매핑
    
    Returns:
        - primary_type: 주요 피부타입
        - secondary_type: 경계 타입 (점수차 2점 이하 시)
        - is_boundary: 경계 타입 여부
    """
    rules = await get_active_mapping_rules(db)
    matched_types = []
    
    for rule in rules:
        if matches_rule(axis_scores, rule):
            match_score = calculate_match_score(axis_scores, rule)
            matched_types.append((rule, match_score))
    
    # 우선순위와 매칭 점수로 정렬
    matched_types.sort(key=lambda x: (x[0].priority, x[1]), reverse=True)
    
    if not matched_types:
        # 기본값: 옹달샘 (균형 타입)
        return await get_default_type(db), None, False
    
    primary = matched_types[0][0]
    primary_score = matched_types[0][1]
    
    # 경계 타입 판정: 1순위와 2순위 점수차 2점 이하
    is_boundary = False
    secondary = None
    
    if len(matched_types) > 1:
        secondary_score = matched_types[1][1]
        if abs(primary_score - secondary_score) <= 2:
            is_boundary = True
            secondary = matched_types[1][0]
    
    return primary, secondary, is_boundary

def matches_rule(scores: Dict[str, int], rule: SkinTypeRule) -> bool:
    """점수가 룰의 조건을 만족하는지 확인"""
    for axis in ["moisture", "oil", "sensitivity", "pigmentation", "trouble"]:
        min_val = getattr(rule, f"{axis}_min")
        max_val = getattr(rule, f"{axis}_max")
        
        if min_val is not None and scores[axis] < min_val:
            return False
        if max_val is not None and scores[axis] > max_val:
            return False
    
    return True
```

### 5. 프론트엔드 연동 (Task 11과 통합)

```typescript
// src/services/skinQuizService.ts
import { api } from './api';

export interface QuizQuestion {
  id: number;
  order: number;
  category: string;
  text: string;
  options: {
    letter: string;
    text: string;
  }[];
}

export interface QuizResult {
  skinTypeCode: string;
  skinTypeName: string;
  skinTypeEmoji: string;
  skinTypeDescription: string;
  axisScores: {
    moisture: number;
    oil: number;
    sensitivity: number;
    pigmentation: number;
    trouble: number;
  };
  secondaryType?: {
    code: string;
    name: string;
    emoji: string;
  };
  isBoundary: boolean;
  recommendedIngredients: string[];
  warningIngredients: string[];
}

export const skinQuizService = {
  getQuestions: () => api.get<{questions: QuizQuestion[]}>('/api/v1/profile/skin-quiz/questions'),
  
  submitQuiz: (responses: Record<string, string>) => 
    api.post<QuizResult>('/api/v1/profile/skin-quiz', { responses }),
};
```

### 6. DB 룰 관리를 통한 튜닝 기능

```sql
-- 재배포 없이 문항/룰 수정 예시
-- 1. 새 문항 추가
INSERT INTO skin_quiz_questions (question_order, category, question_text)
VALUES (9, 'moisture_oil', '아침에 일어났을 때 피부 상태는?');

-- 2. 매핑 룰 조정
UPDATE skin_type_mapping_rules 
SET moisture_min = 3, moisture_max = 12
WHERE skin_type_code = 'ongdalsam';

-- 3. 새 타입 룰 추가 (필요시)
INSERT INTO skin_type_mapping_rules 
(skin_type_code, skin_type_name_ko, skin_type_emoji, ...)
VALUES ('newtype', '새타입', '🆕', ...);
```

**Test Strategy:**

## 테스트 전략

### 1. 유닛 테스트

#### 1.1 5축 점수 계산 테스트
```python
def test_calculate_axis_scores_basic():
    """기본 점수 계산 검증"""
    responses = {"1": "A", "2": "B", "3": "C"}
    scores = calculate_axis_scores(mock_db, responses)
    
    assert "moisture" in scores
    assert "oil" in scores
    assert "sensitivity" in scores
    assert "pigmentation" in scores
    assert "trouble" in scores
    assert all(isinstance(v, int) for v in scores.values())

def test_calculate_axis_scores_extreme_dry():
    """극건성 응답 패턴 검증"""
    responses = {"1": "A", "2": "A", "3": "A", "4": "A", ...}  # 모두 건조 답변
    scores = calculate_axis_scores(mock_db, responses)
    
    assert scores["moisture"] < 0
    assert scores["oil"] < 2

def test_calculate_axis_scores_oily():
    """지성 응답 패턴 검증"""
    responses = {"1": "D", "2": "C", "5": "D", ...}  # 유분 높은 답변
    scores = calculate_axis_scores(mock_db, responses)
    
    assert scores["oil"] >= 7
```

#### 1.2 타입 매핑 테스트
```python
def test_map_skin_type_ongdalsam():
    """균형 피부 → 옹달샘 매핑"""
    scores = {"moisture": 5, "oil": 4, "sensitivity": 2, "pigmentation": 1, "trouble": 1}
    primary, secondary, is_boundary = map_skin_type(mock_db, scores)
    
    assert primary.code == "ongdalsam"
    assert is_boundary == False

def test_map_skin_type_hwasan():
    """트러블 민감성 → 화산 매핑"""
    scores = {"moisture": 3, "oil": 5, "sensitivity": 7, "pigmentation": 2, "trouble": 8}
    primary, secondary, is_boundary = map_skin_type(mock_db, scores)
    
    assert primary.code == "hwasan"

def test_map_skin_type_boundary():
    """경계 타입 판정 테스트 (점수차 2점 이하)"""
    scores = {"moisture": 1, "oil": 6, "sensitivity": 2, "pigmentation": 1, "trouble": 2}
    primary, secondary, is_boundary = map_skin_type(mock_db, scores)
    
    assert is_boundary == True
    assert secondary is not None
```

#### 1.3 룰 매칭 테스트
```python
def test_matches_rule_within_range():
    """범위 내 점수 매칭"""
    scores = {"moisture": 5, "oil": 3, "sensitivity": 2, "pigmentation": 1, "trouble": 1}
    rule = MockRule(moisture_min=4, moisture_max=10, oil_min=2, oil_max=6)
    
    assert matches_rule(scores, rule) == True

def test_matches_rule_out_of_range():
    """범위 외 점수 매칭 실패"""
    scores = {"moisture": 15, "oil": 3, "sensitivity": 2, "pigmentation": 1, "trouble": 1}
    rule = MockRule(moisture_min=4, moisture_max=10)
    
    assert matches_rule(scores, rule) == False
```

### 2. 통합 테스트

#### 2.1 API 엔드포인트 테스트
```python
async def test_get_quiz_questions():
    """문항 조회 API"""
    response = await client.get("/api/v1/profile/skin-quiz/questions")
    
    assert response.status_code == 200
    data = response.json()
    assert "questions" in data
    assert len(data["questions"]) >= 7
    assert len(data["questions"]) <= 10

async def test_submit_quiz_success():
    """진단 제출 성공"""
    responses = {"1": "B", "2": "B", "3": "A", "4": "A", "5": "B", "6": "A", "7": "B", "8": "A"}
    response = await client.post(
        "/api/v1/profile/skin-quiz",
        json={"responses": responses}
    )
    
    assert response.status_code == 200
    result = response.json()
    assert "skin_type_code" in result
    assert "axis_scores" in result
    assert result["skin_type_code"] in ["ongdalsam", "mulgae", "subji", "hwasan", "samak", "injeolmi", "yuriguseul", "memilmuk"]

async def test_submit_quiz_invalid_responses():
    """잘못된 응답 형식 에러 처리"""
    response = await client.post(
        "/api/v1/profile/skin-quiz",
        json={"responses": {"1": "Z"}}  # 잘못된 선택지
    )
    
    assert response.status_code == 400

async def test_submit_quiz_saves_to_profile():
    """로그인 사용자 진단 결과 저장 검증"""
    token = await get_test_user_token()
    responses = {"1": "A", "2": "A", ...}
    
    response = await client.post(
        "/api/v1/profile/skin-quiz",
        json={"responses": responses},
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 200
    
    # DB에서 저장 확인
    profile = await get_user_profile(test_user_id)
    assert profile.quiz_responses is not None
    assert profile.axis_scores is not None
    assert profile.skin_type_code is not None
```

### 3. 시나리오 테스트

#### 3.1 8가지 피부타입 전체 커버리지 테스트
```python
@pytest.mark.parametrize("skin_type,expected_responses", [
    ("ongdalsam", {"1": "B", "2": "B", "3": "A", "4": "A", "5": "B", "6": "A", "7": "A", "8": "A"}),
    ("mulgae", {"1": "D", "2": "C", "3": "B", "4": "A", "5": "C", "6": "A", "7": "B", "8": "A"}),
    ("subji", {"1": "D", "2": "D", "3": "B", "4": "B", "5": "C", "6": "B", "7": "B", "8": "A"}),
    ("hwasan", {"1": "B", "2": "B", "3": "D", "4": "C", "5": "C", "6": "D", "7": "B", "8": "B"}),
    ("samak", {"1": "A", "2": "A", "3": "A", "4": "A", "5": "A", "6": "A", "7": "A", "8": "A"}),
    ("injeolmi", {"1": "A", "2": "A", "3": "A", "4": "B", "5": "A", "6": "B", "7": "B", "8": "B"}),
    ("yuriguseul", {"1": "B", "2": "B", "3": "A", "4": "D", "5": "A", "6": "C", "7": "A", "8": "A"}),
    ("memilmuk", {"1": "B", "2": "B", "3": "A", "4": "A", "5": "B", "6": "A", "7": "D", "8": "D"}),
])
async def test_all_skin_types_reachable(skin_type, expected_responses):
    """모든 8가지 피부타입이 도달 가능한지 검증"""
    response = await client.post(
        "/api/v1/profile/skin-quiz",
        json={"responses": expected_responses}
    )
    
    assert response.status_code == 200
    assert response.json()["skin_type_code"] == skin_type
```

### 4. DB 룰 변경 테스트

```python
async def test_rule_change_affects_mapping():
    """DB 룰 변경 시 매핑 결과 변경 검증"""
    # 기존 룰로 진단
    result1 = await submit_quiz(test_responses)
    original_type = result1["skin_type_code"]
    
    # 룰 변경 (재배포 없이)
    await db.execute(
        "UPDATE skin_type_mapping_rules SET moisture_min = 0 WHERE skin_type_code = 'samak'"
    )
    
    # 변경된 룰로 재진단
    result2 = await submit_quiz(test_responses)
    
    # 룰 변경이 실시간 반영되는지 확인
    # (실제 결과는 테스트 데이터에 따라 달라질 수 있음)
    assert result2["skin_type_code"] is not None
```

### 5. 프론트엔드 E2E 테스트

```typescript
describe('피부타입 진단 플로우', () => {
  it('전체 진단 플로우 완료', async () => {
    // 1. 온보딩에서 진단 시작
    await page.click('[data-testid="start-diagnosis"]');
    
    // 2. 모든 문항 응답
    for (let i = 0; i < 8; i++) {
      await page.click('[data-testid="option-B"]');
      await page.click('[data-testid="next-button"]');
    }
    
    // 3. 결과 화면 확인
    await expect(page.locator('[data-testid="result-type"]')).toBeVisible();
    await expect(page.locator('[data-testid="result-emoji"]')).toBeVisible();
    await expect(page.locator('[data-testid="recommended-ingredients"]')).toBeVisible();
  });
  
  it('경계 타입 안내 표시', async () => {
    // 경계 타입 응답 시나리오 실행
    // ...
    await expect(page.locator('[data-testid="boundary-type-notice"]')).toBeVisible();
  });
});

## Subtasks

### 13.1. 피부 진단 관련 데이터베이스 스키마 설계 및 마이그레이션 생성

**Status:** pending  
**Dependencies:** None  

skin_quiz_questions, skin_quiz_options, skin_type_mapping_rules 테이블과 user_profiles 확장 컬럼을 위한 데이터베이스 스키마를 설계하고 마이그레이션 파일을 생성합니다.

**Details:**

SQLAlchemy 모델 정의: 1) skin_quiz_questions 테이블 - question_order, category(moisture_oil/sensitivity/pigmentation/trouble/pore_redness), question_text, is_active 컬럼 포함. 2) skin_quiz_options 테이블 - question_id FK, option_order(A~E), option_text, 5축 점수 컬럼(moisture_score, oil_score, sensitivity_score, pigmentation_score, trouble_score, 각 -2~+3 범위). 3) skin_type_mapping_rules 테이블 - skin_type_code(8타입), skin_type_name_ko, skin_type_emoji, description, 5축별 min/max 조건, priority, is_active. 4) user_profiles 확장 - quiz_responses(JSONB), axis_scores(JSONB), skin_type_code, secondary_type_code, skin_diagnosed_at 컬럼 추가. 인덱스: question_order, skin_type_code, priority DESC.

### 13.2. 8개 진단 문항 및 선택지 시드 데이터 구축

**Status:** pending  
**Dependencies:** 13.1  

PRD F2 요구사항에 따른 7~10개(8개) 피부타입 진단 문항과 각 문항별 4개 선택지의 시드 데이터를 구축합니다.

**Details:**

8개 문항 구성: 1) 세안 후 당김 시간(moisture_oil), 2) T존 번들거림(moisture_oil), 3) 트러블 빈도(trouble), 4) 새 화장품 반응(sensitivity), 5) 모공 상태(pore_redness), 6) 홍조 여부(pore_redness), 7) 자외선 노출 후 반응(pigmentation), 8) 다크서클/색소침착(pigmentation). 각 선택지(A~D)에 5축 점수 배점: moisture(-2~+3), oil(-2~+3), sensitivity(0~3), pigmentation(0~3), trouble(0~3). 시드 스크립트 작성하여 DB에 INSERT. 관리자 재배포 없이 DB 수정으로 문항 튜닝 가능하도록 설계.

### 13.3. 8타입 피부타입 매핑 룰 시드 데이터 구축

**Status:** pending  
**Dependencies:** 13.1  

옹달샘/물개/수부지/화산/사막/인절미/유리구슬/메밀묵 8가지 피부타입의 매핑 조건을 skin_type_mapping_rules 테이블에 시드합니다.

**Details:**

8타입 매핑 룰: 옹달샘(균형형)-moisture(4~10), oil(2~6), sensitivity(0~3), trouble(0~3), priority=10. 물개(지성)-oil(7~15), moisture(3~15), priority=9. 수부지(복합성)-oil(5~15), moisture(-5~3), priority=8. 화산(트러블민감)-trouble(5~15), sensitivity(4~15), priority=9. 사막(극건성)-moisture(-10~0), oil(-10~2), priority=9. 인절미(건성탄력)-moisture(-5~2), oil(-5~3), sensitivity(0~4), priority=7. 유리구슬(민감성)-sensitivity(5~15), trouble(0~4), priority=8. 메밀묵(색소침착)-pigmentation(5~15), priority=8. emoji, description 포함.

### 13.4. 5축 점수 계산 서비스 로직 구현

**Status:** pending  
**Dependencies:** 13.1, 13.2  

사용자의 QnA 응답을 기반으로 moisture/oil/sensitivity/pigmentation/trouble 5축 점수를 계산하는 핵심 서비스 로직을 구현합니다.

**Details:**

app/services/skin_diagnosis.py에 calculate_axis_scores 함수 구현: 입력-Dict[str, str] (question_id: option_letter 형태), 출력-Dict[str, int] (5축 점수). 로직: 1) 각 응답에 대해 skin_quiz_options에서 해당 선택지 조회, 2) moisture_score, oil_score 등 5축 점수 누적 합산, 3) 초기값 0에서 시작하여 최종 점수 반환. 비동기 DB 조회(AsyncSession). 응답 검증: 유효하지 않은 question_id나 option_letter 시 ValidationError 발생.

### 13.5. 8타입 매핑 및 경계 타입 판정 알고리즘 구현

**Status:** pending  
**Dependencies:** 13.3, 13.4  

5축 점수를 기반으로 8가지 피부타입 중 가장 적합한 타입을 매핑하고, 점수차 2점 이하 시 경계 타입을 함께 반환하는 알고리즘을 구현합니다.

**Details:**

map_skin_type 함수 구현: 입력-axis_scores Dict, 출력-Tuple[primary_type, secondary_type, is_boundary]. 알고리즘: 1) skin_type_mapping_rules에서 is_active=True인 룰 조회, 2) matches_rule 함수로 각 룰의 min/max 조건 충족 여부 확인(NULL 조건은 무시), 3) 매칭된 타입들에 대해 calculate_match_score로 적합도 점수 계산, 4) priority와 match_score 기준 정렬, 5) 1순위를 primary_type으로 지정, 6) 2순위와 점수차 2점 이하 시 is_boundary=True, secondary_type 설정. 매칭 타입 없을 시 기본값 옹달샘 반환.

### 13.6. 진단 문항 조회 API 엔드포인트 구현

**Status:** pending  
**Dependencies:** 13.1, 13.2  

활성화된 모든 진단 문항과 선택지를 반환하는 GET /api/v1/profile/skin-quiz/questions 엔드포인트를 구현합니다.

**Details:**

app/routers/skin_quiz.py에 FastAPI 라우터 구현: GET /skin-quiz/questions 엔드포인트. 응답 스키마: {questions: List[QuizQuestion], total: int}. QuizQuestion 스키마: id, order, category, text, options(List[{letter, text}]). DB에서 is_active=True인 문항만 question_order 순 조회. 선택지는 option_order 순 정렬. 점수 정보는 프론트엔드에 노출하지 않음(보안). 캐싱 고려: 문항 변경 빈도 낮으므로 Redis TTL 1시간 캐싱 적용.

### 13.7. 진단 결과 제출 및 저장 API 엔드포인트 구현

**Status:** pending  
**Dependencies:** 13.4, 13.5, 13.6  

사용자의 QnA 응답을 받아 피부타입을 진단하고 결과를 반환하며, 로그인 사용자의 경우 user_profiles에 저장하는 POST /api/v1/profile/skin-quiz 엔드포인트를 구현합니다.

**Details:**

POST /skin-quiz 엔드포인트 구현. 요청 스키마: QuizResponse({responses: Dict[str, str]}). 응답 스키마: QuizResultResponse(skin_type_code, skin_type_name, skin_type_emoji, skin_type_description, axis_scores, secondary_type, is_boundary, recommended_ingredients, warning_ingredients). 처리 흐름: 1) 응답 검증(8문항, A~D 값), 2) calculate_axis_scores로 5축 점수 계산, 3) map_skin_type으로 타입 매핑, 4) 로그인 사용자(get_current_user_optional)의 경우 user_profiles 업데이트, 5) 결과 반환. 게스트도 진단 가능(저장만 안 됨). 추천/주의 성분은 skin_type_recommendation_rules 연동 또는 하드코딩.

### 13.8. 전체 진단 플로우 통합 테스트 및 8타입 도달 가능성 검증

**Status:** pending  
**Dependencies:** 13.7  

8가지 피부타입 모두 도달 가능한지 검증하고, QnA 중간 이탈 복구(localStorage) 및 재진단 기능을 테스트합니다.

**Details:**

8타입 전체 커버리지 테스트: 각 타입에 도달하는 응답 패턴을 정의하고 parametrize 테스트로 모든 타입 도달 확인. 경계 타입 시나리오 테스트: 1순위와 2순위 점수차 2점 이하 응답 패턴으로 is_boundary=True 검증. 프론트엔드 연동 테스트: QnA 중간 이탈 시 localStorage에 진행 상태 저장, 복귀 시 이어서 진행 가능. 재진단 테스트: 기존 skin_type_code가 있는 사용자가 재진단 시 새 결과로 덮어쓰기 및 skin_diagnosed_at 갱신. 성능 테스트: 진단 API 응답 시간 500ms 이내.
