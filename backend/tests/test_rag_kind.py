"""제품 검색 — 종류 단어(크림·토너…)와 요청 말투 처리 (공용 DB 읽기 전용)."""
from __future__ import annotations

import pytest

from app.db.session import AsyncSessionLocal
from app.services import rag

pytestmark = pytest.mark.asyncio(loop_scope="session")


def test_kind_words_drops_cream_inside_sunscreen() -> None:
    assert rag.kind_words("건조한데 좋은 크림 있어?") == ["크림"]
    assert rag.kind_words("3만원 이하 선크림") == ["선크림"]
    assert rag.kind_words("나이아신아마이드 들어간 세럼") == ["세럼"]
    assert rag.kind_words("피부가 건조해요") == []


def test_tokenize_drops_request_words_but_never_returns_empty() -> None:
    assert rag._tokenize("건조한데 좋은 크림 있어?") == ["건조한데", "크림"]
    assert rag._tokenize("추천해줘") == ["추천해줘"]        # 다 걸러지면 원래 토큰을 남긴다


async def test_search_with_kind_word_returns_only_that_kind() -> None:
    async with AsyncSessionLocal() as db:
        got = await rag.search_products(db, "건조한데 좋은 크림 있어?", None, top_k=5)
    assert got and all("크림" in p["name"] for p in got)


# ── 챗봇 컨텍스트의 궁합 표시 (DB 없이 도는 순수 함수) ──────────────────────────────

def test_fit_text_matches_card_wording() -> None:
    assert rag.fit_text({"score": 72, "verdict": "good", "fragrance": False, "alcohol": False}) == "잘 맞음(72점)"
    assert rag.fit_text({"score": 58, "verdict": "ok", "fragrance": False, "alcohol": False}) == "무난(58점)"
    assert rag.fit_text({"score": 20, "verdict": "caution", "fragrance": True, "alcohol": True}) == "주의(20점), 향료 포함, 건조 알코올 포함"


def test_fit_text_never_shows_a_score_when_evidence_is_missing() -> None:
    # 판단 근거 부족은 '무난'이 아니다 — 점수를 붙이면 모델이 무난하다고 읽는다
    assert rag.fit_text({"score": None, "verdict": "unknown", "fragrance": False, "alcohol": False}) == "판단 근거 부족"
    assert rag.fit_text({"score": 50, "verdict": "unknown", "fragrance": False, "alcohol": False}) == "판단 근거 부족"


def test_fit_text_is_empty_without_skin_type_or_row() -> None:
    assert rag.fit_text(None) == ""
    assert rag.fit_text({}) == ""


def test_render_products_context_adds_fit_only_when_known() -> None:
    base = {"name": "A 토너", "brand": "브랜드", "category": "스킨케어", "price": 12000, "rating": 4.5, "ingredients": ["정제수"]}
    with_fit = rag.render_products_context([{**base, "fit": {"score": 70, "verdict": "good", "fragrance": False, "alcohol": False}}])
    assert "내 피부 궁합: 잘 맞음(70점)" in with_fit
    assert "내 피부 궁합" not in rag.render_products_context([base])           # 피부타입을 모를 때
    assert "내 피부 궁합" not in rag.render_products_context([{**base, "fit": None}])  # 계산 전
    assert rag.render_products_context([]) == "현재 등록된 제품 데이터 없음"


def test_system_prompt_uses_fit_instead_of_denying_it() -> None:
    from app.api import chat

    assert "아직 없다" not in chat._SYSTEM_TEMPLATE
    assert "내 피부 궁합" in chat._SYSTEM_TEMPLATE
    # 템플릿이 format()으로 채워지는지(중괄호 오타 방지)
    chat._SYSTEM_TEMPLATE.format(
        skin_type_label="x", weather_context="x", personal_context="x", products_context="x"
    )
