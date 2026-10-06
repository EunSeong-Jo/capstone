"""루틴 단계 — 토너 · 에센스 · 크림 · 선크림.

DB에는 카테고리가 4종(스킨케어·선케어·마스크팩·클렌징)뿐이고 스킨케어
소분류가 없다(`categories.parent_id`가 비어 있다). 토너·세럼·크림이 한
덩어리라, 예산 가이드가 "토너 자리"에 크림을 넣지 않도록 **제품명 키워드**로
단계를 나눈다.

실측(2026-10, 판매 중 단일제품, 용량 기준 적용 후): 토너 191 · 에센스 372 · 크림 240 · 선크림 30.
세 단계에 동시에 걸리는 제품은 0건이다. 스킨케어 중 어느 단계에도 들지 않는
제품(미스트·아이크림·패드 등)은 가이드에 나오지 않는다.

소분류를 DB에 적재하게 되면 이 파일의 정규식 대신 카테고리 코드로 바꾸면 된다 —
호출부(`services/budget_guide.py`)는 `step_expr()`만 본다.
"""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import and_, case, func, or_
from sqlalchemy.sql.elements import ColumnElement

from app.models.product import Category, Product


@dataclass(frozen=True, slots=True)
class RoutineStep:
    code: str
    label: str
    category: str
    # PostgreSQL 정규식(`~`). 제품명(정제명 우선)에 대고 본다.
    include: str
    exclude: str
    # 이보다 작은 용량(ml·g)은 루틴 구매가 아니라 샘플·미니·스팟 제품이다.
    # 단계마다 본품 크기가 달라 따로 둔다 — 앰플은 15ml도 본품이지만 크림 10ml는
    # 샘플이다. 용량을 모르는 제품(약 3%)은 빼지 않는다.
    min_volume: int


# 바르는 순서. 가이드 결과도 이 순서로 나간다.
ROUTINE: tuple[RoutineStep, ...] = (
    RoutineStep(
        "toner", "토너", "스킨케어",
        include=r"토너|스킨|부스터",
        # '스킨'은 브랜드·라인명에도 들어간다(스킨앤랩·스킨1004·스킨푸드·스킨퍼펙팅).
        exclude=r"스킨(케어|앤랩|1004|푸드|퍼펙)|패드|크림|세럼|에센스|앰플|앰풀|로션|미스트"
        r"|마스크|필링|각질|클렌|폼|바하|리퀴드",
        min_volume=80,
    ),
    RoutineStep(
        "essence", "에센스", "스킨케어",
        include=r"세럼|에센스|앰플|앰풀",
        # '선'만 쓰면 '주름개선 세럼'이 빠진다. 선케어 이름만 겨냥한다.
        exclude=r"패드|토너|크림|미스트|마스크|버블|클렌|폼|선세럼|선에센스|썬",
        min_volume=10,
    ),
    RoutineStep(
        "cream", "크림", "스킨케어",
        include=r"크림",
        exclude=r"아이 ?크림|패드|선크림|클렌|버블|폼|미스트",
        min_volume=30,
    ),
    RoutineStep(
        "sunscreen", "선크림", "선케어",
        include=r".",
        # 스틱·쿠션·팩트는 루틴의 마지막 단계라기보다 덧바르기·메이크업 용도다.
        exclude=r"스틱|쿠션|팩트",
        min_volume=25,
    ),
)

STEP_BY_CODE = {s.code: s for s in ROUTINE}


def _product_name() -> ColumnElement:
    return func.coalesce(Product.display_name, Product.name)


def step_expr() -> ColumnElement:
    """제품이 속한 단계 코드. 어느 단계도 아니면 NULL.

    `Category`를 조인한 쿼리에서 쓴다(`Category.code`를 본다).
    """
    name = _product_name()
    volume = func.coalesce(Product.volume_ml, Product.volume_g)
    return case(
        *[
            (
                and_(
                    Category.code == s.category,
                    name.op("~")(s.include),
                    name.op("!~")(s.exclude),
                    or_(volume.is_(None), volume >= s.min_volume),
                ),
                s.code,
            )
            for s in ROUTINE
        ],
        else_=None,
    )
