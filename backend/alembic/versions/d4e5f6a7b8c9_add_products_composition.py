"""add products.composition

제품 구성(단일제품 / 증정 / 굿즈 동봉 / 묶음)을 담는다. 유사도 계산 대상과
앱 노출 범위를 이 값 하나로 거른다. 판정 규칙은 app/utils/composition.py.

server_default='single'로 기존 행을 채운다. 백필(scripts/backfill_from_v5.py)을
돌리기 전까지는 전부 single이라 현행 동작과 같다.

Revision ID: d4e5f6a7b8c9
Revises: 1795ba669ae7
Create Date: 2026-09-10 07:12:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, None] = '1795ba669ae7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'products',
        sa.Column('composition', sa.Text(), nullable=False, server_default='single'),
    )
    op.create_index('idx_products_composition', 'products', ['composition'], unique=False)


def downgrade() -> None:
    op.drop_index('idx_products_composition', table_name='products')
    op.drop_column('products', 'composition')
