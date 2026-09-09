"""테이블·컬럼명 단순화

Revision ID: a1b2c3d4e5f6
Revises: 92851da8889b
Create Date: 2026-08-12

autogenerate는 rename을 감지하지 못하고 DROP + CREATE를 만든다.
그러면 적재해 둔 18만 행이 사라지므로 rename 연산으로 직접 작성했다.
데이터는 그대로 보존된다.

태그 테이블은 이름을 맞바꾼다. 마스터를 tags로, 조인 테이블을
표준 N:M 명명(ingredient_tags)으로 바꾸는 것이라 순서가 중요하다.
    ingredient_tags(마스터) → tags       ← 먼저
    ingredient_tag_map(조인) → ingredient_tags
"""
from typing import Sequence, Union

from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "92851da8889b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (기존 테이블, 새 테이블) — 순서 중요
TABLE_RENAMES = [
    ("ingredient_tags", "tags"),          # 마스터를 먼저 비켜준다
    ("ingredient_tag_map", "ingredient_tags"),
    ("skin_type_recommendation_rules", "skin_type_rules"),
    ("product_similarities", "similarities"),
    ("skin_diagnoses", "diagnoses"),
    ("user_profiles", "profiles"),
]

# (테이블, 기존 컬럼, 새 컬럼) — 테이블명은 rename 이후 기준
COLUMN_RENAMES = [
    ("ingredients", "normalized_name", "norm_name"),
    ("ingredients", "korean_name", "name_ko"),
    ("ingredients", "english_name", "name_en"),
    ("ingredients", "official_code", "code"),
    ("products", "availability", "status"),
    ("products", "original_price", "list_price"),
    ("products", "expiry_info", "expiry"),
    ("users", "auth_provider", "provider"),
    ("profiles", "interested_domains", "domains"),
    ("profiles", "axis_scores", "scores"),
    ("diagnoses", "axis_scores", "scores"),
    ("similarities", "shared_key_ingredients", "shared_ingredients"),
    ("skin_type_rules", "recommended_tags", "include_tags"),
    ("skin_type_rules", "avoid_tags", "exclude_tags"),
]

# 인덱스는 컬럼을 따라가지만 이름은 그대로 남으므로 함께 정리한다
INDEX_RENAMES = [
    ("idx_ingredients_official_code", "idx_ingredients_code"),
    ("idx_products_availability", "idx_products_status"),
    ("idx_skin_diagnoses_user", "idx_diagnoses_user"),
    ("idx_skin_diagnoses_guest", "idx_diagnoses_guest"),
]

# PK 제약과 시퀀스 이름도 옛 테이블명을 그대로 갖고 있어 오류 메시지에 노출된다
CONSTRAINT_RENAMES = [
    ("tags", "ingredient_tags_pkey", "tags_pkey"),
    ("ingredient_tags", "ingredient_tag_map_pkey", "ingredient_tags_pkey"),
    ("skin_type_rules", "skin_type_recommendation_rules_pkey", "skin_type_rules_pkey"),
    ("similarities", "product_similarities_pkey", "similarities_pkey"),
    ("diagnoses", "skin_diagnoses_pkey", "diagnoses_pkey"),
    ("profiles", "user_profiles_pkey", "profiles_pkey"),
]

SEQUENCE_RENAMES = [
    ("ingredient_tags_id_seq", "tags_id_seq"),
    ("skin_type_recommendation_rules_id_seq", "skin_type_rules_id_seq"),
    ("skin_diagnoses_id_seq", "diagnoses_id_seq"),
]


def upgrade() -> None:
    for old, new in TABLE_RENAMES:
        op.rename_table(old, new)
    for table, old, new in COLUMN_RENAMES:
        op.alter_column(table, old, new_column_name=new)
    for old, new in INDEX_RENAMES:
        op.execute(f'ALTER INDEX "{old}" RENAME TO "{new}"')
    for table, old, new in CONSTRAINT_RENAMES:
        op.execute(f'ALTER TABLE "{table}" RENAME CONSTRAINT "{old}" TO "{new}"')
    for old, new in SEQUENCE_RENAMES:
        op.execute(f'ALTER SEQUENCE "{old}" RENAME TO "{new}"')


def downgrade() -> None:
    for old, new in SEQUENCE_RENAMES:
        op.execute(f'ALTER SEQUENCE "{new}" RENAME TO "{old}"')
    for table, old, new in CONSTRAINT_RENAMES:
        op.execute(f'ALTER TABLE "{table}" RENAME CONSTRAINT "{new}" TO "{old}"')
    for old, new in INDEX_RENAMES:
        op.execute(f'ALTER INDEX "{new}" RENAME TO "{old}"')
    for table, old, new in COLUMN_RENAMES:
        op.alter_column(table, new, new_column_name=old)
    for old, new in reversed(TABLE_RENAMES):
        op.rename_table(new, old)
