#!/usr/bin/env python3
"""제품 적재 — 올리브영 크롤링 CSV → products / brands / categories / product_ingredients

    python scripts/load_products.py [--csv 경로] [--options-only]

--options-only  옵션형 묶음 제품의 분해 단계만 실행한다(원본 행 표시 + 옵션 행 적재). 전체 재적재 없이 해당 제품만
                건드려 공용 DB 사용량을 줄인다. 규칙은 app/utils/product_options.py.

멱등하다(goods_no 기준 upsert). 선행 조건: scripts/seed_ingredients.py

적재 기준은 v5 정제본이다(PR #37). 크롤링 원본에는 없는 컬럼들이 여기 있어
사후 보정이 필요 없다 — 카테고리가 이미 교정돼 있고, `처리메모`·`증정기획_정리`
·`상품명_원본`으로 제품 구성을 정확히 판정하며, `내용량_정리`에서 총 내용량을
낸다. 원본 CSV로 돌려도 동작은 하지만(`.get`이 None을 내고 이름 규칙으로
떨어진다) 그 값들이 비거나 부정확해진다.

입력 CSV 컬럼
    공통       카테고리, 브랜드, 상품명, 가격(원), 평점, 리뷰수, 화장품성분,
              사용기한, 내용량, 제조국, 제조사, 이미지URL, 상품URL, 수집일시
    v5 전용    상품명_원본, 처리메모, 증정기획_정리, 내용량_원본,
              내용량_정리, 내용량_확인필요

성분 해석 순서
    1) normalize()      → ingredients.norm_name
    2) 별칭 조회        → ingredient_aliases (is_ambiguous 제외)
    3) normalize_loose() → 괄호까지 제거 후 재시도
    4) is_residue()면 버림 (쪼갤 수 없는 파싱 잔해)
    5) 그 외에는 ingredients에 신규 등록 (code=NULL)
"""
from __future__ import annotations

import argparse
import collections
import csv
import gzip
import re
import sys
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_values

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "backend"))

from app.config import settings  # noqa: E402
from app.utils.composition import (  # noqa: E402
    OPTION_GROUP,
    VALUES as COMPOSITION_VALUES,
    classify,
)
from app.utils.ingredients import (  # noqa: E402
    normalize,
    normalize_loose,
    parse_ingredients,
)
from app.utils.product_options import (  # noqa: E402
    group_name,
    option_goods_no,
    option_row_name,
    plan_options,
)


def bump_cache_version() -> None:
    """products:cache_version INCR — best-effort.

    실패해도 스크립트 자체는 성공으로 끝나야 한다(캐시는 가속기일 뿐,
    적재 성공 여부와 무관하다).
    """
    try:
        import redis
        r = redis.Redis.from_url(
            settings.REDIS_URL, socket_connect_timeout=0.5, socket_timeout=0.5,
        )
        print(f"캐시 버전 갱신 → v{r.incr('products:cache_version')}")
    except Exception as exc:  # noqa: BLE001
        print(f"캐시 버전 갱신 실패(무시): {exc}")

DEFAULT_CSV = REPO / "data/raw/oliveyoung_products_v5.csv"

# 카테고리 오분류 교정 로그. v5 본문에 반영되지 않은 건이 남아 있어
# (52건 중 2건) 여기서 함께 읽는다. 적재 전에 덮어쓰므로 얼굴 4종 밖으로
# 나가는 제품은 아래 ALLOWED_CATEGORIES 필터에서 자연히 빠진다 —
# 적재한 뒤 지우는 것보다 순서 의존이 없다.
CATEGORY_FIX_CSV = REPO / "data/raw/oliveyoung_v5_category_fix.csv"

# 카테고리가 교정돼 분류를 믿을 수 없는 제품. 판정이 '제외'인 행을 적재에서 뺀다.
#
# v5를 적재 기준으로 쓰는 것과 v5의 카테고리를 신뢰하는 것은 별개다. 전성분·
# 상품명·내용량은 규칙이 분명한 정제라 재현 가능하지만, 카테고리는 사람의
# 판단이 들어간 재분류다 — 154건이 바뀌었는데 교정 로그에 사유가 적힌 것은
# 38건뿐이라 나머지를 검증할 방법이 없다. 잘못된 카테고리는 '선케어의
# 대체품이 클렌징'이 되는 결과로 이어진다.
#
# 구 CSV와 v5를 대조해 한 번 만든 목록이다. 매번 다시 대조하지 않는 이유는
# 어떤 제품이 왜 빠지는지가 저장소에 남아야 하기 때문이다 — 나중에 '패드류
# 34건은 교정이 맞다'고 판단하면 그 행의 판정만 바꾸면 된다.
# ingredient_typo_fixes.csv와 같은 방식이다.
DISTRUST_CSV = REPO / "data/seed/category_distrusted.csv"

# 'N종 택1' 기획세트는 호수별 전성분을 한 셀에 이어 붙여 최대 1,978개까지 나온다.
# 이런 행은 '모든 성분을 가진 제품'이 되어 무엇과도 유사해지므로 유사도 계산에서
# 걸러야 하는데, 그 판단은 적재가 아니라 유사도 배치(Task 3)의 몫으로 둔다.
#
# 적재 단계에서 자르지 않는 이유: 100개 임계로 4,478건 중 368건(8.2%)이 잘리는데
# 그 구간에 'VDL 커버 스테인 파운데이션 30ml'(105개) 같은 단일 제품이 섞여 있다.
# 한 번 버린 데이터는 되살릴 수 없으므로 원본을 그대로 두고,
# 소비 측에서 아래 기준으로 제외하는 편이 안전하다.
#
#     WHERE (SELECT count(*) FROM product_ingredients
#            WHERE product_id = p.id) <= 100
#
# 참고 분포(4,478건): 중앙 38 · 90퍼센타일 87 · 95퍼센타일 142 · 최대 1,978
SIMILARITY_SAFE_MAX = 100   # 통계 표시용 기준값 (적재를 막지는 않는다)

