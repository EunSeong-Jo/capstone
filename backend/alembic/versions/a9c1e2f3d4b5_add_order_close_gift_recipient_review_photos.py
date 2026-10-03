"""add order cancel/return, gift recipient user, review photos

- orders.closed_at / close_reason: 주문 취소·반품 시각과 사유.
  orders.status는 placed / cancelled / returned가 된다.
- gifts.recipient_user_id: 받는 사람 계정(닉네임으로 찾는다). '받은 선물'이
  여기서 나온다. 예전 행은 NULL — 이름만 적었던 선물이라 받은 사람을 모른다.
- review_photos: 후기 사진. 파일 서버가 없어 바이트를 DB에 둔다. 화면이
  올리기 전에 줄여서(긴 변 1080px JPEG) 장당 수백 KB 안쪽이다.
- closet_items.status에 analyzed가 생긴다. 대체품은 analyzed 제품만 기준으로
  찾으므로, 이미 담겨 있던 제품을 owned로 두면 머지 직후 홈의 대체품 제안이
  전부 비어 버린다. 성분표가 있는 owned 행은 analyzed로 올린다 — 화면의
  '분석하기'도 성분표가 있어야 analyzed로 만든다(같은 기준).

PR #64로 처음 들어왔다가 revert됐고(PR #67), 그사이 dev에 a0fd1f8a5d3a
(product_names_en)가 올라와 Revises를 그 위로 옮겼다.

Revision ID: a9c1e2f3d4b5
Revises: a0fd1f8a5d3a
Create Date: 2026-09-30

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'a9c1e2f3d4b5'
down_revision: Union[str, None] = 'a0fd1f8a5d3a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('orders', sa.Column('closed_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('orders', sa.Column('close_reason', sa.Text(), nullable=True))

    op.add_column(
        'gifts',
        sa.Column('recipient_user_id', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        'fk_gifts_recipient_user_id_users', 'gifts', 'users',
        ['recipient_user_id'], ['id'], ondelete='SET NULL',
    )
    op.create_index(
        'idx_gifts_recipient_created', 'gifts', ['recipient_user_id', 'created_at'],
    )

    op.create_table(
        'review_photos',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('review_id', sa.Integer(), nullable=False),
        sa.Column('position', sa.SmallInteger(), nullable=False),
        sa.Column('content_type', sa.Text(), nullable=False),
        sa.Column('data', sa.LargeBinary(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['review_id'], ['reviews.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_review_photos_review', 'review_photos', ['review_id'])

    op.execute(
        """
        UPDATE closet_items c SET status = 'analyzed'
        WHERE c.status = 'owned'
          AND EXISTS (SELECT 1 FROM product_ingredients pi WHERE pi.product_id = c.product_id)
        """
    )


def downgrade() -> None:
    # analyzed는 이 revision이 만든 상태다. 이전 화면은 모르는 값이라 owned로 돌린다.
    op.execute("UPDATE closet_items SET status = 'owned' WHERE status = 'analyzed'")
    op.drop_index('idx_review_photos_review', table_name='review_photos')
    op.drop_table('review_photos')
    op.drop_index('idx_gifts_recipient_created', table_name='gifts')
    op.drop_constraint('fk_gifts_recipient_user_id_users', 'gifts', type_='foreignkey')
    op.drop_column('gifts', 'recipient_user_id')
    op.drop_column('orders', 'close_reason')
    op.drop_column('orders', 'closed_at')
