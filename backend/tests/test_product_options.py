"""옵션형 묶음 제품 분해 규칙 (app/utils/product_options.py)."""
from __future__ import annotations

from app.utils.product_options import (
    MIN_SECTION_INGREDIENTS,
    group_name,
    is_choice_name,
    option_goods_no,
    option_row_name,
    plan_options,
    split_sections,
)

BASE = ", ".join(f"성분{i}" for i in range(1, 9))     # 8개짜리 구간


def _cell(*labels: str) -> str:
    return " ".join(f"[{l}]정제수, {BASE}" for l in labels)


NAME = "듀이트리 픽앤퀵 뽑아쓰는 마스크 30매입 (화장발/카밍풀/모이스처풀/모닝붓기/비타라이트업)"


def test_choice_name_signals() -> None:
    assert is_choice_name(NAME)
    assert is_choice_name("메디힐 에센셜 마스크팩 7종 골라담기")
    assert is_choice_name("엠도씨 로션 150ml 단품/기획 2종 택1")
    assert is_choice_name("프리메라 세럼 3종 - 비타티놀", memo="묶음분리 원본:A000000237634")
    # 'N종'만으로는 세트인지 선택인지 알 수 없다. 용량 두 개 나열('(50ml/200ml)')도 옵션이 아니다.
    assert not is_choice_name("프리메라 세럼 3종 기획")
    assert not is_choice_name("유리아쥬 젤 (50ml/200ml)")
    assert not is_choice_name("토너 150ml + 에센스 30ml 세트")


def test_split_sections_keeps_label_order_and_marks_duplicates() -> None:
    parts = split_sections("앞쪽 잡음 [화장발]정제수, 글리세린 [카밍풀]정제수, 알란토인 [화장발]정제수")
    assert [l for l, _ in parts] == ["화장발", "카밍풀", "화장발 2"]
    assert parts[0][1] == "정제수, 글리세린"
    assert split_sections("정제수, 글리세린") == []


def test_plan_options_splits_choice_products_into_ordered_options() -> None:
    plan = plan_options(NAME, None, _cell("화장발", "카밍풀", "모이스처풀", "모닝붓기", "비타라이트업"))
    assert [(o.order, o.label) for o in plan] == [
        (1, "화장발"), (2, "카밍풀"), (3, "모이스처풀"), (4, "모닝붓기"), (5, "비타라이트업"),
    ]
    assert all("정제수" in o.text for o in plan)


def test_plan_options_drops_footnote_sections_and_needs_two_left() -> None:
    cell = _cell("히알루로닉", "시카 카밍") + " [주름개선 기능성 화장품]정제수, 알란토인"
    plan = plan_options("앰플 7개입 (히알/시카/토닝)", None, cell)
    assert [o.label for o in plan] == ["히알루로닉", "시카 카밍"]           # 각주 구간은 버린다
    assert plan_options(NAME, None, _cell("화장발")) == []                  # 하나만 남으면 분해하지 않는다
    assert MIN_SECTION_INGREDIENTS == 5


def test_plan_options_leaves_sets_and_unlabelled_products_alone() -> None:
    assert plan_options("프리메라 세럼 3종 기획", None, _cell("A", "B", "C")) == []
    assert plan_options(NAME, None, f"정제수, {BASE}") == []                  # 라벨이 없으면 근거가 없다


def test_names_and_goods_no_are_deterministic() -> None:
    g = group_name(NAME)
    assert g == "듀이트리 픽앤퀵 뽑아쓰는 마스크 30매입"
    assert option_row_name(g, "화장발") == "듀이트리 픽앤퀵 뽑아쓰는 마스크 30매입 - 화장발"
    assert group_name("프리메라 세럼 3종 - 비타티놀", "묶음분리 원본:A1") == "프리메라 세럼 3종"
    assert group_name("그냥 제품 - 이름") == "그냥 제품 - 이름"                # 메모가 없으면 꼬리를 뗄 근거가 없다
    assert option_goods_no("A000000111673", 2) == "A000000111673~2"