# 적재 대상 카테고리. 화이트리스트로 둔 이유는 재수집 때 새 카테고리가
# 조용히 섞여 들어오는 것을 막기 위해서다.
#
# 이 서비스의 축은 '얼굴 피부타입 진단 → 성분이 비슷한 대체품'이다.
# 진단 5개 축이 전부 얼굴 기준이라, 추천 대상도 얼굴용으로 맞춘다.
#
# 뺀 카테고리와 이유:
#   이너뷰티·향수/디퓨저 — 성분 기반 추천이 구조적으로 불가능. 먹는 제품과
#     향료 제품은 전성분 표기 대상이 아니거나 표기 방식이 달라, 수집된
#     60건 중 39건(65%)·48건 중 24건(50%)에 성분이 아예 없다.
#   남성케어(50건) · 헤어케어(75건) · 바디케어(72건) — 성분은 온전하나
#     비교군이 얇다. 브랜드가 41~45개로 흩어져 제품당 브랜드 2개꼴이라
#     의미 있는 성분 교집합이 생기지 않는다. 헤어·바디는 얼굴 진단 결과와
#     연결할 근거도 없다.
#   메이크업(87건) — 위 이유에 더해 데이터가 오염돼 있다. 'N종 택1'
#     기획세트가 호수별 전성분을 한 셀에 이어 붙여 원본 평균 성분이 373개다
#     (전체 평균 42). 호수 정보를 수집할 수 있게 되면 복원 후보.
#
# CSV 원본은 그대로 두므로 이 집합에 다시 추가하면 언제든 복구된다.
ALLOWED_CATEGORIES = {"스킨케어", "마스크팩", "클렌징", "선케어"}

# ── 복수 카테고리 등재 제품의 소속 결정 ───────────────────────────
#
# 같은 goods_no가 여러 카테고리에 등재된 제품이 28건 있다. 클렌징오일처럼
# 올리브영이 실제로 양쪽에 노출하는 제품들이다. 그냥 두면 CSV에서 마지막에
# 온 행이 이기므로 수집 순서에 따라 소속이 달라진다.
#
# 이때만 제품명으로 판정한다. 후보가 하나뿐인 나머지 4,122건은 크롤링
# 카테고리를 그대로 쓴다. 전수 비교 결과 제품명 키워드와 크롤링 카테고리는
# 96.4% 일치하므로(판정 3,766건 중 3,630건), 크롤링 쪽이 이미 충분히
# 정확하다. 전면 교체하면 '패드'처럼 이름만으로 가릴 수 없는 것들
# (토너패드=스킨케어 / 각질패드=클렌징)을 오히려 망가뜨린다.
#
# 후보가 2개일 때는 반대로 제품명이 훨씬 낫다. 28건 중 26건이 키워드로
# 갈리고, '클렌징폼'과 '토너'가 같은 후보쌍에서 정반대로 판정되기 때문에
# 고정 우선순위만으로는 절반이 틀린다.

# 증정품·기획 문구를 떼고 본품 이름만 남긴다.
# '에스트라 리페어 크림 (+마스크 2매)' → '에스트라 리페어 크림'
# 이걸 안 하면 증정품 '마스크'에 걸려 마스크팩이 된다.
_BRAND_PAREN = re.compile(r"^(\S+)\([A-Za-z][A-Za-z0-9&.\s]*\)")  # 차앤박(CNP) …
_PROMO_PRE = re.compile(r"^\s*\[[^\]]*\]\s*")                     # [7월 올영픽] …
_NAME_TAIL = re.compile(
    r"[(\[].*$|\s*\+.*$|\s*(?:기획|단품|리필|증정|택1|골라담기|본품|세트)\b.*$"
)
_NAME_VOLUME = re.compile(r"\s*\d+(?:\.\d+)?\s*(?:ml|g|매|입|ea|호|종|kg|l)\b.*$", re.I)

# 구체적인 카테고리부터 검사한다. 선케어를 맨 앞에 두는 이유는
# '아넷사 퍼펙트 UV 선스크린 스킨케어 밀크'처럼 제형어(스킨·밀크)가
# 뒤에 붙는 제품이 많아서다. 기능어가 제형어를 이겨야 한다.
_CATEGORY_KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    ("선케어", ("선스크린", "선크림", "선스틱", "선쿠션", "선젤", "선세럼", "선밤",
              "선스프레이", "선케어", "선블록", "선로션", "선에센스", "선밀크",
              "선앰플", "선팩트", "썬스크린", "썬크림", "썬스틱", "썬쿠션",
              "썬블록", "자외선", "uv ", "spf")),
    ("마스크팩", ("마스크팩", "시트마스크", "시트팩", "마스크", "모델링팩",
                "머드팩", "워시오프", "토너패드", "패드")),
    ("클렌징", ("클렌징", "클렌저", "클린징", "페이셜폼", "폼클", "워시", "리무버",
              "필링", "스크럽", "고마쥬", "버블폼", "세안", "클렌")),
    ("스킨케어", ("토너", "스킨", "로션", "크림", "세럼", "앰플", "에센스", "미스트",
                "에멀전", "에멀젼", "부스터", "원액", "스팟", "드롭", "트리트먼트",
                "올인원", "스쿠알란", "젤", "오일", "밤", "스프레이", "솔루션",
                "리퀴드", "패치")),
]

