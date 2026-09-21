"""add products.volume_uncertain

v5 정제본의 `내용량_확인필요`를 옮긴다. 정제 작업자가 "이 수치는 믿지 말라"고
표시해 둔 제품이다 — 옵션마다 용량이 다르거나, 본품과 동봉품의 단위가 섞여
총량을 하나로 말할 수 없는 경우다.

    '409ml (6개) + 210매'   → volume_ml 409   (210매는 별개 구성품)
    '각 옵션별 용량이 다름'      → volume_ml NULL

파서는 그중 104건에서 숫자를 뽑아낸다. 값 자체는 남겨 두되 신뢰할 수 없다는
표시가 필요하다 — 단가(`price / volume_ml`)를 낼 때 이 제품들을 빼야 한다.

NULL이 아니라 false 기본값을 쓰는 이유: '확인 안 됨'과 '문제 없음'을 구분할
일이 없다. 표식이 없으면 정상이다.

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-09-12 01:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, None] = 'f6a7b8c9d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'products',
        sa.Column(
            'volume_uncertain',
            sa.Boolean(),
            nullable=False,
            server_default=sa.text('false'),
        ),
    )


def downgrade() -> None:
    op.drop_column('products', 'volume_uncertain')
