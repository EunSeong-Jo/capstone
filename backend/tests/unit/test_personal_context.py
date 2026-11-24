"""개인 컨텍스트 — 챗봇이 내 화장대·피부 상태를 아는 기능 (PR 1).

이 파일은 **DB·Redis 없이 도는 쪽**(tests/unit)이다. DB가 필요한 테스트는 `tests/integration/test_personal_context.py`에 있다.

순수 함수(요약 문장·상한)는 DB 없이, 스냅샷 조회와 챗봇 연동은 로컬 DB의 시연 계정(조은성)으로 확인한다.
시연 계정이 없는 환경에서는 DB 의존 테스트를 건너뛴다.
"""
from __future__ import annotations

import pytest
from app.services.chat import chat_fallback
from app.services.personal_ai import personal_context as pc

pytestmark = pytest.mark.asyncio(loop_scope="session")


def _entry(i: int, name: str = "라운드랩 1025 독도 토너 200ml", funcs=("보습", "진정")) -> pc.ClosetEntry:
    return pc.ClosetEntry(id=i, name=f"{name} {i}", brand="라운드랩", category="스킨케어", price=13500, functions=funcs)


# ── 순수 함수 ─────────────────────────────────────────────────────────────


def test_weak_concerns_picks_low_scores_that_products_can_help() -> None:
    got = pc.weak_concerns({"moisture": 62, "oiliness": 66, "acne": 90, "eye_bag": 40})
    names = [n for n, _ in got]
    # 80점대 이상(acne)과 화장품 성분으로 바뀌기 어려운 항목(눈밑 불룩)은 뺀다. 낮은 순.
    assert [s for _, s in got] == sorted(s for _, s in got)
    assert names == ["수분", "유분"] and got[0][1] == 62


def test_weak_concerns_empty_when_all_fine() -> None:
    assert pc.weak_concerns({"moisture": 85, "oiliness": 90}) == ()


def test_avoid_labels_only_strong_penalties() -> None:
    assert pc.avoid_labels("yuriguseul") == ("향료", "건조 알코올", "자극 소지 성분")
    # 옹달샘은 감점이 모두 3점이라 "피해야 할 성분"으로 말하지 않는다
    assert pc.avoid_labels("ondalsam") == ()
    assert pc.avoid_labels(None) == ()


def test_clean_ingredients_dedupes_and_caps() -> None:
    raw = ["  나이아신아마이드 ", "나이아신아마이드", "x" * 80] + [f"성분{i}" for i in range(40)]
    out = pc.clean_ingredients(raw)
    assert out[0] == "나이아신아마이드" and len(out) == pc.MAX_MY_INGREDIENTS
    assert all(len(n) <= 30 for n in out) and len(set(out)) == len(out)


def test_top_function_names_threshold_and_limit() -> None:
    s = {"H": {"value": 80, "count": 3}, "S": {"value": 60, "count": 2}, "B": {"value": 40, "count": 1}, "W": {"value": 10, "count": 1}}
    assert pc.top_function_names(s) == ("보습", "진정")      # 상위 2개, 25 미만(미백)은 제외
    assert pc.top_function_names({"H": {"value": 10, "count": 1}}) == ()


def test_render_empty_snapshot_is_empty_string() -> None:
    assert pc.render(pc.PersonalSnapshot()) == ""


def test_render_includes_key_facts() -> None:
    s = pc.PersonalSnapshot(
        skin_type="hwasan",
        budget=(50_000, 100_000),
        weak_concerns=(("수분", 62),),
        analysis_date="2026-10-21",
        closet=(_entry(1),),
        closet_total=1,
        my_ingredients=("나이아신아마이드",),
        avoid=("향료",),
    )
    text = pc.render(s)
    for expected in ("울긋불긋 화산", "5만원 ~ 10만원", "수분 62점", "2026-10-21", "피해야 할 성분: 향료", "나이아신아마이드", "내 화장대 (1개)"):
        assert expected in text, expected


def test_render_respects_char_limit_by_dropping_closet_tail() -> None:
    closet = tuple(_entry(i, name="아주아주아주 긴 이름을 가진 화장품 " * 3) for i in range(pc.MAX_CLOSET))
    s = pc.PersonalSnapshot(skin_type="hwasan", closet=closet, closet_total=40)
    text = pc.render(s)
    assert len(text) <= pc.MAX_CHARS
    assert "그 밖에" in text and "내 화장대 (40개" in text      # 빠진 만큼 "그 밖에 N개 더"로 알린다


def test_render_marks_empty_closet() -> None:
    assert "아직 등록한 제품이 없음" in pc.render(pc.PersonalSnapshot(skin_type="mulgae"))


def test_mine_body_lists_closet_without_model() -> None:
    s = pc.PersonalSnapshot(skin_type="hwasan", closet=(_entry(1),), closet_total=1)
    body = chat_fallback.mine_body(s)
    assert "울긋불긋 화산" in body and "1️⃣ **" in body and "주요 기능: 보습·진정" in body


def test_closet_match_by_name_then_kind() -> None:
    cream = pc.ClosetEntry(id=2, name="에스트라 아토베리어365 크림 80ml", brand="에스트라", category="스킨케어", price=29700)
    toner = _entry(1)
    s = pc.PersonalSnapshot(closet=(toner, cream), closet_total=2)
    assert chat_fallback._closet_match("에스트라 비슷한데 더 싼 거", s) is cream      # 브랜드(제품명 단어)가 있으면 그 제품
    assert chat_fallback._closet_match("내 화장대 크림보다 싼 거 있어?", s) is cream   # 종류 단어
    assert chat_fallback._closet_match("내 화장대 세럼보다 싼 거", s) is None
