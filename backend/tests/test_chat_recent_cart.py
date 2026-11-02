"""'그 루틴 담아줘'가 직전에 보여 준 제품을 그대로 고르는지."""
from types import SimpleNamespace as R

from app.services.chat_tools import pick_recent_for_cart

RECENT = [
    R(id=44, name="라운드랩 포 맨 소나무 진정 시카 토너 200ml"),
    R(id=267, name="넘버즈인 1번 판토텐산 액티브업 수딩세럼 50ml"),
    R(id=106, name="톤28 해남404 글로우 크림앤세럼 50ml"),
    R(id=897, name="VT 피디알엔 에어 클라우드 선스크린 50ml"),
]


def test_refers_back_takes_all_recent_cards() -> None:
    got = pick_recent_for_cart("그 루틴 장바구니에 담아줘", RECENT)
    assert [r.id for r in got] == [44, 267, 106, 897]


def test_named_product_takes_only_that_one() -> None:
    got = pick_recent_for_cart("라운드랩 포 맨 소나무 진정 시카 토너 장바구니에 담아줘", RECENT)
    assert [r.id for r in got] == [44]


def test_kind_word_filters_the_recent_cards() -> None:
    got = pick_recent_for_cart("추천한 것 중 세럼만 장바구니에 담아줘", RECENT)
    assert [r.id for r in got] == [267, 106]


def test_not_a_cart_request_or_no_recent_cards_is_ignored() -> None:
    assert pick_recent_for_cart("그 루틴 설명해줘", RECENT) is None
    assert pick_recent_for_cart("그 루틴 장바구니에 담아줘", []) is None
    # 직전 카드와 무관한 새 제품 요청은 모델에게 맡긴다
    assert pick_recent_for_cart("메디힐 세럼 장바구니에 담아줘", RECENT) is None


def test_new_routine_or_recommendation_request_is_not_the_recent_cards() -> None:
    # 영상 6 대본: 새 루틴을 짜서 담아 달라는 요청은 모델이 처리한다
    assert pick_recent_for_cart("7만원으로 루틴 짜서 장바구니에 담아줘", RECENT) is None
    assert pick_recent_for_cart("토너 추천해서 장바구니에 담아줘", RECENT) is None
    # 과거형은 직전 답변을 가리킨다
    assert pick_recent_for_cart("추천한 제품 장바구니에 담아줘", RECENT) is not None


def test_dispute_of_the_recent_recommendation_is_detected_but_source_questions_are_not() -> None:
    from app.services.chat_tools import is_dispute_of_recent

    assert is_dispute_of_recent("아니 추천한 거랑 다른 제품이 나왔잖아. 틀렸어", RECENT)
    assert is_dispute_of_recent("그 제품 잘못된 정보 아니야?", RECENT)
    # 출처를 묻는 정당한 질문은 모델이 답한다
    assert not is_dispute_of_recent("이거 내 화장대에 있던 제품 아니야? 틀린 거 같은데", RECENT)
    # 직전 카드가 없으면 반박할 대상이 없다
    assert not is_dispute_of_recent("틀렸어", [])
    assert not is_dispute_of_recent("토너 추천해줘", RECENT)


def test_price_verification_questions_count_as_disputes() -> None:
    from app.services.chat_tools import is_dispute_of_recent

    assert is_dispute_of_recent("가격이 이상한데 정확한 거 맞아?", RECENT)
    assert is_dispute_of_recent("진짜 있는 제품이야?", RECENT)
    assert not is_dispute_of_recent("가격이 얼마야?", RECENT)           # 단순 가격 질문은 모델이 답한다
