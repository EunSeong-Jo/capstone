"""옵션형 묶음 제품(`products.option_parent_id`)을 목록·추천·조회에서 한 제품으로 다루는 공통 조건.

옵션형 묶음은 원본 행(composition='optgroup')과 옵션별 행(composition='single', option_order 1..N)으로 나뉘어 있다
(분해 규칙: app/utils/product_options.py). 화면 목록에는 **그룹당 대표 1개**(= 첫 옵션)만 나오고, 옵션은 상세·분석
화면의 드롭다운에서 고른다. 원본은 어디에도 나오지 않는다 — 전성분이 모든 옵션의 합집합이라 보여 줄 수 없다.
"""
from __future__ import annotations

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.models.product import Product
from app.utils.composition import OPTION_GROUP


def listable() -> ColumnElement[bool]:
    """목록·검색·추천에 올릴 행: 옵션 그룹의 원본이 아니고, 옵션이면 대표(1번)만."""
    return and_(
        Product.composition != OPTION_GROUP,
        or_(Product.option_order.is_(None), Product.option_order == 1),
    )


def family_root(product: Product) -> int | None:
    """이 제품이 속한 옵션 그룹의 원본 id. 옵션형이 아니면 None."""
    if product.option_parent_id is not None:
        return product.option_parent_id
    if product.composition == OPTION_GROUP:
        return product.id
    return None


async def options_of(db: AsyncSession, root_id: int) -> list[tuple[int, str, int]]:
    """그룹의 옵션 [(id, 라벨, 순서)] — 순서대로."""
    rows = await db.execute(
        select(Product.id, Product.option_label, Product.option_order)
        .where(Product.option_parent_id == root_id, Product.status == "active")
        .order_by(Product.option_order, Product.id)
    )
    return [(i, label or "", order or 0) for i, label, order in rows]


async def family_ids(db: AsyncSession, product_id: int) -> list[int]:
    """후기처럼 그룹이 공유하는 데이터를 읽을 때 쓰는 id 목록(자기 자신 포함). 옵션형이 아니면 [product_id]."""
    product = await db.get(Product, product_id)
    if product is None:
        return [product_id]
    root = family_root(product)
    if root is None:
        return [product_id]
    return [root, *(i for i, _l, _o in await options_of(db, root))]
