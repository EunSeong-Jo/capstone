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