# 키워드가 하나도 안 걸릴 때의 폴백. 구체적인 것이 이긴다.
# 스킨케어는 전체의 절반을 차지하는 사실상의 기타 항목이라 항상 진다.
_CATEGORY_PRIORITY = ("선케어", "클렌징", "마스크팩", "스킨케어")


def core_name(name: str) -> str:
    """제품명에서 본품 이름만 남긴다."""
    s = name
    while True:
        stripped = _PROMO_PRE.sub("", s)
        if stripped == s:
            break
        s = stripped
    s = _BRAND_PAREN.sub(r"\1", s)   # 브랜드 영문 괄호는 잘라내지 않는다
    s = _NAME_TAIL.sub("", s)
    s = _NAME_VOLUME.sub("", s)
    return s.strip()


def resolve_category(name: str, candidates: set[str]) -> str:
    """복수 후보 중 하나를 고른다. 후보가 하나면 그대로 반환."""
    if len(candidates) == 1:
        return next(iter(candidates))
    lowered = core_name(name).lower()
    for cat, keywords in _CATEGORY_KEYWORDS:
        if cat in candidates and any(k in lowered for k in keywords):
            return cat
    for cat in _CATEGORY_PRIORITY:
        if cat in candidates:
            return cat
    return next(iter(candidates))

# 성분 칸에 성분 대신 안내문구가 적힌 경우. 판매자가 상품정보제공고시 표에
# 그렇게 입력한 것이라 재수집해도 같은 값이 나온다.
#
#     '상세페이지 참조' · '상품 상세페이지 참고.' · '■ 제품 상세페이지 참조'
#
# 성분이 딱 하나로 파싱될 때만 적용한다. 정상 단일성분 제품
# ('아벤느 온천수(아쿠아)', '로즈힙씨오일(100%)')을 잘못 걸러내지 않기 위해서다.
_PLACEHOLDER = re.compile(r"상세\s*페이지|상품\s*상세|별도\s*표기|해당\s*없음|^\s*없음\s*$")

_GOODS_NO = re.compile(r"goodsNo=([A-Za-z0-9]+)")


# 성분 하나로 접힌 파싱 잔해. 사전에도 별칭에도 없는 이름에만 적용하므로
# (아래 resolve()의 신규 등록 직전), 실재 성분을 지울 여지가 구조적으로 없다.
#
#   1) 구분자 잔류    '향료■파파레서피…클렌저50g옥수수전분'
#   2) 40자 초과      전성분 한 줄이 통째로 한 토큰이 된 것. 진짜 INCI명은
#                    최장 26자다 (c30-45알킬다이메틸실릴폴리프로필실세스퀴옥세인)
#   3) 성분 둘 붙음   '참마뿌리추출물슈도알테로모나스발효추출물'
#                    구분자 없이 '추출물'·'정제수'가 두 번 나오면 접합이다.
#                    협회 사전 22,498종에 이 꼴은 0건이라 오탐이 없다
#
# 쪼개서 살리지 않는 이유: 구분자가 없어 경계를 알 수 없다. 23,000종 사전으로
# 최장일치를 돌리면 '정제수'가 긴 이름 안쪽에서도 걸려 멀쩡한 성분이 갈린다.
# 가짜 성분 하나는 DF=1로 남아 IDF를 최대로 받으므로, 두는 쪽이 더 해롭다.
_RESIDUE_MARK = re.compile(r"[@■<>\[\]]")
_RESIDUE_GLUE = re.compile(r"^[^,/()\[\]]{12,}(?:정제수|추출물)$")


def is_residue(key: str) -> bool:
    """신규 등록 직전 마지막 관문. True면 그 토큰을 통째로 버린다."""
    if _RESIDUE_MARK.search(key) or len(key) > 40:
        return True
    return bool(_RESIDUE_GLUE.match(key)) and (
        key.count("추출물") + key.count("정제수")
    ) >= 2


# 오염이 심한 쪽이 이긴다. goods_no가 같은 행이 여럿일 때 쓴다.
_RANK = {v: i for i, v in enumerate(COMPOSITION_VALUES)}


def row_composition(r: dict) -> str:
    """CSV 한 행의 제품 구성 판정.

    v5면 처리메모·증정기획_정리·상품명_원본으로 정확히 판정되고, 그 컬럼이
    없는 CSV면 상품명만으로 판정한다(.get이 None을 낸다).
    """
    if r.get("_composition"):          # 옵션 분해 단계가 직접 지정한 값(원본 optgroup · 옵션 single)
        return r["_composition"]
    return classify(
        (r.get("상품명_원본") or r.get("상품명") or "").strip(),
        r.get("처리메모"),
        r.get("증정기획_정리"),
        r.get("내용량_원본"),
    )


# `내용량_정리`는 '+'로 구성품을 잇고, 각 조각의 머리 수량이 그 구성품의 총량이다.
# 뒤에 붙는 '(N개)'는 낱개 수라 이미 반영돼 있고, '매'는 동봉 시트라 총량과 무관하다.
#     '300ml + 300ml' 기획  →  '600ml (2개)'   → ml 600
#     앰플+모델링팩 세트     →  '2ml + 28g'     → ml 2 · g 28
_AMOUNT_HEAD = re.compile(r"^\s*([\d,]+(?:\.\d+)?)\s*(ml|kg|l|g)\b", re.I)


def _head_amount(text: str) -> tuple[float | None, float | None]:
    m = _AMOUNT_HEAD.match(text)
    if not m:
        return None, None
    n = float(m.group(1).replace(",", ""))
    unit = m.group(2).lower()
    if unit == "ml":
        return n, None
    if unit == "l":
        return n * 1000, None
    if unit == "g":
        return None, n
    return None, n * 1000  # kg


