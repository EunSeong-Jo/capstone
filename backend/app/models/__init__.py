"""Phase 1 모델 18개.

Alembic이 Base.metadata로 스키마를 자동 생성하므로, 새 모델을 만들면
반드시 여기서 import해야 마이그레이션에 잡힌다.
"""
from app.db.base import Base
from app.models.diagnosis import (
    DiagnosisRank,
    QuizOption,
    QuizQuestion,
    QuizVersion,
    SkinDiagnosis,
)
from app.models.product import (
    Brand,
    Category,
    Ingredient,
    IngredientAlias,
    IngredientTag,
    IngredientTagMap,
    Product,
    ProductIngredient,
)
from app.models.recommendation import ProductSimilarity, SkinTypeRecommendationRule
from app.models.user import RefreshToken, User, UserProfile

__all__ = [
    "Base",
    # 제품 · 성분
    "Brand",
    "Category",
    "Product",
    "Ingredient",
    "IngredientAlias",
    "ProductIngredient",
    "IngredientTag",
    "IngredientTagMap",
    # 사용자 · 인증
    "User",
    "UserProfile",
    "RefreshToken",
    # 진단
    "QuizVersion",
    "QuizQuestion",
    "QuizOption",
    "SkinDiagnosis",
    "DiagnosisRank",
    # 추천
    "ProductSimilarity",
    "SkinTypeRecommendationRule",
]
