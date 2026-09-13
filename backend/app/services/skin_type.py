"""피부타입 규칙을 조회 조건으로 번역한다 (Task 14).

`skin_type_rules` 한 행은 이렇게 생겼다.

    skin_type     yuriguseul
    include_tags  ["soothing_barrier"]
    exclude_tags  ["allergen_fragrance", "fragrance", "drying_alcohol"]

여기서 나오는 코드는 `tags.code`이고, 그 태그를 가진 성분은
`ingredient_tags`에 있다. 제품과는 `product_ingredients`로 이어진다.

    products → product_ingredients → ingredient_tags → tags

**규칙은 데이터다.** 값을 바꾸려면 `skin_type_rules`의 JSONB를 고치면 되고
(재배포가 필요 없다), 태그 자체를 늘리려면
`scripts/seed_skin_type_tags.py`가 읽는 CSV를 고친다.

배정 근거는 `data/seed/skin_type_ingredients/skin_type_exclusions.csv`에
한 줄씩 적혀 있다.
"""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import Integer, Select, and_, exists, func, literal, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import IngredientTag, Product, ProductIngredient, Tag
from app.models.recommendation import SkinTypeRule


@dataclass(frozen=True)
class SkinRule:
    """조회에 바로 쓸 수 있게 편 규칙."""

    skin_type: str
    include: tuple[str, ...]
    exclude: tuple[str, ...]

    def __bool__(self) -> bool:
        return bool(self.include or self.exclude)


async def load_rule(db: AsyncSession, skin_type: str | None) -> SkinRule | None:
    """활성 규칙 1건. 없거나 비활성이면 None.

    None을 돌려주는 경우가 두 가지다 — 타입을 안 넘겼을 때와, 넘겼는데
    규칙이 없을 때. 호출부는 둘 다 '필터 없음'으로 취급하면 된다.
    모르는 타입에 404를 내지 않는 이유는, 진단 결과가 바뀌거나 규칙을
    잠시 꺼 둔 사이에 화면이 통째로 죽는 편이 더 나쁘기 때문이다.
    """
    if not skin_type:
        return None
    row = (
        await db.execute(
            select(SkinTypeRule.include_tags, SkinTypeRule.exclude_tags).where(
                SkinTypeRule.skin_type == skin_type,
                SkinTypeRule.is_active.is_(True),
            )
        )
    ).first()
    if row is None:
        return None
    include, exclude = row
    return SkinRule(skin_type, tuple(include or ()), tuple(exclude or ()))


def _has_tag(tag_codes: tuple[str, ...]):
    """해당 태그를 가진 성분이 이 제품에 있는지 (상관 서브쿼리)."""
    return (
        select(1)
        .select_from(ProductIngredient)
        .join(IngredientTag, IngredientTag.ingredient_id == ProductIngredient.ingredient_id)
        .join(Tag, and_(Tag.id == IngredientTag.tag_id, Tag.code.in_(tag_codes)))
        .where(ProductIngredient.product_id == Product.id)
    )


def apply_exclusions(stmt: Select, rule: SkinRule | None) -> Select:
    """기피 태그 성분을 가진 제품을 뺀다.

    EXISTS 서브쿼리를 쓰는 이유: JOIN + DISTINCT로 짜면 성분이 여러 개
    걸리는 제품이 중복 행으로 나와 페이지네이션의 total이 부풀어 오른다.
    """
    if not rule or not rule.exclude:
        return stmt
    return stmt.where(~exists(_has_tag(rule.exclude)))


def fit_score(rule: SkinRule | None):
    """추천 태그를 가진 성분이 몇 종인지. 정렬 키로 쓴다.

    제품당 성분 수가 40~90개라 태그가 몇 개 걸리는지는 충분히 갈린다.
    규칙이 없으면 0을 주어 정렬이 뒤의 기준(인기순)으로 넘어가게 한다.
    """
    if not rule or not rule.include:
        return literal(0, Integer)
    return (
        select(func.count())
        .select_from(ProductIngredient)
        .join(IngredientTag, IngredientTag.ingredient_id == ProductIngredient.ingredient_id)
        .join(Tag, and_(Tag.id == IngredientTag.tag_id, Tag.code.in_(rule.include)))
        .where(ProductIngredient.product_id == Product.id)
        .scalar_subquery()
    )