# 낱개 기준으로 적은 표기. '1매 기준 0.1g'은 총량이 아니라 한 장 값이다.
# 총 매수가 상품명에만 있어(6매) 곱할 수가 없으므로 총량을 비운다 —
# 그대로 두면 6매 마스크의 단가가 10g당 792만원이 된다.
_PER_UNIT = re.compile(r"\d[\d,]*\s*(?:매|장|개|입|ea)\s*기준", re.I)


def parse_volume(
    text: str | None, raw_volume: str | None = None
) -> tuple[float | None, float | None]:
    """총 내용량 (volume_ml, volume_g). 부피와 무게는 섞지 않고 각각 합산한다.

    '10매'짜리 시트마스크처럼 ml·g 표기가 없으면 (None, None)이다.
    머리가 수량이 아닌 표기('[기획세트 : 500ml+100ml]' 1건)는 앞 구성품을
    통째로 놓치므로 부분 합계를 쓰느니 비워 둔다.

    raw_volume(상품정보제공고시 원문)은 낱개 기준 표기를 걸러내는 데만 쓴다.
    """
    text = (text or "").strip()
    if not _AMOUNT_HEAD.match(text):
        return None, None
    if _PER_UNIT.search(raw_volume or ""):
        return None, None
    ml = g = None
    for seg in text.split("+"):
        a, b = _head_amount(seg.strip())
        if a is not None:
            ml = (ml or 0) + a
        if b is not None:
            g = (g or 0) + b
    return ml, g


# 매수·개수. '매'·'장'은 소비 단위(sheet), '개'는 포장 단위(piece)다.
#     '100매'          → sheet 100    내용량_정리의 머리
#     '70매+70매'       → sheet 70     상품정보제공고시 원문
#     '325ml (2개)'     → piece 2      내용량_정리의 괄호
_UNIT_HEAD = re.compile(r"^\s*(\d[\d,]*)\s*(?:매|장)")
_UNIT_SHEET = re.compile(r"(\d[\d,]*)\s*(?:매|장)")
_UNIT_PIECE = re.compile(r"\((\d+)\s*개\)|^\s*(\d+)\s*개\s*$")


def parse_unit(tidy: str | None, raw_volume: str | None) -> tuple[int | None, str | None]:
    """(unit_count, unit_kind). 없으면 (None, None).

    출처가 셋이고 우선순위가 있다.

      1) 내용량_정리의 머리 'N매'      '100매'      → sheet
      2) 상품정보제공고시 원문의 'N매'   '70매+70매'   → sheet
      3) 내용량_정리의 '(N개)'         '325ml (2개)' → piece

    2번이 필요한 이유: v5가 '250ml (10개)'처럼 매수를 ml로 정규화하면서 '매'라는
    단위를 잃어버린다. 마스크팩 136건이 여기 해당하고, 이들은 1번·3번만으로는
    '매'인지 '개'인지 구분할 수 없다.

    >>> parse_unit("100매", None)
    (100, 'sheet')
    >>> parse_unit("250ml (10개)", "10매")
    (10, 'sheet')
    >>> parse_unit("325ml (2개)", "325ml")
    (2, 'piece')
    >>> parse_unit("200ml", "200ml")
    (None, None)
    """
    tidy = (tidy or "").strip()
    # '1매 기준 0.1g'의 '1매'는 총 매수가 아니라 환산 기준이다.
    raw_volume = "" if _PER_UNIT.search(raw_volume or "") else (raw_volume or "")
    raw_counts = [int(x.replace(",", "")) for x in _UNIT_SHEET.findall(raw_volume)]

    m = _UNIT_HEAD.match(tidy)
    if m:
        n = int(m.group(1).replace(",", ""))
        # v5가 옵션을 합산해 버린 경우를 거른다 — '4매/80매'(둘 중 택1)가
        # '84매'로 정리돼 있다. 원문의 어느 개수와도 안 맞으면 합산으로 보고
        # 원문의 첫 개수를 쓴다. 990원짜리를 84매로 나눠 1매당 11원이 된다.
        if raw_counts and n not in raw_counts:
            return raw_counts[0], "sheet"
        return n, "sheet"
    if raw_counts:
        return raw_counts[0], "sheet"
    m = _UNIT_PIECE.search(tidy)
    if m:
        return int(m.group(1) or m.group(2)), "piece"
    return None, None


def distrusted_goods() -> set[str]:
    """카테고리를 믿을 수 없어 적재하지 않는 제품의 goods_no."""
    if not DISTRUST_CSV.exists():
        return set()
    with open(DISTRUST_CSV, newline="", encoding="utf-8-sig") as f:
        return {
            r["goods_no"].strip()
            for r in csv.DictReader(f)
            if (r.get("판정") or "").strip() == "제외"
        }


