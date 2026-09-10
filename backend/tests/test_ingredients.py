"""전성분 파서 특성 테스트 (characterization test).

`app/utils/ingredients.py`에는 지금까지 테스트가 없었다. docstring의 doctest
3개도 `--doctest-modules` 설정이 없어 실행되지 않는다. 파서를 고치면 유사도
결과가 통째로 달라지는데 회귀를 잡을 방법이 없는 상태였다.

**이 파일은 "옳은 동작"이 아니라 "현재 동작"을 적는다.** 파서를 개선할 때
무엇이 바뀌는지 눈에 보이게 하는 것이 목적이다. 의도적으로 동작을 바꾸면 여기
기대값도 함께 고치되, 무엇이 왜 바뀌는지 커밋 메시지에 남긴다.

DB에 붙지 않는 순수 함수 테스트라 conftest.py의 async/DB 픽스처와 무관하다.
"""
from __future__ import annotations

import pytest

from app.utils.ingredients import normalize, normalize_loose, parse_ingredients

# ── parse_ingredients — 구분자 판별 ──────────────────────────


def test_comma_is_the_default_separator():
    assert parse_ingredients("정제수, 글리세린, 판테놀") == ["정제수", "글리세린", "판테놀"]


def test_comma_inside_number_is_not_a_separator():
    """'1,2-헥산다이올'이 쪼개지면 '1'이 최다 성분(5,599회)이 된다."""
    assert parse_ingredients("정제수, 1,2-헥산다이올, 자작나무수액(10,000ppm)") == [
        "정제수",
        "1,2-헥산다이올",
        "자작나무수액(10,000ppm)",
    ]


def test_comma_inside_parens_is_not_a_separator():
    assert parse_ingredients("정제수, 추출물(에탄올, 물)") == ["정제수", "추출물(에탄올, 물)"]


def test_at_sign_separator_when_comma_yields_one():
    assert parse_ingredients("정제수@글리세린@판테놀") == ["정제수", "글리세린", "판테놀"]


def test_space_separator_needs_vocab():
    vocab = {"정제수", "글리세린", "판테놀"}
    assert parse_ingredients("정제수 글리세린 판테놀", vocab) == ["정제수", "글리세린", "판테놀"]


def test_space_without_vocab_stays_one_token():
    """vocab이 없으면 공백은 구분자가 아니다 — 최장일치를 판정할 근거가 없다."""
    assert parse_ingredients("정제수 글리세린 판테놀") == ["정제수 글리세린 판테놀"]


def test_slash_is_never_a_separator():
    """'약모밀꽃/잎/줄기수'는 성분명 하나다. 자르면 없는 성분이 생긴다."""
    assert parse_ingredients("약모밀꽃/잎/줄기수") == ["약모밀꽃/잎/줄기수"]


@pytest.mark.parametrize("raw", ["", "   ", None])
def test_empty_input_returns_empty_list(raw):
    assert parse_ingredients(raw) == []


def test_parsed_tokens_are_not_normalized():
    """분리와 정규화는 별개 단계다. 함량 괄호가 그대로 남는다."""
    assert parse_ingredients("살리실릭애씨드(0.5%), 정제수")[0] == "살리실릭애씨드(0.5%)"


# ── normalize ───────────────────────────────────────────────


def test_normalize_strips_amount_parens():
    assert normalize("살리실릭애씨드(0.5%)") == "살리실릭애씨드"
    assert normalize("자작나무수액(10,000ppm)") == "자작나무수액"
    assert normalize("레티놀(0.5 %)") == "레티놀"


def test_normalize_strips_trailing_marker():
    assert normalize("부틸렌글라이콜*") == "부틸렌글라이콜"


def test_normalize_removes_all_whitespace():
    assert normalize("알로에 페리추출물") == "알로에페리추출물"


def test_normalize_keeps_parens_that_are_part_of_the_name():
    """괄호 안에 문자가 있으면 성분명의 일부로 보고 남긴다."""
    assert normalize("하이드로제네이티드폴리(C6-14올레핀)") == "하이드로제네이티드폴리(C6-14올레핀)"


