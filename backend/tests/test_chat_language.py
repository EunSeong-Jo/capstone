"""챗봇 답변이 영어로 나왔을 때 한국어로 옮기는 판정."""
from app.api.chat import _is_mostly_english


def test_english_sentence_with_korean_product_names_is_detected() -> None:
    reply = (
        "I couldn't find 메디힐 마데카소사이드 더마 세럼 in the search results. The results only show other products, "
        "such as 포레스트 서울 히알 피톤시카 세럼 50ml. Could you check the product name?"
    )
    assert _is_mostly_english(reply)


def test_korean_reply_with_a_few_latin_words_is_not_flagged() -> None:
    assert not _is_mostly_english("메디힐 마데카소사이드 더마 세럼은 PDRN과 EX 라인이 아니라 진정 중심이에요. 보습 성분이 15종 들어 있어요.")
    assert not _is_mostly_english("")


def test_english_lead_sentence_is_matched_but_korean_sentences_are_not() -> None:
    from app.api.chat import _ENGLISH_LEAD

    m = _ENGLISH_LEAD.match("Since your skin is dry, here are creams with moisturizing ingredients that fit well.\n\n1. 듀이트리 크림")
    assert m and m.group(1).startswith("Since your skin is dry")
    assert _ENGLISH_LEAD.match("건조한 피부에는 크림이 좋아요. Since your skin is dry") is None
    assert _ENGLISH_LEAD.match("PDRN 성분이 들어 있는 토너예요.") is None


def test_english_line_in_the_middle_is_detected_but_product_lines_are_not() -> None:
    from app.api.chat import _is_english_line

    assert _is_english_line("The 균형 combination (59,900원) suits your moisture-focused preference and pore concern, with a light gel cream.")
    assert not _is_english_line("라운드랩 | 18,500원")
    assert not _is_english_line("추천 이유: 진정 계열 토너로 붉어진 피부를 달래 줘요")
    assert not _is_english_line("1️⃣ **VT PDRN Air Cloud Sunscreen 50ml**")      # 제품명(대문자로 시작)은 영어 문장이 아니다


def test_apology_sentences_are_dropped_but_the_rest_stays() -> None:
    from app.api.chat import _drop_apologies

    got = _drop_apologies("아니요, 추천해 드린 4개 제품은 화장대에 있는 제품이 아니에요. 그 점을 분명히 말씀드려야 했는데 죄송해요. 화장대에 있는 제품은 8개예요.")
    assert "죄송" not in got and "화장대에 있는 제품이 아니에요" in got and "8개예요" in got
    assert _drop_apologies("죄송합니다.") == "죄송합니다."            # 사과밖에 없으면 그대로 둔다
    assert "미안" not in _drop_apologies("맞아요, 잘못 안내했어요. 미안해요.\n\n1️⃣ 라운드랩 토너")


def test_tool_names_and_false_self_doubt_are_removed() -> None:
    from app.api.chat import _drop_apologies

    got = _drop_apologies("앞서 보여 드린 4개 제품은 build_routine 도구 결과를 그대로 옮긴 거예요. 다만 앞서 드린 루틴 가격은 제가 도구로 확인한 값이 아니라서 확인이 필요해요. 화장대와 겹치지 않아요.")
    assert "build_routine" not in got and "루틴 추천" in got
    assert "확인한 값이 아니" not in got and "겹치지 않아요" in got
