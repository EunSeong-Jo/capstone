"""add products.volume_ml / volume_g

총 내용량을 숫자로 담는다. v5 정제본의 `내용량_정리`에서 온다.

ml과 g를 한 컬럼에 섞지 않는 이유: 부피와 무게라 직접 비교할 수 없다.
단가를 낼 때 `price / volume_ml`처럼 바로 쓰려면 나뉘어 있어야 하고,
섞어 두면 모든 질의가 단위 컬럼을 함께 봐야 한다.

기존 `volume`(text)은 그대로 둔다 — 상품정보제공고시 원문이라 화면에
그대로 보여주는 값이다. 이 두 컬럼은 계산용이다.

시트마스크처럼 '10매'만 있는 제품은 둘 다 NULL이다.

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-09-11 02:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f6a7b8c9d0e1'
down_revision: Union[str, None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('products', sa.Column('volume_ml', sa.Numeric(10, 2), nullable=True))
    op.add_column('products', sa.Column('volume_g', sa.Numeric(10, 2), nullable=True))


def downgrade() -> None:
    op.drop_column('products', 'volume_g')
    op.drop_column('products', 'volume_ml')
