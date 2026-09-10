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
# 남겨야 하므로, 괄호 안이 숫자로 시작할 때만 지운다.
# 단위를 넓혀도 안전한 이유: 여는 괄호 다음이 반드시 숫자여야 하므로
# (C6-14올레핀)·(CI 77891) 같은 성분명 괄호는 애초에 후보가 아니다.
_AMOUNT = re.compile(
    r"\(\s*[\d.,]+\s*(?:%|ppm|ppb|퍼센트|mg|g|kg|ml|mL|l|IU|iu|w/v\s*%?|v/v\s*%?)?\s*\)"
)

# 유기농·인증 성분에 붙는 표시. 함량 괄호를 먼저 지우면 '*(0.1ppm)'의 '*'가
# 문자열 끝으로 와서 여기 걸린다 — normalize()의 처리 순서가 그래서 중요하다.
# 유니코드 위첨자(마이카³)와 '#'(아시아티코사이드#)도 같은 역할이다.
_MARKERS = re.compile(r"[*†‡+#⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+$")

# 성분명 앞에 붙는 표시. '① 캐모마일꽃수'처럼 제형 번호가 첫 성분에 들러붙거나
# '*살리실릭애씨드'처럼 인증 표시가 앞에 오는 경우다. 따옴표는 CSV 인용부호가
# 새어 든 것이고(`'정제수`), ■·◆는 구간 구분 기호다. 성분명이 이런 문자로
# 시작하는 일은 없어 통째로 걷어내도 안전하다.
_LEADING = re.compile(r"^[*†‡+#①-⑳⓪■◆●▶※□▲◇\"'`\s.,·|]+")

# 문자열 끝의 따옴표. `리날룰\"`처럼 인용부호 짝이 깨져 남는다.
# _MARKERS와 나눠 둔 이유는 함량 괄호 제거 뒤에도 한 번 더 돌려야 하기 때문이다.
_TRAILING_QUOTE = re.compile(r"[\"'`]+$")

# 각주 번호. '부틸렌글라이콜3)4)5)'처럼 성분명 뒤에 참조 표시가 붙는다.
# 여는 괄호가 없는 경우에만 지운다 — '티타늄디옥사이드(CI 77891)'의 끝
# '1)'을 함께 깎아내면 안 되기 때문이다.
_FOOTNOTE = re.compile(r"\s*\d+\)$")

# 성분이 아니라 안내문구. 이 표현부터 뒤는 통째로 버린다.
# 에스티로더 계열(크리니크·랩시리즈·바비브라운·MAC·달팡)과 바이오더마가
# 전성분 뒤에 같은 문구를 붙인다 — 제품 50여 건.
_NOTICE = re.compile(
    r"\s*(?:※|＊표시|\*표시|제공된\s*성분|상세페이지\s*참조"
    r"|성분\s*목록은|최신정보|연락\s*부탁).*$"
)

# 성분이 아예 아닌 토큰. 안내 문장이 쉼표로 쪼개져 조각으로 남은 것이다.
# 협회 사전 21,910종에 이 표현을 가진 성분은 하나도 없어 통째로 버려도 안전하다.
_NOT_INGREDIENT = re.compile(
    r"습니다|바랍니다|드립니다|참고|부탁|무첨가|미포함|불검출|성분\s*목록"
)

# 제형·구간 라벨. 콜론을 구분자로 쓰면서 '세럼: 정제수'의 앞쪽이 토큰으로
# 떨어져 나온다. 성분이 아니고 여러 제품에 반복 등장해 공통 성분처럼
# 보이므로 DF=1 잔해보다 해롭다.
#
# '크림'은 협회 사전에 정식 성분으로 있어 뺐다 — 나머지는 0건 확인.
_FORM_LABEL = frozenset(
    """본품 전성분 스킨 토너 에센스 앰플 세럼 로션 미스트 젤 폼 밤 오일
    마스크 패드 리필 증정 파우더 쿠션 스틱 클렌저 워시 필링 부스터
    1제 2제 3제 제1제 제2제""".split()
)

