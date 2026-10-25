"""add product option columns

옵션형 묶음 제품("A/B/C 택1")을 옵션별 제품 행으로 분해하기 위한 컬럼 3개.
원본 행은 composition='optgroup'으로 표시되고, 옵션 행이 option_parent_id로 원본을 가리킨다.

**기존 데이터에 영향이 없다** — nullable 컬럼 추가뿐이고 기존 행은 전부 NULL이다.
분해된 행은 `scripts/load_products.py --options-only`가 만든다.

Revision ID: d2e4f6a8b0c1
Revises: b7c2d9e1f3a5
Create Date: 2026-10-23

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'd2e4f6a8b0c1'
down_revision: Union[str, None] = 'b7c2d9e1f3a5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('products', sa.Column('option_parent_id', sa.Integer(), nullable=True))
    op.add_column('products', sa.Column('option_label', sa.Text(), nullable=True))
    op.add_column('products', sa.Column('option_order', sa.SmallInteger(), nullable=True))
    op.create_foreign_key(
        'products_option_parent_id_fkey', 'products', 'products',
        ['option_parent_id'], ['id'], ondelete='CASCADE',
    )
    op.create_index('idx_products_option_parent', 'products', ['option_parent_id'])


def downgrade() -> None:
    op.drop_index('idx_products_option_parent', table_name='products')
    op.drop_constraint('products_option_parent_id_fkey', 'products', type_='foreignkey')
    op.drop_column('products', 'option_order')
    op.drop_column('products', 'option_label')
    op.drop_column('products', 'option_parent_id')
