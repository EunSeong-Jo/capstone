"""add ingredient_functions

성분 기능 분류(보습·장벽·진정·미백·주름·항산화·피지·각질·자외선 + 역할 + 자극 플래그).
원본은 data/seed/ingredient_functions/labels.csv, 적재는 scripts/seed_ingredient_functions.py.
유사도(`hybrid`)와 피부 궁합이 같이 쓴다.

**기존 데이터에 영향이 없다** — 새 테이블 1개뿐이다. 기존 `tags`·`ingredient_tags`는 건드리지 않는다.

Revision ID: a1f7c3d9e2b4
Revises: c3d9a1e7b2f4
Create Date: 2026-10-22

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'a1f7c3d9e2b4'
down_revision: Union[str, None] = 'c3d9a1e7b2f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'ingredient_functions',
        sa.Column('ingredient_id', sa.Integer(), nullable=False),
        sa.Column('functions', postgresql.ARRAY(sa.Text()), server_default='{}', nullable=False),
        sa.Column('role', sa.String(length=1), nullable=False),
        sa.Column('flags', postgresql.ARRAY(sa.Text()), server_default='{}', nullable=False),
        sa.Column('confidence', sa.SmallInteger(), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('source', sa.String(length=20), nullable=False),
        sa.Column('allergen_listed', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['ingredient_id'], ['ingredients.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('ingredient_id'),
    )


def downgrade() -> None:
    op.drop_table('ingredient_functions')
