"""옵션형 묶음 제품의 분해 규칙 — "A/B/C 택1" 한 상품을 옵션별 제품으로 나눈다.

올리브영은 옵션이 여럿인 상품(마스크 5종류, 앰플 4종류…)을 상품 하나로 올리고, 판매자는 옵션별 전성분을
한 칸에 이어 붙인다:

    [화장발]정제수, 글리세린, … [카밍풀]정제수, 글리세린, … [모이스처풀] …

그대로 적재하면 `product_ingredients` 키가 `(제품, 성분)`이라 종류별 구분과 중복이 사라지고(255개 → 131개),
제품 하나가 모든 옵션의 합집합이 되어 유사도·궁합·성분 분석이 모두 뭉개진다. 원본 CSV에는 라벨이 남아 있으므로
**라벨 구간별로 나눠 옵션 행을 만든다.** 원본 행은 지우지 않고 composition='optgroup'으로 표시한다.

무엇을 나누고 무엇을 나누지 않는가
----------------------------------
나누는 것: 성분 칸에 `[라벨]`이 2개 이상이고, 이름이 **고르는 구조**임을 말하는 제품.

    택1 · 골라담기 · 괄호 속 슬래시 나열 '(화장발/카밍풀/모이스처풀)' · 크롤러의 '묶음분리' 메모

나누지 않는 것: 이름에 'N종'만 있는 제품. '프리메라 세럼 3종 기획'은 셋을 다 주는 세트이고 '7종 골라담기'는
하나를 고르는 것인데, 이름만으로는 구별되지 않는다. 토너+에센스처럼 **함께 쓰는 구성품 세트**도 같은 이유로
건드리지 않는다(화면이 구성품별로 묶어 보여 준다). 라벨이 없는 옵션형은 분해할 근거가 없다.

판정은 순수 함수라 DB·크롤링 없이 테스트한다.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from app.utils.ingredients import parse_ingredients

# 구간 라벨. '[주름개선 기능성 화장품]' 같은 안내문도 이 모양이라 아래 구간 크기 검사로 걸러낸다.
_LABEL = re.compile(r"\[([^\[\]]{1,30})\]")

# 이름이 '고르는 구조'임을 말하는 신호. 괄호 속 슬래시는 3개 이상 나열일 때만(용량 '(50ml/200ml)' 같은 2개짜리 제외).
_CHOICE_NAME = re.compile(r"택\s*1|골라담기|\([^()]*(?:/[^()/]+){2,}\)")
_SLASH_LIST = re.compile(r"\s*\([^()]*(?:/[^()/]+){2,}\)")

# 구간 성분이 이보다 적으면 옵션이 아니라 안내문·각주로 본다(실측 498개 구간 중 3개).
MIN_SECTION_INGREDIENTS = 5

# 크롤러가 같은 상품번호로 여러 행을 만들며 남기는 메모. 행 이름이 '그룹명 - 변형명'이 된다.
_SPLIT_MEMO = "묶음분리"


@dataclass(frozen=True)
class OptionSpec:
    order: int            # 1부터. 1이 그룹의 대표
    label: str            # '화장발'
    text: str             # 이 옵션의 전성분 원문


def is_choice_name(name: str, memo: str | None = None) -> bool:
    """이름(또는 크롤러 메모)이 '옵션 중 하나를 고르는' 상품임을 말하는가."""
    return bool(_CHOICE_NAME.search(name or "")) or _SPLIT_MEMO in (memo or "")


def split_sections(cell: str) -> list[tuple[str, str]]:
    """성분 칸 → [(라벨, 그 구간 원문)]. 첫 라벨 앞의 조각은 버린다. 같은 라벨이 또 나오면 '라벨 2'로 구분한다."""
    matches = list(_LABEL.finditer(cell or ""))
    out: list[tuple[str, str]] = []
    seen: dict[str, int] = {}
    for i, m in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(cell)
        text = cell[m.end():end].strip(" \t\r\n,;")
        label = m.group(1).strip()
        seen[label] = seen.get(label, 0) + 1
        if seen[label] > 1:
            label = f"{label} {seen[label]}"
        out.append((label, text))
    return out


def plan_options(name: str, memo: str | None, cell: str) -> list[OptionSpec]:
    """분해 계획. 분해하지 않을 제품은 빈 목록.

    구간 성분이 MIN_SECTION_INGREDIENTS 미만인 구간은 버리고, 남은 구간이 둘 미만이면 분해하지 않는다.
    """
    if not is_choice_name(name, memo):
        return []
    kept = [
        (label, text)
        for label, text in split_sections(cell)
        if len(parse_ingredients(text)) >= MIN_SECTION_INGREDIENTS
    ]
    if len(kept) < 2:
        return []
    return [OptionSpec(order=i, label=label, text=text) for i, (label, text) in enumerate(kept, 1)]


def group_name(name: str, memo: str | None = None) -> str:
    """옵션 그룹의 이름 — 옵션 나열(괄호 속 슬래시)과, 크롤러가 붙인 ' - 변형명' 꼬리를 뗀 이름.

        '듀이트리 픽앤퀵 뽑아쓰는 마스크 30매입 (화장발/카밍풀/모이스처풀)' → '듀이트리 픽앤퀵 뽑아쓰는 마스크 30매입'
        '프리메라 세럼 3종 - 비타티놀'(묶음분리)                              → '프리메라 세럼 3종'
    """
    out = _SLASH_LIST.sub("", name or "")
    if _SPLIT_MEMO in (memo or "") and " - " in out:
        out = out.rsplit(" - ", 1)[0]
    return re.sub(r"\s+", " ", out).strip()


def option_row_name(group: str, label: str) -> str:
    """옵션 행의 products.name. 그룹명 + ' - ' + 라벨."""
    return f"{group} - {label}"


def option_goods_no(goods_no: str, order: int) -> str:
    """옵션 행의 goods_no. 원본 번호에서 결정되므로 재적재해도 같은 행으로 upsert된다."""
    return f"{goods_no}~{order}"
