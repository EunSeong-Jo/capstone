"""add product_skin_fit

제품 × 피부타입 궁합 사전 계산 결과. 목록 정렬·피부타입 필터·홈 추천 점수·예산 가이드·궁합 카드가
같은 값을 읽게 하는 단일 계산 결과다(services/skin_fit.evaluate → scripts/compute_skin_fit.py).

**기존 데이터에 영향이 없다** — 새 테이블 1개뿐이다. 기존 `tags`·`ingredient_tags`·`skin_type_rules`·
`ingredients.grade/is_allergen`은 이 마이그레이션에서 건드리지 않는다(삭제는 다음 릴리스).

Revision ID: b7c2d9e1f3a5
Revises: a1f7c3d9e2b4
Create Date: 2026-10-23

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'b7c2d9e1f3a5'
down_revision: Union[str, None] = 'a1f7c3d9e2b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'product_skin_fit',
        sa.Column('product_id', sa.Integer(), nullable=False),
        sa.Column('skin_type', sa.Text(), nullable=False),
        sa.Column('score', sa.SmallInteger(), nullable=True),
        sa.Column('verdict', sa.Text(), nullable=False),
        sa.Column('matched', sa.SmallInteger(), server_default='0', nullable=False),
        sa.Column('excluded', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('has_fragrance', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('has_drying_alcohol', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('computed_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('product_id', 'skin_type'),
    )
    op.create_index(
        'idx_product_skin_fit_rank', 'product_skin_fit', ['skin_type', sa.text('score DESC NULLS LAST')]
    )


def downgrade() -> None:
    op.drop_index('idx_product_skin_fit_rank', table_name='product_skin_fit')
    op.drop_table('product_skin_fit')
