"""add profiles.decoration_id

캐릭터 꾸미기 장식. 예전에는 localStorage(swappy:decoration:v1:<scope>)에만
있어 기기를 바꾸면 사라졌고, 꾸미기 화면의 '저장하기'는 아무 일도 하지
않았다(DecoratePage의 TODO).

에셋은 frontend/public/mascot/decoration_*.png이고 id가 곧 파일 번호다.

Revision ID: 2425accbef26
Revises: 929b93541c4a
Create Date: 2026-09-23

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = '2425accbef26'
down_revision: Union[str, None] = '929b93541c4a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('profiles', sa.Column('decoration_id', sa.SmallInteger(), nullable=True))


def downgrade() -> None:
    op.drop_column('profiles', 'decoration_id')
