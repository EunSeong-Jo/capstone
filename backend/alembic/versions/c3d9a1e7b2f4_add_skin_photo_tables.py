"""add skin photo tables

얼굴 사진 AI 피부 분석: 동의 기록·구독·분석 결과, 그리고 진단이 어느 분석을
섞었는지 가리키는 `diagnoses.analysis_id`.

**기존 데이터에 영향이 없다** — 새 테이블 3개와 NULL 허용 컬럼 1개뿐이다.
원본 사진은 어디에도 저장하지 않는다.

Revision ID: c3d9a1e7b2f4
Revises: a9c1e2f3d4b5
Create Date: 2026-10-20

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'c3d9a1e7b2f4'
down_revision: Union[str, None] = 'a9c1e2f3d4b5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'user_consents',
        sa.Column('id', postgresql.UUID(as_uuid=True),
                  server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('consent_type', sa.Text(), nullable=False),
        sa.Column('version', sa.Text(), nullable=False),
        sa.Column('agreed_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.Column('withdrawn_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'consent_type', name='uq_user_consents'),
    )

    op.create_table(
        'subscriptions',
        sa.Column('id', postgresql.UUID(as_uuid=True),
                  server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('plan', sa.Text(), server_default='ai_skin_care', nullable=False),
        sa.Column('status', sa.Text(), server_default='active', nullable=False),
        sa.Column('current_period_start', sa.DateTime(timezone=True), nullable=False),
        sa.Column('current_period_end', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.Column('cancelled_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_subscriptions_user', 'subscriptions',
                    ['user_id', 'current_period_end'])

    op.create_table(
        'skin_analyses',
        sa.Column('id', postgresql.UUID(as_uuid=True),
                  server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.Column('quota_kind', sa.Text(), nullable=False),
        sa.Column('concern_set', sa.Text(), nullable=False),
        sa.Column('provider_mode', sa.Text(), nullable=False),
        sa.Column('metrics', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_skin_analyses_user', 'skin_analyses', ['user_id', 'created_at'])

    op.add_column('diagnoses', sa.Column(
        'analysis_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        'fk_diagnoses_analysis', 'diagnoses', 'skin_analyses',
        ['analysis_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    op.drop_constraint('fk_diagnoses_analysis', 'diagnoses', type_='foreignkey')
    op.drop_column('diagnoses', 'analysis_id')
    op.drop_index('idx_skin_analyses_user', table_name='skin_analyses')
    op.drop_table('skin_analyses')
    op.drop_index('idx_subscriptions_user', table_name='subscriptions')
    op.drop_table('subscriptions')
    op.drop_table('user_consents')
