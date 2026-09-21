"""add products.display_name

화면에 보여줄 정제된 상품명. v5 정제본의 `상품명`이 들어간다.

`name`은 정제 전 원본을 유지한다. '기획', 'N종 택1', '+50ml' 같은 문구가
composition 판정(app/utils/composition.py)의 입력이라 지우면 분류가 깨진다.

NULL 허용 — 구 CSV로 적재한 제품에는 정제명이 없다. 조회 시
COALESCE(display_name, name)으로 떨어뜨린다.

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-09-10 08:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('products', sa.Column('display_name', sa.Text(), nullable=True))
    # 검색이 name의 trgm 인덱스를 쓰고 있어 짝을 맞춘다.
    op.execute(
        "CREATE INDEX idx_products_display_name_trgm ON products "
        "USING gin (display_name gin_trgm_ops)"
    )


def downgrade() -> None:
    op.drop_index('idx_products_display_name_trgm', table_name='products')
    op.drop_column('products', 'display_name')
