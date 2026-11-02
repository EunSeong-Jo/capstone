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
