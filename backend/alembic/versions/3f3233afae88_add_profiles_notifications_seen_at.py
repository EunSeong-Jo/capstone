"""add profiles.notifications_seen_at

알림함을 마지막으로 연 시각. 알림 자체는 테이블에 저장하지 않는다 —
주문·포인트·후기·선물·진단 기록에서 뽑아 만든다(경험치와 같은 방식).
저장할 것은 "어디까지 읽었는지" 하나뿐이다.

Revision ID: 3f3233afae88
Revises: 2425accbef26
Create Date: 2026-09-23

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = '3f3233afae88'
down_revision: Union[str, None] = '2425accbef26'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'profiles',
        sa.Column('notifications_seen_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('profiles', 'notifications_seen_at')
