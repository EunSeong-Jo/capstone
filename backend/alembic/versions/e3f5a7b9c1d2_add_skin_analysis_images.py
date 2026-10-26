"""add skin_analysis_images

사진 분석 결과 이미지(얼굴 없는 투명 PNG)를 디스크 대신 DB에 둔다.
Lightsail 컨테이너는 영구 볼륨이 없어 재배포하면 디스크의 이미지가 사라진다.

**기존 데이터에 영향이 없다** — 새 테이블 하나뿐이다. 기존 디스크 파일은 옮겨지지 않으므로
필요하면 `scripts/import_skin_images.py`로 올린다(없으면 그 분석은 점수만 보인다).

Revision ID: e3f5a7b9c1d2
Revises: d2e4f6a8b0c1
Create Date: 2026-10-26

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'e3f5a7b9c1d2'
down_revision: Union[str, None] = 'd2e4f6a8b0c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'skin_analysis_images',
        sa.Column('analysis_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('key', sa.Text(), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('png', sa.LargeBinary(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['analysis_id'], ['skin_analyses.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('analysis_id', 'key'),
    )
    op.create_index('idx_skin_analysis_images_user', 'skin_analysis_images', ['user_id'])


def downgrade() -> None:
    op.drop_index('idx_skin_analysis_images_user', table_name='skin_analysis_images')
    op.drop_table('skin_analysis_images')
