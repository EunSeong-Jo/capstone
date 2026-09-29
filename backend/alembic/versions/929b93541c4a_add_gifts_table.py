"""add gifts table

선물하기 기록. orders와 같은 성격이다 — 실제 결제·전달은 없지만 '보낸 선물'
목록이 이 기록에서 파생된다(지금까지는 localStorage + 예시 데이터였다).

받는 사람 연락처 컬럼은 **일부러 두지 않았다.** 전달 경로가 없어 아무 데도
쓰이지 않는데 제3자의 개인정보를 공용 DB에 쌓게 된다. 실제 발송을 붙일 때
그 수단에 맞는 컬럼을 추가한다.

Revision ID: 929b93541c4a
Revises: d07012ddaaa9
Create Date: 2026-09-23

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '929b93541c4a'
down_revision: Union[str, None] = 'd07012ddaaa9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'gifts',
        sa.Column('id', postgresql.UUID(as_uuid=True),
                  server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('sender_user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('product_id', sa.Integer(), nullable=True),
        sa.Column('product_name', sa.Text(), nullable=False),
        sa.Column('brand_name', sa.Text(), nullable=True),
        sa.Column('unit_price', sa.Integer(), nullable=False),
        sa.Column('recipient_name', sa.Text(), nullable=False),
        sa.Column('message', sa.Text(), nullable=True),
        sa.Column('status', sa.Text(), server_default='pending', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['sender_user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_gifts_sender_created', 'gifts', ['sender_user_id', 'created_at'])


def downgrade() -> None:
    op.drop_index('idx_gifts_sender_created', table_name='gifts')
    op.drop_table('gifts')