# '*' 뒤에 설명이 이어지는 각주. 실제 성분이 그 앞에 묻혀 있다.
#     리모넨* (*에센셜 오일에 포함된 표기성분)     → 리모넨
#     콜라겐추출물 *분사제 : 이산화탄소            → 콜라겐추출물
#     다이소듐이디티에이 *글루타치온좀(...) : ...   → 다이소듐이디티에이
# 뒤에 공백이나 글자가 올 때만 자른다. 문자열 끝의 '*'(부틸렌글라이콜*)와
# 함량 표기 앞의 '*'(마그네슘설페이트*(4.75 ppb))는 _MARKERS가 맡는다.
_FOOTNOTE_TEXT = re.compile(r"\s*\*(?=[\s가-힣A-Za-z]).*$")

# 기획세트·다단계 제품의 구성품 라벨. '[STEP3]', '[브라이트닝]' 처럼
# 전성분 문자열 안에서 구간을 나누는 표시라 성분명의 일부가 아니다.
_SECTION_LABEL = re.compile(r"\[[^\]]*\]")

# 대괄호 없이 쓰는 구간 라벨. '리날룰 STEP 02 : 인텐시브 샤이닝 마스크 정제수'처럼
# 앞 구간의 마지막 성분과 다음 구간의 첫 성분 사이에 끼어든다.
_STEP_LABEL = re.compile(r"\s*(?:STEP|스텝)\s*\d+\s*[.:：]?\s*", re.I)

# 쉼표 말고도 구분자로 쓰이는 문자들. 전부 성분명에는 쓰이지 않는다
# (협회 사전 21,910종에 0건 확인).
#   ，、；  전각 쉼표·세미콜론. 한자권 입력기에서 새어 든다
#   :      '세럼: 정제수'처럼 제형 라벨을 붙일 때
_ALT_SEPARATORS = re.compile(r"[，、；;:：]")

# 한글 사이의 마침표. '피브이피.정제수.글리세린…'처럼 마침표로 구분한 제품이 있다.
# 성분명 안의 마침표(숫자 소수점)와 구별하려고 양쪽이 한글일 때만 본다.
_DOT_SEPARATOR = re.compile(r"(?<=[가-힣])\.(?=[가-힣])")

# 괄호 밖에 적힌 함량. '판테놀 5%' · '에델바이스꽃/잎추출물 100,000ppm'
# 천 단위 쉼표를 허용한다 — 앞의 _split_by_comma가 숫자 사이 쉼표를 지켰다.
_BARE_AMOUNT = re.compile(r"\s+[\d,]*\d(?:\.\d+)?\s*(?:%|ppm|ppb)\s*$", re.I)

# 한글이 하나도 없는 토큰. 이 카탈로그의 전성분은 전부 한글 표기라
# (영문 전용 제품 0건) 순 영숫자는 라벨·코드 조각이다.
_NO_HANGUL = re.compile(r"^[^가-힣]+$")

# 보이지 않는 문자. 웹에서 복사할 때 딸려 온다.
#   200B 제로폭 공백 · 200C 제로폭 비접합 · FEFF BOM · 00A0 줄바꿈 없는 공백
# '소듐하이드록사이드​'가 별개 성분으로 등록돼 있었다.
_INVISIBLE = re.compile("[​‌‍﻿ ]")

# 짝이 없어 문자열 끝에 홀로 남은 괄호. '리날룰(' · '온천수)'
# 개수로 판정한다 — 협회 사전에도 '비스(트라이옥틸…'처럼 여는 괄호만 있는
# 이름이 2종 있어, 이름 안쪽의 짝 없는 괄호는 건드리면 안 된다.
_LONE_PAREN = re.compile(r"[()]$")

_OPENERS = "([{"
_CLOSERS = ")]}"


