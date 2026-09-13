"""similarities 컬럼명 변경 및 옛 이름 FK 제약 정리

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-08-15

1) similarities 컬럼

product_a_id / product_b_id는 어느 쪽이 기준 제품인지 이름만으로 알 수 없다.
유사도는 방향이 있는 관계이므로(제품별 상위 20개만 저장) 조회 방향을
헷갈리면 엉뚱한 결과가 나온다.

    product_a_id → product_id   사용자가 보고 있는 제품
    product_b_id → similar_id   대체품으로 제시할 제품

테이블이 0행일 때 처리한다. 유사도 배치(Task 3)가 채우기 시작하면
같은 변경에 데이터 이관이 따라붙는다.

2) 외래키 제약 이름

a1b2c3d4e5f6에서 테이블을 리네임할 때 PK 제약은 함께 바꿨지만 FK는
빠져 있었다. b2c3d4e5f6a7이 유일 제약을 정리했고, 여기서 마지막으로
FK 7건을 맞춘다. 이걸로 모든 제약이 <테이블>_<컬럼>_<종류> 규칙을 따른다.

동작에는 영향이 없다. 제약 위반 시 오류 메시지에 옛 테이블명이
노출되는 것이 전부다.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


COLUMN_RENAMES = [
    ("product_a_id", "product_id"),
    ("product_b_id", "similar_id"),
]

# 인덱스는 컬럼을 따라가지만 이름은 그대로 남는다.
# 다른 인덱스가 전부 idx_<테이블>_<용도> 규칙이라 함께 맞춘다.
INDEX_RENAME = ("idx_similarity_lookup", "idx_similarities_lookup")

# (테이블, 기존 제약명, 새 제약명) — 컬럼 리네임 이후 기준
FK_RENAMES = [
    ("diagnoses", "skin_diagnoses_user_id_fkey", "diagnoses_user_id_fkey"),
    ("diagnoses", "skin_diagnoses_version_id_fkey", "diagnoses_version_id_fkey"),
    ("ingredient_tags", "ingredient_tag_map_ingredient_id_fkey",
     "ingredient_tags_ingredient_id_fkey"),
    ("ingredient_tags", "ingredient_tag_map_tag_id_fkey",
     "ingredient_tags_tag_id_fkey"),
    ("profiles", "user_profiles_user_id_fkey", "profiles_user_id_fkey"),
    ("similarities", "product_similarities_product_a_id_fkey",
     "similarities_product_id_fkey"),
    ("similarities", "product_similarities_product_b_id_fkey",
     "similarities_similar_id_fkey"),
]


def upgrade() -> None:
    for old, new in COLUMN_RENAMES:
        op.alter_column("similarities", old, new_column_name=new)
    op.execute(f'ALTER INDEX "{INDEX_RENAME[0]}" RENAME TO "{INDEX_RENAME[1]}"')
    for table, old, new in FK_RENAMES:
        op.execute(f'ALTER TABLE "{table}" RENAME CONSTRAINT "{old}" TO "{new}"')


def downgrade() -> None:
    for table, old, new in FK_RENAMES:
        op.execute(f'ALTER TABLE "{table}" RENAME CONSTRAINT "{new}" TO "{old}"')
    op.execute(f'ALTER INDEX "{INDEX_RENAME[1]}" RENAME TO "{INDEX_RENAME[0]}"')
    for old, new in COLUMN_RENAMES:
        op.alter_column("similarities", new, new_column_name=old)
