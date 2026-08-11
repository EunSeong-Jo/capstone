"""전성분 문자열 파싱·정규화.

크롤링한 전성분은 쉼표로 구분되지만, 단순 split(",")으로는 깨진다.
성분명 자체에 쉼표가 들어가기 때문이다:

    1,2-헥산다이올            → "1" + "2-헥산다이올"
    자작나무수액(10,000ppm)   → "자작나무수액(10" + "000ppm)"

실제로 올리브영 5,000건을 단순 split으로 파싱하면 "1"이 5,599회로
최다 성분이 된다. 이 상태로 유사도를 계산하면 결과가 통째로 오염된다.

정규화는 사전(대한화장품협회 표준화명칭목록) 조회 키를 만드는 단계다.
5,000건 실측 기준 정규화 후 매칭률은 성분 출현의 97.5%.
"""
from __future__ import annotations

import re

# 함량 표기. 성분명의 일부인 괄호(예: 하이드로제네이티드폴리(C6-14올레핀))는
# 남겨야 하므로, 괄호 안이 숫자·단위뿐인 경우만 지운다.
_AMOUNT = re.compile(r"\(\s*[\d.,]+\s*(?:%|ppm|퍼센트)?\s*\)")

# 유기농·인증 성분에 붙는 표시
_MARKERS = re.compile(r"[*†‡+]+$")

_OPENERS = "([{"
_CLOSERS = ")]}"


def parse_ingredients(raw: str) -> list[str]:
    """전성분 문자열을 성분 목록으로 분리.

    쉼표를 구분자로 쓰되 두 경우는 예외로 둔다.
      1) 괄호 안에 있는 쉼표          — 자작나무수액(10,000ppm)
      2) 숫자와 숫자 사이의 쉼표      — 1,2-헥산다이올

    >>> parse_ingredients("정제수, 1,2-헥산다이올, 자작나무수액(10,000ppm)")
    ['정제수', '1,2-헥산다이올', '자작나무수액(10,000ppm)']
    """
    if not raw:
        return []

    out: list[str] = []
    buf: list[str] = []
    depth = 0

    for i, ch in enumerate(raw):
        if ch in _OPENERS:
            depth += 1
        elif ch in _CLOSERS:
            depth = max(0, depth - 1)

        if ch == "," and depth == 0:
            prev = raw[i - 1] if i else ""
            nxt = raw[i + 1] if i + 1 < len(raw) else ""
            if prev.isdigit() and nxt.isdigit():
                buf.append(ch)      # 1,2- / 10,000 → 구분자 아님
                continue
            token = "".join(buf).strip()
            if token:
                out.append(token)
            buf = []
        else:
            buf.append(ch)

    token = "".join(buf).strip()
    if token:
        out.append(token)
    return out


def normalize(name: str) -> str:
    """성분 사전 조회용 키로 변환.

    함량 괄호와 인증 표시를 떼고 공백을 없앤다. 같은 성분이 표기 차이로
    다른 성분이 되는 것을 막는다.

    >>> normalize("살리실릭애씨드(0.5%)")
    '살리실릭애씨드'
    >>> normalize("부틸렌글라이콜*")
    '부틸렌글라이콜'
    """
    if not name:
        return ""
    s = _MARKERS.sub("", name.strip())
    s = _AMOUNT.sub("", s)
    s = re.sub(r"\s+", "", s)
    return s.strip(" .,·|")


def normalize_loose(name: str) -> str:
    """느슨한 조회 키. normalize()로 못 찾았을 때의 2차 시도.

    성분명에 포함된 괄호까지 전부 제거한다. 오탐 여지가 있어
    1차 조회 실패 시에만 쓴다.
    """
    return re.sub(r"\([^)]*\)", "", normalize(name)).strip(" .,·|")
