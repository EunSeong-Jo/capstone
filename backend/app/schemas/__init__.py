"""API 요청·응답 스키마 (Pydantic).

응답 필드명은 camelCase다. 자세한 이유는 schemas/product.py 참고.
"""
from app.schemas.product import (
    IngredientOut,
    ProductDetailOut,
    ProductListOut,
    ProductOut,
)

__all__ = [
    "ProductOut",
    "ProductDetailOut",
    "ProductListOut",
    "IngredientOut",
]
