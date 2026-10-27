"""reviews: 생성 후기 지원 + products.registered_review_count

시연용으로 제품당 10개 안팎의 후기를 미리 채워 둔다(scripts/seed_sample_reviews.py).
실제 후기는 "산 제품에만" 쓸 수 있어 user_id·order_item_id가 필수였는데, 생성 후기에는 둘 다 없다.

- reviews.user_id·order_item_id를 NULL 허용으로 풀고, `is_sample`로 생성분을 구분한다.
  `CHECK (is_sample OR (user_id IS NOT NULL AND order_item_id IS NOT NULL))`가 **실제 후기의 무결성은 그대로** 지킨다.
  `UNIQUE(order_item_id)`는 NULL 중복을 허용하므로 건드리지 않는다.
- reviews.author_nickname·author_skin_type: 생성 후기의 작성자 표시용(실제 후기는 users/profiles에서 읽는다).
- products.registered_review_count: 화면에 보이는 리뷰 수 = 이 앱에 등록된 후기 개수.
  `products.review_count`(올리브영 크롤링값)는 **인기순 정렬·점수의 입력**이라 덮어쓰지 않고 그대로 둔다.

**revert 주의**: 이 마이그레이션이 head일 때만 `alembic downgrade e3f5a7b9c1d2` 후 PR을 되돌린다(CLAUDE.md 참고).
downgrade는 생성 후기를 지운 뒤 NOT NULL을 되돌린다.

Revision ID: f4a6b8c0d2e3
Revises: e3f5a7b9c1d2
Create Date: 2026-10-27

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'f4a6b8c0d2e3'
down_revision: Union[str, None] = 'e3f5a7b9c1d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('reviews', sa.Column('is_sample', sa.Boolean(), server_default=sa.text('false'), nullable=False))
    op.add_column('reviews', sa.Column('author_nickname', sa.Text(), nullable=True))
    op.add_column('reviews', sa.Column('author_skin_type', sa.Text(), nullable=True))
    op.alter_column('reviews', 'user_id', existing_type=sa.UUID(), nullable=True)
    op.alter_column('reviews', 'order_item_id', existing_type=sa.Integer(), nullable=True)
    op.create_check_constraint(
        'ck_review_real_or_sample',
        'reviews',
        'is_sample OR (user_id IS NOT NULL AND order_item_id IS NOT NULL)',
    )

    op.add_column(
        'products',
        sa.Column('registered_review_count', sa.Integer(), server_default='0', nullable=False),
    )
    # 지금까지 등록된 실제 후기(옵션 묶음 포함 아님 — 제품 id 그대로)로 채운다.
    op.execute(
        """
        UPDATE products p SET registered_review_count = r.n
        FROM (SELECT product_id, count(*) AS n FROM reviews GROUP BY product_id) r
        WHERE r.product_id = p.id
        """
    )


def downgrade() -> None:
    op.drop_column('products', 'registered_review_count')
    op.drop_constraint('ck_review_real_or_sample', 'reviews', type_='check')
    op.execute('DELETE FROM reviews WHERE is_sample OR user_id IS NULL OR order_item_id IS NULL')
    op.alter_column('reviews', 'order_item_id', existing_type=sa.Integer(), nullable=False)
    op.alter_column('reviews', 'user_id', existing_type=sa.UUID(), nullable=False)
    op.drop_column('reviews', 'author_skin_type')
    op.drop_column('reviews', 'author_nickname')
    op.drop_column('reviews', 'is_sample')
