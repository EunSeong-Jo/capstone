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
    """괄호 안에 문자가 있으면 성분명의 일부로 보고 남긴다.

    조회 키라서 대소문자는 소문자로 통일된다.
    """
    assert normalize("하이드로제네이티드폴리(C6-14올레핀)") == "하이드로제네이티드폴리(c6-14올레핀)"


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
            ("비타민C(1.5g)", "비타민c"),
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

    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("카올린²", "카올린"),
            ("1,2-헥산다이올⁶", "1,2-헥산다이올"),
            ("소듐하이드록사이드¹", "소듐하이드록사이드"),
        ],
    )
    def test_superscript_footnote(self, raw, expected):
        """유니코드 위첨자도 각주다. '1)' 형태와 같은 취급."""
        assert normalize(raw) == expected

    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("아시아티코사이드#", "아시아티코사이드"),
            ("아시아티코사이드#(2,000ppm)", "아시아티코사이드"),
        ],
    )
    def test_hash_marker(self, raw, expected):
        """'#'도 인증 표시다. 함량 괄호를 먼저 지워야 끝으로 와서 잡힌다."""
        assert normalize(raw) == expected

    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("① 캐모마일꽃수", "캐모마일꽃수"),
            ("①정제수", "정제수"),
            ("*살리실릭애씨드", "살리실릭애씨드"),
        ],
    )
    def test_leading_marker(self, raw, expected):
        """제형 번호·인증 표시가 앞에 붙는 경우. 성분명은 이런 문자로 시작하지 않는다."""
        assert normalize(raw) == expected

    @pytest.mark.parametrize(
        "raw", ["폴리솔베이트40", "소듐아크릴레이트크로스폴리머-2", "1,2-헥산다이올", "판테놀"]
    )
    def test_trailing_digits_are_part_of_the_name(self, raw):
        """평범한 숫자는 각주가 아니다. 위첨자만 지운다."""
        assert normalize(raw) == raw

    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("'정제수", "정제수"),
            ('"정제수', "정제수"),
            ('리날룰"', "리날룰"),
            ('에스에이치-올리고펩타이드-1"', "에스에이치-올리고펩타이드-1"),
        ],
    )
    def test_stray_quotes(self, raw, expected):
        """CSV 인용부호가 성분명으로 새어 든 것. 앞뒤 양쪽에 붙는다."""
        assert normalize(raw) == expected

    @pytest.mark.parametrize(
        "raw,expected",
        [("■", ""), ("■ 정제수", "정제수"), ("■ 로즈힙씨오일(100%)", "로즈힙씨오일")],
    )
    def test_bullet_marker(self, raw, expected):
        assert normalize(raw) == expected

    def test_comma_with_space_inside_number(self):
        """'1, 2-헥산다이올'처럼 띄어 쓴 표기가 실제로 있다(제품 12건).

        쉼표 바로 다음 글자만 보면 공백이라 숫자 판정에 실패해 쪼개졌고,
        그 결과 '1'이 DF=12짜리 가짜 성분으로 등록돼 있었다.
        """
        assert parse_ingredients("글리세린, 1, 2-헥산다이올, 프로판다이올") == [
            "글리세린",
            "1, 2-헥산다이올",
            "프로판다이올",
        ]
        # normalize가 공백을 없애 표준명과 같아진다.
        assert normalize("1, 2-헥산다이올") == "1,2-헥산다이올"

    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("피이지-90, 1,2-헥산다이올", ["피이지-90", "1,2-헥산다이올"]),
            ("폴리솔베이트20, 1,2-헥산다이올", ["폴리솔베이트20", "1,2-헥산다이올"]),
            ("C12-14알케스-12, 4-t-부틸사이클로헥산올", ["C12-14알케스-12", "4-t-부틸사이클로헥산올"]),
        ],
    )
    def test_number_ending_name_still_splits(self, raw, expected):
        """앞 성분이 숫자로 끝나고 다음이 숫자로 시작해도 구분자다.

        쉼표 앞 '한 글자'만 보면 이것도 성분명 내부 쉼표로 오판한다. 실제로
        그렇게 만들었다가 '피이지-90, 1,2-헥산다이올'이 한 덩어리로 등록되는
        것을 보고, 띄어 쓴 경우에는 **모은 것이 전부 숫자일 때만** 내부
        쉼표로 보도록 좁혔다.
        """
        assert parse_ingredients(raw) == expected

    @pytest.mark.parametrize(
        "raw",
        [
            "비스-에톡시다이글라이콜사이클로헥산1,4-다이카복실레이트",
            "향료 *100,000ppm",
        ],
    )
    def test_inner_comma_without_space_is_protected(self, raw):
        """붙여 쓴 경우는 앞뒤 글자만 본다 — 성분명 안의 숫자 쉼표다.

        띄어 쓴 경우의 규칙(모은 것이 전부 숫자)을 여기까지 적용했다가
        이 성분들이 쪼개지는 것을 보고 공백 유무로 판정을 나눴다.
        """
        assert parse_ingredients(f"{raw}, 정제수") == [raw, "정제수"]

    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("리모넨* (*에센셜 오일에 포함된 표기성분)", "리모넨"),
            ("콜라겐추출물 *분사제 : 이산화탄소", "콜라겐추출물"),
            ("토코페롤 * 무첨가 성분: 페녹시에탄올", "토코페롤"),
            ("징크피씨에이 (100 ppb) * 10종 복합 히아루론산 총 함량 100 ppm", "징크피씨에이"),
            ("제라니올 *아이소이에서 사용하는 에탄올은 식물발효성분입니다.", "제라니올"),
        ],
    )
    def test_footnote_explanation_is_cut(self, raw, expected):
        """'*' 뒤 설명에 실제 성분이 묻혀 있다. 그 앞만 남긴다."""
        assert normalize(raw) == expected

    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("부틸렌글라이콜*", "부틸렌글라이콜"),
            ("마그네슘설페이트*(4.75 ppb)", "마그네슘설페이트"),
        ],
    )
    def test_trailing_star_is_not_a_footnote_text(self, raw, expected):
        """끝의 '*'와 함량 앞의 '*'는 설명이 아니라 마커다. 자르면 안 된다."""
        assert normalize(raw) == expected

    @pytest.mark.parametrize(
        "raw,head",
        [
            ("리날룰 STEP 02 : 인텐시브 샤이닝 마스크 정제수, 글리세린", "리날룰"),
            ("리모넨 STEP 02. 콜라겐 스킨 핏 마스크 정제수, 글리세린", "리모넨"),
        ],
    )
    def test_step_label_recovers_preceding_ingredient(self, raw, head):
        """대괄호 없는 'STEP NN'도 구간 경계다.

        앞 구간의 마지막 성분이 라벨에 붙어 통째로 묻히던 것을 되살린다.
        라벨 뒤의 제품명은 여전히 남지만, 최소한 실제 성분은 회수된다.
        """
        assert parse_ingredients(raw)[0] == head

    @pytest.mark.parametrize(
        "raw",
        [
            "합성 향료 및 알러젠 (최종 공정 무첨가)",
            "제품 패키지에 포함된 성분 목록을 참고 부탁 드립니다.",
            "있습니다.",
            "참고하시거나",
            "부탁",
        ],
    )
    def test_notice_text_is_not_an_ingredient(self, raw):
        """성분이 아니라 표기 문구다. 통째로 버린다.

        에스티로더 계열과 바이오더마가 전성분 뒤에 붙이는 표준 문구가
        쉼표로 쪼개져 조각으로 등록돼 있었다. 협회 사전 21,910종에 이런
        표현을 가진 성분은 하나도 없어 안전하다.
        """
        assert normalize(raw) == ""

    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("페녹시에탄올 제공된 성분은 동일 제품이라도 변경될 수 있습니다.", "페녹시에탄올"),
            ("토코페롤 * 무첨가 성분: 페녹시에탄올", "토코페롤"),
            ("황색5호 [ILN41195] *제공된 성분은 동일 제품이라도", "황색5호"),
        ],
    )
    def test_ingredient_before_notice_survives(self, raw, expected):
        """문구 앞에 실제 성분이 붙어 있으면 그것만 남긴다.

        문구 판정을 절단보다 먼저 하면 성분까지 함께 버려진다 — 순서가 중요하다.
        """
        assert normalize(raw) == expected

    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("소듐클로라이드，하이드록시에틸셀룰로오스", ["소듐클로라이드", "하이드록시에틸셀룰로오스"]),
            ("세럼: 정제수, 글리세린", ["세럼", "정제수", "글리세린"]),
            ("피브이피.정제수.글리세린.카올린", ["피브이피", "정제수", "글리세린", "카올린"]),
        ],
    )
    def test_alternative_separators(self, raw, expected):
        """전각 쉼표·콜론·한글 사이 마침표도 구분자다.

        협회 사전 21,910종에 이 문자를 가진 성분은 하나도 없어 안전하다.
        마침표는 양쪽이 한글일 때만 본다 — 숫자 소수점과 구별해야 한다.
        """
        assert parse_ingredients(raw) == expected

    @pytest.mark.parametrize("junk", ["1,2", "E65R", "TONIC", "FACE", "PEG", "-"])
    def test_token_without_hangul_is_dropped(self, junk):
        """이 카탈로그는 전성분이 전부 한글 표기다(영문 전용 제품 0건).

        한글이 하나도 없으면 라벨·코드 조각이다.
        """
        assert normalize(junk) == ""

    def test_hangul_with_ascii_survives(self):
        assert normalize("c18-21알케인") == "c18-21알케인"

    @pytest.mark.parametrize(
        "label", ["앰플", "에센스", "스킨", "본품", "전성분", "■토너", "1제", "리필"]
    )
    def test_form_label_is_dropped(self, label):
        """콜론을 구분자로 쓰면서 '세럼: 정제수'의 앞쪽이 토큰으로 떨어진다.

        성분이 아니면서 여러 제품에 반복 등장해 공통 성분처럼 보이므로,
        DF=1 잔해보다 해롭다. 실제로 '앰플'·'에센스'가 DF 3~8로 생기는 것을
        보고 추가했다.
        """
        assert normalize(label) == ""

    @pytest.mark.parametrize(
        "upper,lower",
        [
            ("C18-21알케인", "c18-21알케인"),
            ("4-T-부틸사이클로헥산올", "4-t-부틸사이클로헥산올"),
            ("T-부틸알코올", "t-부틸알코올"),
        ],
    )
    def test_case_is_folded(self, upper, lower):
        """조회 키라서 대소문자를 통일한다.

        같은 성분이 'C18-21알케인'과 'c18-21알케인'으로 갈려 별개 행이 돼
        있었다. 표시용 이름(name_ko)은 원문을 그대로 쓴다.
        """
        assert normalize(upper) == normalize(lower)

    def test_invisible_characters_are_stripped(self):
        """웹에서 복사하면 제로폭 공백이 딸려 온다. 눈에 안 보여 찾기 어렵다."""
        assert normalize("소듐하이드록사이드​") == "소듐하이드록사이드"
        assert normalize("글리세린﻿") == "글리세린"

    @pytest.mark.parametrize(
        "raw,expected",
        [("리날룰(", "리날룰"), ("시트랄(", "시트랄"), ("온천수)", "온천수"), ("-헥산다이올", "헥산다이올")],
    )
    def test_lone_paren_and_hyphen(self, raw, expected):
        assert normalize(raw) == expected

    @pytest.mark.parametrize(
        "raw,expected",
        [("바쿠치올(100ppm）", "바쿠치올"), ("판테놀％", "판테놀%"), ("리날룰 []", "리날룰")],
    )
    def test_fullwidth_characters(self, raw, expected):
        """한쪽만 전각인 표기가 있다. ASCII로 바꿔야 함량 제거가 걸린다."""
        assert normalize(raw) == expected

    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("토타네올™ ++표시", "토타네올™"),
            ("시트랄 + 표시", "시트랄"),
            ("리날룰(+표시,Napiers original Formula", "리날룰"),
        ],
    )
    def test_marker_notation_is_cut(self, raw, expected):
        """'*표시'·'+표시'는 각주 기호의 뜻을 설명하는 자리다. 뒤만 자른다."""
        assert normalize(raw) == expected

    @pytest.mark.parametrize(
        "raw",
        [
            "(ANTI-SEBUM P 성분 *표기) 정제수",
            "(밀크 콜라겐™ 성분 * 표기) 정제수",
            "(독점 조성물 티트리 카밍 바이옴 성분 *표기) 정제수",
        ],
    )
    def test_leading_paren_label(self, raw):
        """각주 기호를 설명하는 괄호가 첫 성분 **앞**에 붙는 경우.

        _NOTICE로 뒤를 자르면 정작 성분(정제수)이 함께 날아간다.
        괄호 안에 '표기'·'표시'가 있을 때만 라벨로 본다.
        """
        assert normalize(raw) == "정제수"

    def test_paren_in_name_is_not_a_label(self):
        assert normalize("하이드로제네이티드폴리(C6-14올레핀)") == "하이드로제네이티드폴리(c6-14올레핀)"

    def test_notice_is_cut_before_space_segmentation(self):
        """쉼표 없이 공백으로 구분하는 제품(바비브라운 계열)이 있다.

        토큰별로 안내문구를 지우면 늦다 — vocab 분리를 타면서 문장이
        단어별로 쪼개져 '경우에'·'따라'·'변경될'·'수'가 각각 성분이 됐다.
        """
        vocab = {"리날룰", "제라니올", "페녹시에탄올"}
        raw = ("리날룰 [] 제라니올 [] 페녹시에탄올 제공된 성분은 동일 제품이라도 "
               "경우에 따라 변경될 수 있습니다.")
        got = [normalize(t) for t in parse_ingredients(raw, vocab)]
        assert "경우에" not in got and "따라" not in got
        assert got[-1] == "페녹시에탄올"

    def test_cream_is_a_real_ingredient(self):
        """'크림'은 협회 사전에 정식 성분으로 있다. 라벨 목록에서 뺐다."""
        assert normalize("크림") == "크림"

    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("판테놀 5%", "판테놀"),
            ("갈락토미세스발효여과물 100%", "갈락토미세스발효여과물"),
            ("에델바이스꽃/잎추출물 100,000ppm", "에델바이스꽃/잎추출물"),
        ],
    )
    def test_amount_outside_parens(self, raw, expected):
        """괄호 없이 적은 함량. _AMOUNT는 괄호 안만 본다."""
        assert normalize(raw) == expected

    def test_unbalanced_paren_in_dictionary_is_left_alone(self):
        """협회 사전에도 괄호 짝이 안 맞는 성분이 2종 있다. 건드리면 안 된다."""
        name = "비스(트라이옥틸도데실시트릴다이리놀리에이트"
        assert normalize(name) == name

    def test_ci_number_survives_footnote_rule(self):
        """'(CI 77891)'도 '1)'로 끝난다. 괄호 짝이 맞으면 건드리지 않는다."""
        assert normalize("티타늄디옥사이드(CI 77891)") == "티타늄디옥사이드(ci77891)"

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


