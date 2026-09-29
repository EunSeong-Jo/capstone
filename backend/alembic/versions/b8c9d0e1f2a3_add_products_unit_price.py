"""add products.unit_count / unit_kind / unit_price / unit_label

단가 비교를 위한 컬럼들. 마스크팩에 '20매' 같은 대용량이 섞여 있어 총액만으로는
비교가 어긋난다 — 80,000원/20매(1매당 4,000원)가 3,000원/1매(1매당 3,000원)보다
27배 비싼 것처럼 정렬된다.

unit_count / unit_kind
    매수·개수와 그 종류. 'sheet'(매·장)와 'piece'(개)를 나누는 이유는
    **매는 소비 단위고 개는 포장 단위**라서다. '325ml (2개)' 토너의 "1개당"은
    비교에 쓸모가 없지만 '10매' 마스크팩의 "1매당"은 쓸모가 있다.
    이 구분이 아래 우선순위를 카테고리 하드코딩 없이 결정한다.

unit_price / unit_label
    생성 컬럼이다. 가격·내용량이 바뀌면 자동으로 따라가 어긋날 수 없고,
    정렬에 쓸 인덱스를 걸 수 있다.

    우선순위는 1매당 > 10ml당 > 10g당 > 1개당.

    10 단위를 쓰는 이유: 1ml당이면 대부분 100~300원대가 되어 카드에서 읽히지
    않는다. 10ml당이면 중앙값이 2,000원으로 총액과 자릿수가 비슷해진다.

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-09-13 01:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b8c9d0e1f2a3'
down_revision: Union[str, None] = 'a7b8c9d0e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ml과 g가 둘 다 있으면 어느 쪽이 본품인지 알 수 없어 건너뛴다.
# '15ml + 6g'는 본품이 6g 크림이고 '2ml + 116g'는 본품이 116g 겔마스크라,
# 큰 쪽이라는 규칙도 통하지 않는다. 단일제품 4건이라 영향이 작고,
# 틀린 단가를 보여주는 것보다 낫다 — 이 제품들은 아래 piece로 떨어진다.
_UNIT_PRICE = """
    CASE
        WHEN unit_kind = 'sheet' AND unit_count > 0 THEN price::numeric / unit_count
        WHEN volume_ml > 0 AND volume_g IS NULL     THEN price::numeric / (volume_ml / 10)
        WHEN volume_g  > 0 AND volume_ml IS NULL    THEN price::numeric / (volume_g  / 10)
        WHEN unit_kind = 'piece' AND unit_count > 0 THEN price::numeric / unit_count
    END
"""

_UNIT_LABEL = """
    CASE
        WHEN unit_kind = 'sheet' AND unit_count > 0 THEN 'sheet'
        WHEN volume_ml > 0 AND volume_g IS NULL     THEN 'ml10'
        WHEN volume_g  > 0 AND volume_ml IS NULL    THEN 'g10'
        WHEN unit_kind = 'piece' AND unit_count > 0 THEN 'piece'
    END
"""


def upgrade() -> None:
    op.add_column('products', sa.Column('unit_count', sa.Integer(), nullable=True))
    op.add_column('products', sa.Column('unit_kind', sa.Text(), nullable=True))
    # 생성 컬럼은 Alembic 헬퍼로 표현할 수 없어 DDL을 직접 쓴다.
    op.execute(
        f"ALTER TABLE products ADD COLUMN unit_price numeric(12,2) "
        f"GENERATED ALWAYS AS ({_UNIT_PRICE}) STORED"
    )
    op.execute(
        f"ALTER TABLE products ADD COLUMN unit_label text "
        f"GENERATED ALWAYS AS ({_UNIT_LABEL}) STORED"
    )
    op.create_index('idx_products_unit_price', 'products', ['unit_price'])


def downgrade() -> None:
    op.drop_index('idx_products_unit_price', table_name='products')
    op.drop_column('products', 'unit_label')
    op.drop_column('products', 'unit_price')
    op.drop_column('products', 'unit_kind')
    op.drop_column('products', 'unit_count')