def category_overrides(rows: list[dict]) -> dict[str, str]:
    """goods_no → 교정 후 카테고리.

    교정 로그는 제품을 브랜드+상품명으로만 가리키므로, 본문에서 goods_no를
    찾아 잇는다. 이름이 같은 행이 여럿이면 전부 같은 교정을 받는다.
    """
    if not CATEGORY_FIX_CSV.exists():
        return {}
    idx: dict[tuple[str, str], list[str]] = collections.defaultdict(list)
    for r in rows:
        m = _GOODS_NO.search(r.get("상품URL") or "")
        if m:
            idx[((r.get("브랜드") or "").strip(), (r.get("상품명") or "").strip())].append(
                m.group(1)
            )
    out: dict[str, str] = {}
    with open(CATEGORY_FIX_CSV, newline="", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            brand = (r.get("브랜드") or "").strip()
            after = (r.get("이후") or "").strip()
            if not brand or not after:
                continue
            for gno in idx[(brand, (r.get("상품명") or "").strip())]:
                out[gno] = after
    return out


def is_unusable(parts: list[str]) -> bool:
    """전성분을 얻을 수 없는 제품인지 판단.

    성분이 없으면 대체품 추천 자체가 불가능하다. 기기·브러시·패치처럼
    애초에 화장품이 아닌 것과, 판매자가 성분 대신 안내문구를 넣은 것이
    여기 걸린다.
    """
    if not parts:
        return True
    # 정규화하면 아무것도 안 남는 경우. '■상세페이지 참조'처럼 파서가 안내문구를
    # 이미 걷어내 여기서는 기호만 보이는 상황이 있어, 원문 패턴만 보면 놓친다.
    if not any(normalize(p) for p in parts):
        return True
    return len(parts) == 1 and bool(_PLACEHOLDER.search(parts[0]))


def to_int(s: str) -> int | None:
    s = re.sub(r"[^\d]", "", s or "")
    return int(s) if s else None


def to_float(s: str) -> float | None:
    s = (s or "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def read_rows(path: Path) -> list[dict]:
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def expand_options(by_goods: dict[str, dict], vocab: set[str]) -> tuple[dict[str, list[str]], int]:
    """옵션형 묶음 제품을 옵션별 행으로 분해한다. by_goods를 제자리에서 바꾼다.

    원본 행은 `_composition = optgroup`으로 표시하고(성분은 합집합 그대로 둔다 — 마지막의 '성분 없는 제품 삭제'에
    걸리지 않게), 옵션마다 새 행(goods_no = 원본~n)을 만든다. 옵션 행은 가격·평점·리뷰수·이미지·URL 등을 원본에서
    그대로 물려받고 성분 칸만 자기 구간으로 바뀐다. 반환: ({원본 goods_no: [옵션 goods_no…]}, 옵션 행 수)
    규칙(무엇을 나누는가)은 app/utils/product_options.py.
    """
    groups: dict[str, list[str]] = {}
    for gno, r in list(by_goods.items()):
        raw_name = (r.get("상품명_원본") or r.get("상품명") or "").strip()
        memo = r.get("처리메모")
        plan = plan_options(raw_name, memo, r.get("화장품성분", "") or "")
        if not plan:
            continue
        group_raw = group_name(raw_name, memo)
        group_display = group_name((r.get("상품명") or raw_name).strip(), memo)
        r["_composition"] = OPTION_GROUP
        groups[gno] = []
        for spec in plan:
            ogno = option_goods_no(gno, spec.order)
            o = dict(r)
            o["_composition"] = "single"
            o["_option"] = (gno, spec.label, spec.order)
            o["상품명_원본"] = option_row_name(group_raw, spec.label)
            o["상품명"] = group_display            # display_name = 그룹명 → 목록에는 옵션 이름 없이 그룹명만 보인다
            o["화장품성분"] = spec.text
            o["처리메모"] = ""
            by_goods[ogno] = o
            groups[gno].append(ogno)
    return groups, sum(len(v) for v in groups.values())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", type=Path, default=DEFAULT_CSV)
    ap.add_argument(
        "--options-only", action="store_true",
        help="옵션형 묶음 제품의 분해 단계만 실행한다(전체 재적재 없이 해당 제품만 upsert)",
    )
    args = ap.parse_args()

    if not args.csv.exists():
        # 예전 .gz를 들고 있는 사람도 그대로 돌아가게 한다 (read_rows가 둘 다 읽는다).
        legacy = args.csv.with_suffix(args.csv.suffix + ".gz")
        if not legacy.exists():
            sys.exit(f"CSV가 없습니다: {args.csv}")
        args.csv = legacy

    rows = read_rows(args.csv)
    print(f"CSV {len(rows):,}행")

    # ── goods_no 기준 dedup ─────────────────────────────────────
    # 제품 정보는 뒤에 온 행이 최신이므로 그대로 덮어쓴다.
    # 카테고리만은 등재된 후보를 전부 모아 resolve_category()로 정한다.
    # 그냥 덮어쓰면 복수 등재 제품의 소속이 CSV 수집 순서에 좌우된다.
    fixed_cat = category_overrides(rows)
    if fixed_cat:
        print(f"카테고리 교정 로그 {len(fixed_cat):,}건 적용")
    distrusted = distrusted_goods()
    if distrusted:
        print(f"카테고리를 믿을 수 없어 제외하는 제품 {len(distrusted):,}건")

    by_goods: dict[str, dict] = {}
    cats_seen: dict[str, set[str]] = {}
    no_goods_no = excluded = distrust_skipped = 0
    for r in rows:
        m = _GOODS_NO.search(r.get("상품URL", "") or "")
        if not m:
            no_goods_no += 1
            continue
        goods_no = m.group(1)
        if goods_no in distrusted:
            distrust_skipped += 1
            continue
        cat = fixed_cat.get(goods_no) or (r.get("카테고리") or "").strip()
        r["카테고리"] = cat
        if cat not in ALLOWED_CATEGORIES:
            excluded += 1
            continue
        # 묶음분리된 행들은 원본과 goods_no를 공유한다(예: 향수 4종으로 쪼개져
        # 4행). 마지막 행이 그냥 이기게 두면 그 제품이 묶음인지 아닌지가
        # CSV 수집 순서에 좌우된다. 하나라도 묶음이면 묶음으로 본다 —
        # 전성분이 제품 하나에 대응한다고 보장할 수 없기 때문이다.
        # 나머지 값은 뒤에 온 행이 최신이므로 그대로 덮어쓴다.
        prev = by_goods.get(goods_no)
        if prev is None or _RANK[row_composition(r)] >= _RANK[row_composition(prev)]:
            by_goods[goods_no] = r
        cats_seen.setdefault(goods_no, set()).add(cat)

    multi = resolved = 0
    for goods_no, cands in cats_seen.items():
        if len(cands) == 1:
            continue
        multi += 1
        row = by_goods[goods_no]
        chosen = resolve_category(row.get("상품명", ""), cands)
        if chosen != (row.get("카테고리") or "").strip():
            resolved += 1
        row["카테고리"] = chosen

    dup = len(rows) - len(by_goods) - no_goods_no - excluded - distrust_skipped
    print(f"고유 제품 {len(by_goods):,}건 "
          f"(중복 {dup:,} / URL없음 {no_goods_no} / 제외 카테고리 {excluded:,})")
    print(f"복수 카테고리 등재 {multi}건 — 제품명으로 결정 (소속 변경 {resolved}건)")

    conn = psycopg2.connect(settings.DATABASE_DSN)
    cur = conn.cursor()

    # ── 잔해 성분 정리 ───────────────────────────────────────────
    # 예전 적재로 이미 등록된 잔해는 아래 resolve()의 신규 등록 경로를 타지
    # 않는다 — 사전 조회에서 바로 잡히기 때문이다. 사전을 읽기 전에 지워야
    # is_residue()가 실제로 걸린다. FK가 CASCADE라 연결·유사도도 함께 정리된다.
    cur.execute("SELECT id, norm_name FROM ingredients WHERE code IS NULL")
    junk = [] if args.options_only else [i for i, n in cur.fetchall() if is_residue(n)]
    if junk:
        cur.execute("DELETE FROM ingredients WHERE id = ANY(%s)", (junk,))
        conn.commit()
        print(f"잔해 성분 제거 {len(junk):,}종")

    # ── 성분 사전 선로드 ─────────────────────────────────────────
    # 전성분 구분자가 제품마다 달라(쉼표/공백/@) 파서가 사전을 참고해야 한다.
    cur.execute("SELECT norm_name, id FROM ingredients")
    ing_id = dict(cur.fetchall())
    cur.execute("SELECT alias, ingredient_id FROM ingredient_aliases WHERE NOT is_ambiguous")
    alias_id = dict(cur.fetchall())
    vocab = set(ing_id) | set(alias_id)
    print(f"사전 로드 — 성분 {len(ing_id):,} / 별칭 {len(alias_id):,}")

    # ── 전성분을 얻을 수 없는 제품 제외 ──────────────────────────
    parsed = {g: parse_ingredients(r.get("화장품성분", ""), vocab)
              for g, r in by_goods.items()}
    unusable = {g for g, p in parsed.items() if is_unusable(p)}
    if unusable:
        for g in unusable:
            del by_goods[g], parsed[g]
        print(f"성분 없음으로 제외 {len(unusable):,}건 → 적재 대상 {len(by_goods):,}건")

        # 이번에 제외된 제품이 예전 적재로 DB에 남아 있으면 지운다. upsert만
        # 하면 성분 0개인 제품이 영영 남아, 파서를 고쳐 제외 대상이 늘어도
        # 반영되지 않는다. FK가 CASCADE라 연결·유사도도 함께 정리된다.
        cur.execute("DELETE FROM products WHERE goods_no = ANY(%s)", (list(unusable),))
        if cur.rowcount:
            print(f"  그중 {cur.rowcount:,}건은 예전 적재분이라 DB에서 제거했다")
        conn.commit()

    # ── 옵션형 묶음 분해 ─────────────────────────────────────────
    # 성분 해석(parsed)이 끝난 뒤, 제품 행을 만들기 전에 한다. 옵션 행은 자기 구간만 따로 해석한다.
    option_groups, option_count = expand_options(by_goods, vocab)
    for g, children in option_groups.items():
        for og in children:
            parsed[og] = parse_ingredients(by_goods[og].get("화장품성분", ""), vocab)
    print(f"옵션형 묶음 {len(option_groups):,}개 → 옵션 행 {option_count:,}개")
    if args.options_only:
        keep = set(option_groups) | {og for v in option_groups.values() for og in v}
        by_goods = {g: r for g, r in by_goods.items() if g in keep}
        parsed = {g: p for g, p in parsed.items() if g in keep}
        print(f"--options-only: {len(by_goods):,}건만 적재")

    # ── 브랜드 · 카테고리 ────────────────────────────────────────
    brands = sorted({(r.get("브랜드") or "").strip() for r in by_goods.values()} - {""})
    cats = sorted({(r.get("카테고리") or "").strip() for r in by_goods.values()} - {""})

    execute_values(cur,
        "INSERT INTO brands (name) VALUES %s ON CONFLICT (name) DO NOTHING",
        [(b,) for b in brands], page_size=500)
    execute_values(cur,
        "INSERT INTO categories (code, label) VALUES %s ON CONFLICT (code) DO NOTHING",
        [(c, c) for c in cats], page_size=500)
    conn.commit()

    cur.execute("SELECT name, id FROM brands")
    brand_id = dict(cur.fetchall())
    cur.execute("SELECT code, id FROM categories")
    cat_id = dict(cur.fetchall())
    print(f"브랜드 {len(brand_id):,} / 카테고리 {len(cat_id)}")

    # ── 제품 ─────────────────────────────────────────────────────
    product_rows = []
    for gno, r in by_goods.items():
        # 원본 문자열 기준 성분 개수(중복 포함). product_ingredients 행수는
        # 제품 내 중복을 제거하므로 이 값과 다를 수 있다.
        raw_count = len(parsed[gno])
        # 제품 구성. v5 정제본이면 처리메모·증정기획_정리·상품명_원본으로
        # 정확히 판정되고, 구 CSV면 상품명만으로 판정한다(.get이 None을 낸다).
        # v5는 정제명을 `상품명`에, 원본을 `상품명_원본`에 둔다. 구 CSV에는
        # `상품명` 하나뿐이고 그게 원본이라 display_name은 비워둔다.
        raw_name = (r.get("상품명_원본") or r.get("상품명") or "").strip()
        display_name = (r.get("상품명") or "").strip() if r.get("상품명_원본") else None
        composition = row_composition(r)
        raw_volume = (r.get("내용량") or "").strip() or None
        volume_ml, volume_g = parse_volume(r.get("내용량_정리"), raw_volume)
        unit_count, unit_kind = parse_unit(r.get("내용량_정리"), raw_volume)
        product_rows.append((
            gno,
            raw_name,
            brand_id.get((r.get("브랜드") or "").strip()),
            cat_id.get((r.get("카테고리") or "").strip()),
            to_int(r.get("가격(원)", "")),
            to_float(r.get("평점", "")),
            to_int(r.get("리뷰수", "")),
            (r.get("이미지URL") or "").strip() or None,
            (r.get("상품URL") or "").strip() or None,
            (r.get("내용량") or "").strip() or None,
            (r.get("제조국") or "").strip() or None,
            (r.get("제조사") or "").strip() or None,
            (r.get("사용기한") or "").strip() or None,
            raw_count,
            composition,
            display_name,
            volume_ml,
            volume_g,
            bool((r.get("내용량_확인필요") or "").strip()),
            unit_count,
            unit_kind,
            (r.get("_option") or (None, None, None))[1],
            (r.get("_option") or (None, None, None))[2],
        ))

    execute_values(cur, """
        INSERT INTO products
            (goods_no, name, brand_id, category_id, price, rating, review_count,
             image_url, product_url, volume, country, manufacturer, expiry,
             ingredient_count_raw, composition, display_name,
             volume_ml, volume_g, volume_uncertain, unit_count, unit_kind,
             option_label, option_order)
        VALUES %s
        ON CONFLICT (goods_no) DO UPDATE SET
            name = EXCLUDED.name, brand_id = EXCLUDED.brand_id,
            category_id = EXCLUDED.category_id, price = EXCLUDED.price,
            rating = EXCLUDED.rating, review_count = EXCLUDED.review_count,
            image_url = EXCLUDED.image_url, product_url = EXCLUDED.product_url,
            volume = EXCLUDED.volume, country = EXCLUDED.country,
            manufacturer = EXCLUDED.manufacturer, expiry = EXCLUDED.expiry,
            ingredient_count_raw = EXCLUDED.ingredient_count_raw,
            composition = EXCLUDED.composition,
            -- 구 CSV로 돌리면 EXCLUDED.display_name이 NULL이라, 이미 채워둔
            -- 정제명을 지우지 않도록 COALESCE로 보존한다.
            display_name = COALESCE(EXCLUDED.display_name, products.display_name),
            volume_ml = EXCLUDED.volume_ml, volume_g = EXCLUDED.volume_g,
            volume_uncertain = EXCLUDED.volume_uncertain,
            unit_count = EXCLUDED.unit_count, unit_kind = EXCLUDED.unit_kind,
            option_label = EXCLUDED.option_label, option_order = EXCLUDED.option_order,
            updated_at = now()
    """, product_rows, page_size=500)
    conn.commit()

    # 제외 대상이 예전 적재로 DB에 남아 있으면 지운다. upsert만으로는 기준이
    # 바뀌어 빠진 제품이 영영 남는다. FK가 CASCADE라 연결·유사도도 정리된다.
    if distrusted:
        cur.execute("DELETE FROM products WHERE goods_no = ANY(%s)", (list(distrusted),))
        if cur.rowcount:
            print(f"  그중 {cur.rowcount:,}건은 예전 적재분이라 DB에서 제거했다")
        conn.commit()

    cur.execute("SELECT goods_no, id FROM products")
    pid_of = dict(cur.fetchall())
    if args.options_only:
        # DB 전체가 아니라 이번에 다룬 제품만. 아래 product_ingredients 교체가 다른 제품을 건드리지 않게 한다.
        pid_of = {g: i for g, i in pid_of.items() if g in by_goods}
    print(f"제품 적재 {len(pid_of):,}건")

    # 옵션 행 → 원본 행 연결, 그리고 이번 실행에서 사라진 옛 옵션 행 정리(멱등)
    link = [(pid_of[g], pid_of[og]) for g, kids in option_groups.items() for og in kids
            if g in pid_of and og in pid_of]
    cur.executemany("UPDATE products SET option_parent_id = %s WHERE id = %s", link)
    cur.execute(
        "DELETE FROM products WHERE option_parent_id IS NOT NULL AND goods_no <> ALL(%s)",
        (list(by_goods),),
    )
    if cur.rowcount and not args.options_only:
        print(f"더 이상 옵션형이 아닌 그룹의 옛 옵션 행 제거 {cur.rowcount:,}건")
    conn.commit()

    # ── 성분 해석 ────────────────────────────────────────────────
    stat = {"direct": 0, "alias": 0, "loose": 0, "new": 0, "residue": 0}
    pending_new: dict[str, str] = {}   # normalized → 원문

    def resolve(raw: str) -> str | None:
        """성분 원문 → norm_name (신규는 pending_new에 적재)"""
        key = normalize(raw)
        if not key:
            return None
        if key in ing_id:
            stat["direct"] += 1
            return key
        if key in alias_id:
            stat["alias"] += 1
            return key
        loose = normalize_loose(raw)
        if loose and loose in ing_id:
            stat["loose"] += 1
            return loose
        if is_residue(key):
            stat["residue"] += 1
            return None
        if key not in pending_new:
            pending_new[key] = raw.strip()
            stat["new"] += 1
        return key

    links: list[tuple[str, str, int, str]] = []  # (goods_no, key, position, raw)
    over_threshold = 0
    for gno in by_goods:
        parts = parsed[gno]
        if len(parts) > SIMILARITY_SAFE_MAX:
            over_threshold += 1   # 적재는 하되 집계만 남긴다
        seen: set[str] = set()
        pos = 0
        for raw in parts:
            key = resolve(raw)
            if not key or key in seen:
                continue      # 같은 제품 안의 중복 성분은 첫 등장만
            seen.add(key)
            pos += 1
            links.append((gno, key, pos, raw.strip()))

    print(f"성분 해석 — 사전직결 {stat['direct']:,} / 별칭 {stat['alias']:,} / "
          f"완화 {stat['loose']:,} / 신규 {stat['new']:,} / 잔해버림 {stat['residue']:,}")
    print(f"성분 {SIMILARITY_SAFE_MAX}개 초과 {over_threshold}건 "
          f"(적재는 하되 유사도 계산에서 제외 권장)")

    # 사전에 없던 성분 등록
    if pending_new:
        execute_values(cur,
            """INSERT INTO ingredients (norm_name, name_ko)
               VALUES %s ON CONFLICT (norm_name) DO NOTHING""",
            [(k, v) for k, v in pending_new.items()], page_size=1000)
        conn.commit()
        cur.execute("SELECT norm_name, id FROM ingredients")
        ing_id = dict(cur.fetchall())

    # ── product_ingredients ──────────────────────────────────────
    def to_ingredient_id(key: str) -> int | None:
        return ing_id.get(key) or alias_id.get(key)

    # position은 여기서 다시 매긴다. 위에서 붙인 번호를 그대로 쓰면, 성분
    # id를 못 찾아 건너뛴 자리만큼 빈틈이 생겨 '1부터 연속'이라는 계약이
    # 깨진다. 상대 순서는 links의 순서가 이미 보존하고 있다.
    pi_rows = []
    pos_of: dict[str, int] = collections.defaultdict(int)
    placed: set[tuple[int, int]] = set()
    for gno, key, _, raw in links:
        pid, iid = pid_of.get(gno), to_ingredient_id(key)
        if not (pid and iid) or (pid, iid) in placed:
            # 앞의 seen은 key 기준이라, 별칭을 거쳐 같은 성분 id로 모이는
            # 두 표기를 못 막는다. DB의 ON CONFLICT가 뒤엣것을 버리는데
            # 번호는 이미 올라가 자리가 빈다 — 여기서 걸러야 한다.
            continue
        placed.add((pid, iid))
        pos_of[gno] += 1
        pi_rows.append((pid, iid, pos_of[gno], raw))

    cur.execute("DELETE FROM product_ingredients WHERE product_id = ANY(%s)",
                (list(pid_of.values()),))
    execute_values(cur,
        """INSERT INTO product_ingredients (product_id, ingredient_id, position, raw_name)
           VALUES %s ON CONFLICT (product_id, ingredient_id) DO NOTHING""",
        pi_rows, page_size=5000)
    conn.commit()

    # --options-only는 다른 제품을 건드리지 않는다: 아래 전역 정리는 전체 적재에서만 한다.
    if not args.options_only:
        # 아무 제품도 안 쓰는 미등록 성분을 지운다. 파서를 고칠 때마다 예전
        # 파싱으로 만들어진 이름이 남는데(code=NULL이라 협회 사전 쪽은 아니다),
        # 참조가 끊긴 뒤에도 테이블에 쌓여 '성분 N종' 집계를 부풀린다.
        # 별칭이 가리키는 행은 남긴다 — 오타 교정의 도착지다.
        cur.execute(
            """DELETE FROM ingredients i
                WHERE i.code IS NULL
                  AND NOT EXISTS (SELECT 1 FROM product_ingredients x
                                   WHERE x.ingredient_id = i.id)
                  AND NOT EXISTS (SELECT 1 FROM ingredient_aliases a
                                   WHERE a.ingredient_id = i.id)"""
        )
        if cur.rowcount:
            print(f"아무 제품도 안 쓰는 미등록 성분 제거 {cur.rowcount:,}종")
        conn.commit()

        # 성분이 하나도 남지 않은 제품을 지운다. is_unusable()은 파싱 직후를 보므로
        # 토큰이 전부 잔해였던 제품(랑콤 제니피끄 토너처럼 전성분 한 줄이 통짜로
        # 들어온 것)을 놓친다. 성분이 없으면 대체품 추천도 성분 표시도 불가능해
        # 제품으로서 의미가 없다.
        cur.execute(
            """DELETE FROM products p WHERE NOT EXISTS
                 (SELECT 1 FROM product_ingredients x WHERE x.product_id = p.id)"""
        )
        if cur.rowcount:
            print(f"성분이 전부 잔해였던 제품 제거 {cur.rowcount}건")
        conn.commit()

    for t in ("products", "product_ingredients", "brands", "categories", "ingredients"):
        cur.execute(f"SELECT count(*) FROM {t}")
        print(f"  {t:22s} {cur.fetchone()[0]:>9,}")

    cur.close()
    conn.close()
    bump_cache_version()
    print("\n완료")


if __name__ == "__main__":
    main()