class TestParseResidueCleanup:
    """PR #36 잔해 정리에서 추가한 규칙들.

    단일제품에 쓰이는 사전 미등록 성분 397종을 전수로 훑어 유형을 나눈 뒤,
    구조가 분명한 것만 규칙으로 만들었다. 각 규칙은 협회 사전 22,498종에
    대해 오탐 0건을 확인하고 넣었다 — 그 확인이 이 테스트의 전제다.
    """

    @pytest.mark.parametrize(
        "raw,expected",
        [
            # 공백 없이 붙거나 '*'를 끼고 오는 함량 표기
            ("향료*100,000ppm", "향료"),
            ("병풀잎추출물0.2%", "병풀잎추출물"),
            ("토코페롤*40,000ppm", "토코페롤"),
            # 단위 대문자
            ("3-0-에틸아스코빅애씨드 (10,000 PPB)", "3-0-에틸아스코빅애씨드"),
            ("토코페볼(22.65 PPM)", "토코페볼"),
            # 표 머리글이 첫 성분에 이어 붙은 것
            ("전성분정제수", "정제수"),
            ("성분명 : 정제수", "정제수"),
            # 구명칭 병기 괄호
            ("어성초추출물(=약모밀추출물,10ppm)", "어성초추출물"),
            # 제품명이 통째로 붙은 것
            ("하우스오브비글루타티온페이스필름정제수", "정제수"),
            # 표기성분 코드
            ("토코페롤<iln51009>", "토코페롤"),
            ("청색1호〈iln54376>", "청색1호"),
        ],
    )
    def test_residue_is_stripped(self, raw, expected):
        assert normalize(raw) == expected

    @pytest.mark.parametrize("junk", ["성분", "전성분명"])
    def test_label_alone_becomes_empty(self, junk):
        assert normalize(junk) == ""

    @pytest.mark.parametrize(
        "raw,expected",
        [
            # 구간 라벨 괄호는 성분 사이 경계다. 지우면 두 성분이 붙는다.
            ("페녹시에탄올(2제) 정제수, 글리세린", ["페녹시에탄올", "정제수", "글리세린"]),
            ("황색4호(내용물) 정제수, 향료", ["황색4호", "정제수", "향료"]),
            (
                "<스킨1004마다가스카르센텔라라이트클렌징오일200ml>에틸헥실스테아레이트, 향료",
                ["에틸헥실스테아레이트", "향료"],
            ),
        ],
    )
    def test_step_paren_splits_ingredients(self, raw, expected):
        assert parse_ingredients(raw) == expected

    @pytest.mark.parametrize(
        "keep",
        [
            "자작나무수액(10,000ppm)",     # 함량은 떼되 성분은 남는다
            "하이드로제네이티드폴리(C6-14올레핀)",  # 성분명의 괄호
            "1,2-헥산다이올",
            "c10-30알킬아크릴레이트크로스폴리머",
        ],
    )
    def test_real_names_survive(self, keep):
        """규칙이 넓어졌어도 멀쩡한 이름을 건드리면 안 된다."""
        assert normalize(keep)


