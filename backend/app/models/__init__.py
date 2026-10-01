"""모델 27개 (Phase 1 제품·사용자·진단 18 + Phase 2 개인 데이터 9).

Alembic이 Base.metadata로 스키마를 자동 생성하므로, 새 모델을 만들면
반드시 여기서 import해야 마이그레이션에 잡힌다.
"""
from app.db.base import Base
from app.models.diagnosis import (
    Diagnosis,
    DiagnosisRank,
    QuizOption,
    QuizQuestion,
    QuizVersion,
)
from app.models.personal import (
    CartItem,
    ClosetItem,
    Like,
    Order,
    OrderItem,
    PointTransaction,
    RecentlyViewed,
    Review,
    ScanResult,
)
from app.models.product import (
    Brand,
    Category,
    Ingredient,
    IngredientAlias,
    IngredientTag,
    Product,
    ProductIngredient,
    Tag,
)
from app.models.recommendation import Similarity, SkinTypeRule
from app.models.user import Profile, RefreshToken, User

__all__ = [
    "Base",
    # 제품 · 성분
    "Brand",
    "Category",
    "Product",
    "Ingredient",
    "IngredientAlias",
    "ProductIngredient",
    "Tag",
    "IngredientTag",
    # 사용자 · 인증
    "User",
    "Profile",
    "RefreshToken",
    # 진단
    "QuizVersion",
    "QuizQuestion",
    "QuizOption",
    "Diagnosis",
    "DiagnosisRank",
    # 추천
    "Similarity",
    "SkinTypeRule",
    # 개인 데이터 (Phase 2)
    "ClosetItem",
    "CartItem",
    "Like",
    "RecentlyViewed",
    "Order",
    "OrderItem",
    "Review",
    "PointTransaction",
    "ScanResult",
]