def _split_by_comma(raw: str) -> list[str]:
    """쉼표로 분리. 괄호 안 쉼표와 숫자 사이 쉼표는 구분자로 보지 않는다."""
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
            after = raw[i + 1] if i + 1 < len(raw) else ""
            # 쉼표 뒤 공백을 건너뛴 다음 글자. '1, 2-헥산다이올'처럼 띄어 쓴
            # 표기가 실제로 있다(제품 12건).
            j = i + 1
            while j < len(raw) and raw[j] == " ":
                j += 1
            nxt = raw[j] if j < len(raw) else ""

            # 공백 유무로 판정을 나눈다.
            #   붙여 쓴 경우  앞뒤 글자가 숫자면 성분명 내부다.
            #                1,2-헥산다이올 · 10,000ppm ·
            #                비스-에톡시다이글라이콜사이클로헥산1,4-다이카복실레이트
            #   띄어 쓴 경우  **모은 것이 전부 숫자일 때만** 내부로 본다.
            #                '1, 2-헥산다이올'은 내부지만
            #                '피이지-90, 1,2-헥산다이올'은 구분자다 —
            #                앞 글자만 보면 둘을 구별할 수 없다.
            head = "".join(buf).strip()
            inside = (
                (head.isdigit() and nxt.isdigit())
                if after == " "
                else (prev.isdigit() and nxt.isdigit())
            )
            if inside:
                buf.append(ch)
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


def _segment_by_vocab(raw: str, vocab: set[str], max_join: int = 4) -> list[str]:
    """공백으로 나뉜 전성분을 사전 최장일치로 묶는다.

    성분명 자체에 공백이 들어가는 경우가 있어(속명 + 종명) 단순 split이
    통하지 않는다. 협회 사전 기준 3.9%가 여기 해당한다.

        '정제수 알로에 페리추출물 글리세린'
          → ['정제수', '알로에 페리추출물', '글리세린']

    사전에 없으면 한 토큰씩 끊어 원문을 그대로 남긴다. 성분을 버리지 않는다.
    """
    tokens = raw.split()
    out: list[str] = []
    i = 0
    while i < len(tokens):
        matched = 0
        # 긴 것부터 시도해 가장 긴 일치를 취한다
        for n in range(min(max_join, len(tokens) - i), 1, -1):
            cand = " ".join(tokens[i:i + n])
            if normalize(cand) in vocab:
                out.append(cand)
                matched = n
                break
        if not matched:
            out.append(tokens[i])
            matched = 1
        i += matched
    return out


