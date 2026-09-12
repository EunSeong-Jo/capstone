"""내용량·매수 파싱 (scripts/load_products.py).

DB에 붙지 않는 순수 함수라 conftest의 async/DB 픽스처와 무관하게 둔다.
`scripts/`는 패키지가 아니라 경로를 직접 붙여 불러온다 — 적재 스크립트를
`backend/app/` 아래로 옮기면 이 우회는 사라진다.

여기서 고정하는 것은 **표기의 모양별 결과**다. 판매자가 상품정보제공고시에
적는 형식이 제각각이라, 규칙 하나를 고칠 때마다 다른 형식이 깨진다.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

from load_products import parse_unit, parse_volume  # noqa: E402


class TestParseVolume:
    """총 내용량. `내용량_정리`가 입력이고 원문은 보조로만 본다."""

    @pytest.mark.parametrize(
        "tidy,expected",
        [
            ("200ml", (200.0, None)),
            ("240g", (None, 240.0)),
            ("1.5L", (1500.0, None)),
            ("1kg", (None, 1000.0)),
            # '(N개)'는 낱개 수라 총량에 이미 반영돼 있다
            ("600ml (2개)", (600.0, None)),
            # '+'로 이은 구성품은 단위끼리 합산한다
            ("2ml + 28g", (2.0, 28.0)),
            ("15ml + 6g", (15.0, 6.0)),
            # '매'는 동봉 시트라 총량과 무관하다
            ("0.1g + 1매", (None, 0.1)),
            # ml·g 표기가 아예 없는 제품
            ("10매", (None, None)),
            ("각 옵션별 용량이 다름", (None, None)),
            # 머리가 수량이 아니면 앞 구성품을 통째로 놓치므로 비워 둔다
            ("[기획세트 : 500ml+100ml]", (None, None)),
        ],
    )
    def test_tidy_text(self, tidy, expected):
        assert parse_volume(tidy) == expected

    def test_per_unit_notation_is_rejected(self):
        """'1매 기준 0.1g'은 총량이 아니라 한 장 값이다.

        총 매수가 상품명에만 있어(6매) 곱할 수가 없다. 그대로 두면 6매
        마스크의 단가가 10g당 792만원이 된다 — 비우는 편이 정직하다.
        """
        assert parse_volume("0.1g + 1매", "1매 기준 0.1g") == (None, None)
        # 원문에 '기준'이 없으면 그대로 쓴다
        assert parse_volume("0.1g + 1매", "0.1g") == (None, 0.1)


class TestParseUnit:
    """매수·개수. 'sheet'는 소비 단위, 'piece'는 포장 단위다."""

    @pytest.mark.parametrize(
        "tidy,raw,expected",
        [
            # 1) 내용량_정리의 머리 'N매'
            ("100매", "■ 100매", (100, "sheet")),
            ("5매", None, (5, "sheet")),
            # 2) 원문의 'N매' — v5가 매수를 ml로 정규화하며 '매'를 잃은 경우
            ("250ml (10개)", "10매", (10, "sheet")),
            ("330ml (10개)", "10매입", (10, "sheet")),
            # 3) 내용량_정리의 '(N개)'
            ("325ml (2개)", "325ml", (2, "piece")),
            ("10개", None, (10, "piece")),
            # 단위가 없는 제품
            ("200ml", "200ml", (None, None)),
            ("", None, (None, None)),
        ],
    )
    def test_sources_and_priority(self, tidy, raw, expected):
        assert parse_unit(tidy, raw) == expected

    def test_summed_options_are_rejected(self):
        """v5가 옵션을 합산해 버린 경우를 원문과 대조해 거른다.

        '4매/80매'(둘 중 택1)가 '84매'로 정리돼 있다. 990원을 84매로 나누면
        1매당 11원이 되어 단가순 1위로 올라온다.
        """
        assert parse_unit("84매", "4매/80매") == (4, "sheet")
        # 원문의 개수와 맞으면 그대로 쓴다
        assert parse_unit("100매", "100매") == (100, "sheet")

    def test_per_unit_notation_is_not_a_count(self):
        """'1매 기준 0.1g'의 '1매'는 총 매수가 아니라 환산 기준이다."""
        assert parse_unit("0.1g + 1매", "1매 기준 0.1g") == (None, None)

    def test_sheet_beats_piece(self):
        """매수가 있으면 매수가 이긴다.

        사용자가 실제로 소비하는 단위가 '한 장'이라서다. '250ml (10개)'인
        마스크팩은 '1개당'이 아니라 '1매당'으로 보여야 한다.
        """
        assert parse_unit("250ml (10개)", "10매")[1] == "sheet"