@pytest.mark.parametrize("raw", ["", None])
def test_normalize_empty_input(raw):
    assert normalize(raw) == ""


# ── normalize_loose ─────────────────────────────────────────


def test_normalize_loose_strips_every_paren():
    """1차 조회 실패 시에만 쓴다 — 성분명의 일부인 괄호까지 날아간다."""
    assert normalize_loose("하이드로제네이티드폴리(C6-14올레핀)") == "하이드로제네이티드폴리"


def test_normalize_loose_matches_normalize_when_no_parens_remain():
    assert normalize_loose("살리실릭애씨드(0.5%)") == normalize("살리실릭애씨드(0.5%)")


# ── 파싱 잔해 정리 (2026-09-10 보강) ─────────────────────────


class TestResidueCleanup:
    """실제 데이터에서 확인된 실패 유형. 각 케이스는 DB 실물에서 뽑았다."""

    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("마그네슘설페이트*(4.75 ppb)", "마그네슘설페이트"),
            ("페러스설페이트*(0.1 ppm)", "페러스설페이트"),
            ("비타민C(1.5g)", "비타민C"),
        ],
    )
    def test_marker_before_amount(self, raw, expected):
        """함량 괄호를 먼저 지워야 그 앞의 '*'가 끝으로 와서 마커로 잡힌다."""
        assert normalize(raw) == expected

    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("페녹시에탄올 [iln44077]* 제공된 성분은", "페녹시에탄올"),
            ("황색5호 [ILN41195] *제공된 성분은 동일 제품이라", "황색5호"),
            ("녹색201호 제공된 성분은 동일 제품이라도 경우에 따라", "녹색201호"),
        ],
    )
    def test_notice_and_label_are_cut(self, raw, expected):
        assert normalize(raw) == expected

    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("사이아노코발아민1)", "사이아노코발아민"),
            ("부틸렌글라이콜3)4)5)", "부틸렌글라이콜"),
            ("1,2-헥산다이올3)", "1,2-헥산다이올"),
        ],
    )
    def test_footnote_numbers_are_stripped(self, raw, expected):
        assert normalize(raw) == expected

    def test_ci_number_survives_footnote_rule(self):
        """'(CI 77891)'도 '1)'로 끝난다. 괄호 짝이 맞으면 건드리지 않는다."""
        assert normalize("티타늄디옥사이드(CI 77891)") == "티타늄디옥사이드(CI77891)"

    @pytest.mark.parametrize("junk", ["5)", "[히알루세럼]", "[STEP1]"])
    def test_label_only_token_becomes_empty(self, junk):
        """빈 문자열이 되면 load_products.resolve가 None으로 흘려보낸다."""
        assert normalize(junk) == ""

    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("아시아틱애씨드 [STEP3] 정제수, 글리세린", ["아시아틱애씨드", "정제수", "글리세린"]),
            ("[본품/증정 동일] 정제수, 글리세린", ["정제수", "글리세린"]),
        ],
    )
    def test_section_label_splits_ingredients(self, raw, expected):
        """라벨은 구간 경계다. 지우기만 하면 앞뒤 성분이 한 덩어리가 된다."""
        assert parse_ingredients(raw) == expected

    def test_section_label_left_alone_without_commas(self):
        """공백 구분 문자열(618건 중 11건)은 vocab 최장일치 경로를 타야 한다.

        여기서 라벨을 쉼표로 바꾸면 쉼표 분기가 먼저 끝나버려, 전성분 전체가
        성분 하나로 등록된다. 실제로 그렇게 만들었다가 신규 성분 105건이
        생기는 것을 보고 좁혔다.
        """
        vocab = {"정제수", "글리세린", "소듐하이알루로네이트"}
        got = parse_ingredients("[울트라 퓨어] 정제수 글리세린 소듐하이알루로네이트", vocab)
        assert got[-2:] == ["글리세린", "소듐하이알루로네이트"]
