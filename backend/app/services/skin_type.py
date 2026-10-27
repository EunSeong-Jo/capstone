"""피부타입 규칙을 조회 조건으로 번역한다 (Task 14).

**정본은 `services/skin_fit.py`의 규칙(`PREFER`/`AVOID`/하드 제외 기준)이고, 그 계산 결과가
`product_skin_fit`(제품 × 피부타입)에 들어 있다.** 이 파일은 그 테이블을 조회 조건으로 바꿔 주는 얇은 층이다.

    products → product_skin_fit(skin_type)   excluded · score · matched · has_fragrance · has_drying_alcohol

예전에는 `skin_type_rules` → `tags` → `ingredient_tags`(키워드로 붙인 420종)를 따라갔다. 지금은
성분 기능 라벨(`ingredient_functions`)로 계산한 값을 읽으므로, 목록 필터·정렬·홈 추천·예산 가이드·궁합 카드가
**같은 판정**을 쓴다. 규칙이나 라벨을 바꾸면 `scripts/compute_skin_fit.py`를 다시 돌려야 한다.

함수 이름과 시그니처(`load_rule`·`apply_exclusions`·`fit_score`)는 그대로 둔다 — 호출부가 많다.
(`tags`·`ingredient_tags`·`skin_type_rules`는 더 이상 읽지 않는다. 삭제는 다음 릴리스.)
"""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import Integer, Select, and_, exists, func, literal, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from app.models.recommendation import ProductSkinFit as PSF
from app.services.skin_fit import PREFER


# 피부타입 코드 → 화면 이름. 케어 문구·예산 가이드 사유가 같은 이름을 쓴다.
SKIN_TYPE_LABELS: dict[str, str] = {
    "ondalsam": "수분팡팡 옹달샘",
    "mulgae": "반질반질 물개",
    "subuji": "겉바속촉 수부지",
    "hwasan": "울긋불긋 화산",
    "samak": "바스락 사막",
    "injeolmi": "말랑말랑 인절미",
    "yuriguseul": "조심조심 유리구슬",
    "memilmuk": "얼룩덜룩 메밀묵",
}


@dataclass(frozen=True)
class SkinRule:
    """조회에 쓸 피부타입. 규칙 자체는 `product_skin_fit`에 계산돼 있다."""

    skin_type: str

    def __bool__(self) -> bool:
        return True


async def load_rule(db: AsyncSession, skin_type: str | None) -> SkinRule | None:
    """알려진 피부타입이면 규칙, 아니면 None.

    None은 두 경우다 — 타입을 안 넘겼을 때와, 모르는 타입을 넘겼을 때. 호출부는 둘 다 '필터 없음'으로
    취급하면 된다. 모르는 타입에 404를 내지 않는 이유는, 진단 결과가 바뀌는 사이에 화면이 통째로
    죽는 편이 더 나쁘기 때문이다. (db는 쓰지 않는다 — 시그니처 호환용.)
    """
    if skin_type and skin_type in PREFER:
        return SkinRule(skin_type)
    return None


def _fit_row(skin_type: str, *conds):
    """이 제품의 product_skin_fit 행이 조건을 만족하는지 (상관 서브쿼리)."""
    return (
        select(1)
        .select_from(PSF)
        .where(PSF.product_id == Product.id, PSF.skin_type == skin_type, *conds)
    )


def apply_exclusions(stmt: Select, rule: SkinRule | None) -> Select:
    """이 피부타입이 피해야 하는 제품(`excluded`)을 뺀다.

    하드 제외는 근거가 분명한 것만이다: 고시 목록 알레르기 유발 착향제·일반 향료(화산·유리구슬),
    건조 알코올(수부지·사막·유리구슬). 그 밖의 향료·자극 의심은 목록에서 빼지 않고 궁합 카드에서 '주의'로 알린다.

    EXISTS를 쓰는 이유: JOIN이면 페이지네이션 total이 부풀 수 있다. 계산 행이 없는 제품은 제외되지 않는다.
    """
    if not rule:
        return stmt
    return stmt.where(~exists(_fit_row(rule.skin_type, PSF.excluded.is_(True))))


def has_fact(*, fragrance: bool = False, alcohol: bool = False):
    """타입과 무관한 사실('향료 있음'·'건조 알코올 있음')이 있는 제품의 EXISTS 조건.

    8타입 행이 같은 값을 가지므로 아무 행이나 보면 된다. 예산 가이드의 '무향'·'무알코올' 조건이 쓴다.
    """
    conds = []
    if fragrance:
        conds.append(PSF.has_fragrance.is_(True))
    if alcohol:
        conds.append(PSF.has_drying_alcohol.is_(True))
    return (
        select(1)
        .select_from(PSF)
        .where(PSF.product_id == Product.id, PSF.skin_type == "ondalsam", and_(*conds))
    )


def fit_score(rule: SkinRule | None):
    """정렬 키: 궁합 점수(0~100). 판단 불가(NULL)는 -1이라 가장 뒤로 간다. 규칙이 없으면 0."""
    if not rule:
        return literal(0, Integer)
    return (
        select(func.coalesce(PSF.score, -1))
        .where(PSF.product_id == Product.id, PSF.skin_type == rule.skin_type)
        .scalar_subquery()
    )


def fit_ratio(rule: SkinRule | None):
    """홈 추천 점수의 매칭 항: 궁합 점수 / 100. 판단 불가·계산 없음은 중립(0.5). 규칙이 없으면 0."""
    if not rule:
        return literal(0.0)
    return (
        select(func.coalesce(PSF.score, 50) / 100.0)
        .where(PSF.product_id == Product.id, PSF.skin_type == rule.skin_type)
        .scalar_subquery()
    )


def matched_count(rule: SkinRule | None):
    """그 타입의 선호 기능을 가진 성분 수(예산 가이드의 matched_ingredients)."""
    if not rule:
        return literal(0, Integer)
    return (
        select(func.coalesce(PSF.matched, 0))
        .where(PSF.product_id == Product.id, PSF.skin_type == rule.skin_type)
        .scalar_subquery()
    )