class TestExcludedCsvFindings:
    """PR #36의 excluded.csv(2,592건)와 대조해 찾아낸 유형.

    그 목록은 성분 25,923건 시절 스냅샷이라 이름으로 직접 대조하면 380건만
    남는데, **어떤 모양이 깨지는지**를 알려주는 쪽으로 썼다. '…정제수'로
    끝나는 이름을 DB에서 훑어 47종의 접합을 찾았고, 그 유형을 규칙으로 만들었다.

    각 규칙은 협회 사전 22,498종에 오탐 0건을 확인하고 넣었다.
    """

    @pytest.mark.parametrize(
        "raw,expected",
        [
            # 짧은 접합. 사전에 '정제수'로 끝나는 다른 이름이 없어 꼬리만 남긴다.
            ("실러정제수", "정제수"),
            ("정정제수", "정제수"),
            ("1제(내상)정제수", "정제수"),
            ("닥터지 더모이스처 배리어 D 인텐스 크림 30ml(구성품) 정제수", "정제수"),
            # 선두 제형 라벨
            ('"로션 정제수', "정제수"),
            ("* 앰플 정제수", "정제수"),
            ("■ 1호 정제수", "정제수"),
            # 짝이 없는 닫는 괄호 앞은 구간 라벨이다
            ("토너)정제수", "정제수"),
            ("리날룰 수딩에센스)정제수", "정제수"),
        ],
    )
    def test_glued_water_is_reduced(self, raw, expected):
        assert normalize(raw) == expected

    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("1) PDRN 클렌징 밀크 정제수, 글리세린", ["PDRN 클렌징 밀크 정제수", "글리세린"]),
            ("다이소듐이디티에이 2) 펌킨 정제수, 향료", ["다이소듐이디티에이", "펌킨 정제수", "향료"]),
        ],
    )
    def test_numbered_label_splits(self, raw, expected):
        """맨 번호 구간 라벨이 성분 경계다."""
        assert parse_ingredients(raw) == expected

    def test_ci_number_survives(self):
        """색소 번호는 같은 꼴이라 자릿수를 막지 않으면 잘린다.

        '(CI 77891)'의 '77891) '가 구간 라벨과 구분이 안 된다. 두 자리까지만
        라벨로 보기로 해서 이 케이스가 살아남는다.
        """
        got = parse_ingredients("정제수, 티타늄디옥사이드(CI 77891) 정제수, 향료")
        assert got[1].startswith("티타늄디옥사이드(CI 77891)")

    def test_footnote_numbers_still_work(self):
        """닫는 괄호 규칙이 각주 번호를 먹으면 성분까지 날아간다.

        '부틸렌글라이콜3)4)5)'는 닫는 괄호가 여는 것보다 많지만 각주다.
        괄호 뒤에 글자가 올 때만 구간 라벨로 본다.
        """
        assert normalize("부틸렌글라이콜3)4)5)") == "부틸렌글라이콜"

    def test_single_char_form_label_is_not_stripped(self):
        """'밤'은 제형이 아니라 밤나무일 수 있다.

        제형 라벨 목록에서 한 글자짜리(젤·폼·밤·오일)를 뺀 이유다 —
        자르면 없는 성분('껍질추출물')이 생긴다.
        """
        assert normalize("밤 껍질추출물") == "밤껍질추출물"
