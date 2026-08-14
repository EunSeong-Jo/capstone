"""유일 제약에 남은 옛 이름 정리

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-08-15

a1b2c3d4e5f6에서 테이블·컬럼명을 단순화할 때 명시적으로 만든 인덱스(idx_*)와
PK 제약은 함께 리네임했지만, UNIQUE 제약이 자동 생성한 이름 3개가 빠졌다.
동작에는 문제가 없고 제약 위반 시 오류 메시지에 옛 이름이 노출될 뿐이다.

PostgreSQL은 유일 제약과 그 뒷받침 인덱스의 이름을 함께 관리하므로
ALTER TABLE ... RENAME CONSTRAINT 한 번으로 둘 다 바뀐다.
ALTER INDEX로 바꾸면 제약 이름과 어긋날 수 있어 쓰지 않는다.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (테이블, 기존 제약명, 새 제약명)
CONSTRAINT_RENAMES = [
    # 컬럼이 normalized_name → norm_name 으로 바뀌었다
    ("ingredients", "ingredients_normalized_name_key", "ingredients_norm_name_key"),
    # 마스터 테이블이 ingredient_tags → tags 로 바뀌었다.
    # 지금의 ingredient_tags는 조인 테이블이라 이름이 헷갈린다.
    ("tags", "ingredient_tags_code_key", "tags_code_key"),
    # skin_type_recommendation_rules → skin_type_rules
    (
        "skin_type_rules",
        "skin_type_recommendation_rules_skin_type_key",
        "skin_type_rules_skin_type_key",
    ),
]


def upgrade() -> None:
    for table, old, new in CONSTRAINT_RENAMES:
        op.execute(f'ALTER TABLE "{table}" RENAME CONSTRAINT "{old}" TO "{new}"')


def downgrade() -> None:
    for table, old, new in CONSTRAINT_RENAMES:
        op.execute(f'ALTER TABLE "{table}" RENAME CONSTRAINT "{new}" TO "{old}"')
