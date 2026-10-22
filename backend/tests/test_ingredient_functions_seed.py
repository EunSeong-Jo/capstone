"""성분 기능 분류 시드(scripts/seed_ingredient_functions.py)의 CSV 검사.

**DB에 붙지 않는다.** 라벨 파일 자체가 분류표(README)를 지키는지를 고정한다 —
허용 코드 밖의 값이 한 줄이라도 있으면 적재 스크립트가 통째로 거부하므로, 여기서 먼저 잡는다.
"""
from __future__ import annotations

import csv
import importlib.util
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
CSV_PATH = REPO / "data/seed/ingredient_functions/labels.csv"
SCRIPT = REPO / "scripts/seed_ingredient_functions.py"

# 컨테이너에는 scripts/·data/가 없어 이 파일을 수집·실행할 수 없다(test_volume_parsing과 같은 사정).
pytestmark = pytest.mark.skipif(
    not (CSV_PATH.exists() and SCRIPT.exists()), reason="저장소 루트의 scripts/·data/가 필요하다"
)


@pytest.fixture(scope="module")
def seed():
    spec = importlib.util.spec_from_file_location("seed_ingredient_functions", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="module")
def rows():
    with open(CSV_PATH, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def test_labels_csv_passes_the_vocabulary_check(seed, rows):
    parsed, errors = seed.parse(rows)
    assert errors == []
    assert len(parsed) == len(rows)


def test_norm_names_are_unique(rows):
    names = [r["norm_name"] for r in rows]
    assert len(names) == len(set(names))


def test_emollients_carry_the_moisturizing_function(rows):
    # README 지침: 에몰리언트·오일·버터(역할 e)는 보습(H)을 함께 단다.
    assert [r["norm_name"] for r in rows if r["role"] == "e" and "H" not in r["functions"]] == []


def test_junk_rows_have_no_functions_or_flags_and_actives_have_functions(rows):
    # 오염(j)은 분류 제외라 기능·플래그가 없다. 활성(a)은 기능이 있어야 한다.
    # (용매·유화제·방부 보조제가 습윤 효과도 낼 때 H를 달 수 있으므로 s/f/t/p는 기능을 가질 수 있다.)
    for r in rows:
        if r["role"] == "j":
            assert r["functions"] == "" and r["flags"] == "", r["norm_name"]
        if r["role"] == "a":
            assert r["functions"] != "", r["norm_name"]


def test_fragrance_allergens_are_flagged_with_high_confidence(rows):
    by_ko = {r["name_ko"]: r for r in rows}
    for name in ("리날룰", "리모넨", "시트랄", "제라니올"):
        if name in by_ko:
            assert "F" in by_ko[name]["flags"] and by_ko[name]["confidence"] == "3", name


def test_allergen_listed_rows_match_the_mfds_list(rows):
    """allergen_listed는 식약처 고시 목록(allergens_mfds.csv)과 정확히 같은 성분이고, 향료(F)·확신도 3이다."""
    listed = {r["norm_name"] for r in rows if r.get("allergen_listed") == "1"}
    with open(REPO / "data/seed/ingredient_functions/allergens_mfds.csv", encoding="utf-8-sig", newline="") as f:
        official = {r["norm_name"] for r in csv.DictReader(f)}
    assert listed == official
    for r in rows:
        if r.get("allergen_listed") == "1":
            assert "F" in r["flags"] and r["confidence"] == "3" and r["source"] == "mfds", r["norm_name"]


def test_drying_alcohols_are_confident(rows):
    # 하드 필터(건조 알코올)의 근거라 정체가 분명한 알코올류는 확신도 3이어야 한다.
    by = {r["norm_name"]: r for r in rows}
    for name in ("에탄올", "변성알코올", "알코올"):
        assert "L" in by[name]["flags"] and by[name]["confidence"] == "3", name


def test_seed_parser_rejects_bad_rows(seed):
    good = {"norm_name": "x", "functions": "H", "role": "a", "flags": "", "confidence": "3", "source": "ai_expert"}
    assert seed.parse([good])[1] == []
    for bad in (
        {**good, "functions": "Z"},
        {**good, "role": "q"},
        {**good, "flags": "Q"},
        {**good, "confidence": "4"},
        {**good, "source": "llm"},
        {**good, "role": "a", "functions": ""},          # 활성인데 기능이 없다
        {**good, "role": "j", "functions": "H"},         # 오염인데 기능이 있다
        {**good, "norm_name": ""},
        {**good, "allergen_listed": "1"},                # 고시 목록인데 향료·확신도 조건 위반
    ):
        assert seed.parse([bad])[1], bad
    assert seed.parse([good, good])[1]                    # 중복
