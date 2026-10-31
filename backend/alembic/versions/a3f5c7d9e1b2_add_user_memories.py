"""add user_memories

퍼스널 AI 3단계 — 챗봇이 대화에서 기억해 둔 사용자 정보(한 줄 문장). 동의한 사용자에게만 쌓고,
사용자가 마이페이지에서 보고 고치고 지울 수 있다. 계정을 지우면 함께 지워진다(CASCADE).

Revision ID: a3f5c7d9e1b2
Revises: f4a6b8c0d2e3
Create Date: 2026-10-29

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'a3f5c7d9e1b2'
down_revision: Union[str, None] = 'f4a6b8c0d2e3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'user_memories',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('norm_text', sa.Text(), nullable=False),
        sa.Column('kind', sa.Text(), server_default='fact', nullable=False),
        sa.Column('source', sa.Text(), server_default='auto', nullable=False),
        sa.Column('enabled', sa.Boolean(), server_default=sa.text('true'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'norm_text', name='uq_user_memory_text'),
    )
    op.create_index('idx_user_memories_user', 'user_memories', ['user_id', 'updated_at'])


def downgrade() -> None:
    op.drop_index('idx_user_memories_user', table_name='user_memories')
    op.drop_table('user_memories')