def parse_ingredients(raw: str, vocab: set[str] | None = None) -> list[str]:
    """전성분 문자열을 성분 목록으로 분리.

    구분자가 제품마다 다르다. 쉼표가 표준이지만 공백이나 '@'를 쓰는
    제품도 있어, 쉼표로 하나밖에 안 나오면 다른 구분자를 시도한다.

      1) 쉼표  — 대부분(4,300여 건). 괄호 안 쉼표와 '1,2-' 는 예외 처리
      2) '@'   — 성분명에 쓰이지 않아 그대로 잘라도 안전
      3) 공백  — vocab이 있을 때만. 사전 최장일치로 묶는다

    '/'는 구분자로 쓰지 않는다. '약모밀꽃/잎/줄기수'처럼 성분명의 일부라
    자르면 존재하지 않는 성분이 생긴다. 공백 처리 과정에서 함께 해결된다.

    vocab: 정규화된 성분명 집합. 없으면 1)·2)만 수행한다.

    >>> parse_ingredients("정제수, 1,2-헥산다이올, 자작나무수액(10,000ppm)")
    ['정제수', '1,2-헥산다이올', '자작나무수액(10,000ppm)']
    >>> parse_ingredients("정제수@글리세린@판테놀")
    ['정제수', '글리세린', '판테놀']
    """
    if not raw or not raw.strip():
        return []

    # '[STEP3]'·'[브라이트닝]' 같은 구성품 라벨은 구간 경계다. 쉼표로 바꿔
    # 두면 '아시아틱애씨드 [STEP3] 정제수'가 두 성분으로 갈린다. 라벨을
    # 그냥 지우면 앞뒤 성분이 한 덩어리로 붙어버린다.
    #
    # 쉼표를 쓰는 문자열에서만 바꾼다(618건 중 607건). 공백 구분 문자열에
    # 적용하면 쉼표가 생겨 아래 분기가 여기서 끝나버리고, 정작 필요한
    # vocab 최장일치 분리를 건너뛰어 전성분 전체가 성분 하나로 등록된다.
    # 쉼표 외의 구분자를 쉼표로 바꿔 아래 분리 로직에 태운다.
    raw = _ALT_SEPARATORS.sub(",", raw)
    raw = _DOT_SEPARATOR.sub(",", raw)

    if "," in raw:
        raw = _SECTION_LABEL.sub(",", raw)
        raw = _STEP_LABEL.sub(",", raw)

    parts = _split_by_comma(raw)
    if len(parts) > 1:
        return parts

    if "@" in raw:
        return [t.strip() for t in raw.split("@") if t.strip()]

    if vocab and len(raw.split()) > 1:
        return _segment_by_vocab(raw, vocab)

    return parts


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
    # 안내문구를 먼저 잘라낸다. 그 앞에 실제 성분이 붙어 있는 경우가 많다
    # ('페녹시에탄올 제공된 성분은 …' → '페녹시에탄올'). 순서를 뒤집으면
    # 성분까지 함께 버려진다.
    s = _INVISIBLE.sub("", name).strip()
    s = _NOTICE.sub("", s)
    s = _SECTION_LABEL.sub("", s)
    s = _LEADING.sub("", s)
    s = _FOOTNOTE_TEXT.sub("", s)
    # 문구를 다 걷어내고도 남으면 성분이 아니다 — 안내 문장이 쉼표로 쪼개진
    # 조각이다. 앞선 절단보다 먼저 검사하면 '토코페롤 * 무첨가 성분: …'의
    # '토코페롤'까지 함께 버려진다.
    if _NOT_INGREDIENT.search(s):
        return ""
    s = _TRAILING_QUOTE.sub("", s.strip())
    s = _BARE_AMOUNT.sub("", s)
    # 함량 괄호가 먼저 빠져야 그 앞의 '*'가 문자열 끝으로 와서 마커로 잡힌다.
    s = _AMOUNT.sub("", s)
    s = _MARKERS.sub("", s.strip())
    # 닫는 괄호가 여는 괄호보다 많을 때만 각주로 본다. 짝이 맞으면
    # '(CI 77891)' 같은 성분명 일부라 건드리면 안 된다.
    while s.count(")") > s.count("(") and _FOOTNOTE.search(s):
        s = _FOOTNOTE.sub("", s)
    s = _MARKERS.sub("", s.strip())
    s = _TRAILING_QUOTE.sub("", s.strip())
    s = re.sub(r"\s+", "", s)
    s = s.strip(" .,·|-")
    # 끝에 홀로 남은 괄호를 뗀다. 짝이 맞으면 성분명의 일부다.
    while s and _LONE_PAREN.search(s) and s.count("(") != s.count(")"):
        s = s[:-1].strip(" .,·|-")
    # 다 걷어내고 한글이 하나도 안 남으면 성분이 아니다 — 'E65R'·'TONIC'·'1,2'
    # 같은 라벨·코드 조각이다. 이 카탈로그는 전성분이 전부 한글 표기다.
    if _NO_HANGUL.match(s):
        return ""
    if s in _FORM_LABEL:
        return ""
    # 조회 키라서 대소문자를 통일한다. 'C18-21알케인'과 'c18-21알케인',
    # '4-T-부틸…'과 '4-t-부틸…'이 별개 성분으로 갈려 있었다.
    # 표시용 이름(name_ko)은 원문을 그대로 쓰므로 영향이 없다.
    return s.lower()


def normalize_loose(name: str) -> str:
    """느슨한 조회 키. normalize()로 못 찾았을 때의 2차 시도.

    성분명에 포함된 괄호까지 전부 제거한다. 오탐 여지가 있어
    1차 조회 실패 시에만 쓴다.
    """
    return re.sub(r"\([^)]*\)", "", normalize(name)).strip(" .,·|")
