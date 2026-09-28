"""add ingredient_descriptions

성분별 한 줄 설명과 효능·역할 키워드. ingredients에 컬럼을 더하지 않고
테이블을 나눈 이유는 원본이 다르기 때문이다 — ingredients는 협회 사전,
이쪽은 data/seed/ingredient_descriptions.csv(생성 초안 + 사람 검수).

Revision ID: 952adbaa9665
Revises: 3f3233afae88
Create Date: 2026-09-27

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '952adbaa9665'
down_revision: Union[str, None] = '3f3233afae88'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'ingredient_descriptions',
        sa.Column('ingredient_id', sa.Integer(), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('keywords', postgresql.ARRAY(sa.Text()), server_default='{}', nullable=False),
        sa.Column('source', sa.String(length=20), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['ingredient_id'], ['ingredients.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('ingredient_id'),
    )


def downgrade() -> None:
    op.drop_table('ingredient_descriptions')
