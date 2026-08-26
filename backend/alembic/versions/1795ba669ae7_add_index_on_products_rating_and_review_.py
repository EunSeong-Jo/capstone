"""add index on products rating and review_count

Revision ID: 1795ba669ae7
Revises: c3d4e5f6a7b8
Create Date: 2026-08-25 14:40:13.893943

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1795ba669ae7'
down_revision: Union[str, None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index('idx_products_rating', 'products', ['rating'], unique=False)
    op.create_index('idx_products_review_count', 'products', ['review_count'], unique=False)


def downgrade() -> None:
    op.drop_index('idx_products_review_count', table_name='products')
    op.drop_index('idx_products_rating', table_name='products')
