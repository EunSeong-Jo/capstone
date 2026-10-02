"""add product_names_en

올리브영 글로벌의 같은 상품 영문명. 원본은 data/raw/oliveyoung_kr_en_paired.csv
(PR #60)이고 scripts/seed_product_names_en.py가 적재한다.

products에 컬럼을 더하지 않고 별도 테이블로 둔 이유는 모델 주석에 있다 —
한 제품이 여러 영문 리스팅에 매칭되고(goodsNo 중복 194건), OCR 대조에는
별칭이 많을수록 유리하다.

name_en에 GIN trgm 인덱스를 건다. pg_trgm은 초기 스키마에서 이미 설치했다.

Revision ID: a0fd1f8a5d3a
Revises: 952adbaa9665
Create Date: 2026-10-02

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'a0fd1f8a5d3a'
down_revision: Union[str, None] = '952adbaa9665'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'product_names_en',
        sa.Column('product_id', sa.Integer(), nullable=False),
        sa.Column('name_en', sa.Text(), nullable=False),
        sa.Column('brand_en', sa.Text(), nullable=True),
        sa.Column('match_method', sa.Text(), nullable=False),
        sa.Column('confidence', sa.Text(), nullable=False),
        sa.Column('score', sa.Float(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('product_id', 'name_en'),
    )
    op.create_index(
        'idx_product_names_en_trgm', 'product_names_en', ['name_en'],
        postgresql_using='gin', postgresql_ops={'name_en': 'gin_trgm_ops'},
    )


def downgrade() -> None:
    op.drop_index('idx_product_names_en_trgm', table_name='product_names_en')
    op.drop_table('product_names_en')
