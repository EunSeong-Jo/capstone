"""제품 ↔ 피부 궁합 판정 (Task 14).

DB를 모른다. 제품의 성분 목록(표기 순서)과 성분 기능 라벨(`ingredient_functions`), 피부타입만
받아 판정을 돌려준다 — 테스트가 DB 없이 돈다. 조회는 app/api/skin_fit.py.

판정의 근거
-----------
성분마다 라벨이 있다(기능 9종 H B S W A O P E U, 역할, 플래그 I F L, 확신도 1~3).
피부타입마다 **선호 기능**과 **기피 플래그**를 둔다. 제품 안에서 활성·에몰리언트 성분이 그 기능을
얼마나(앞 성분일수록 많이) 갖는지로 가점하고, 기피 플래그가 있으면 감점한다.

    선호 점수  = 1 - exp(-Σ 가중 / (REF[타입] × 1.9))   # 0~1, 타입별 기준 규모로 포화
    감점       = Σ 기피 플래그별 (타입 가중 × 개수 보정)
    score      = 100 × (0.30 + 0.70 × 선호 점수) − 감점

이 모듈이 피부타입 규칙의 **정본**이다. 계산 결과는 `product_skin_fit`에 사전 적재되고(scripts/compute_skin_fit.py),
목록 필터·정렬·홈 추천·예산 가이드·카드·배지·전성분 칩이 모두 같은 판정을 읽는다.
예전의 `skin_type_rules`·`tags` 기반 규칙은 더 이상 읽지 않는다.

기피 플래그는 **확신도 3**(또는 식약처 고시 목록)일 때만 근거로 쓴다. 목록에서 제품을 **빼는**(하드 제외) 기준은
근거가 분명한 것만이다: 고시 목록 성분·일반 향료, 건조 알코올. 나머지는 감점과 "주의" 표시로만 알린다.

정직하게 말하기
---------------
- 확신도 1(검수 대상) 성분과 라벨 없는 성분은 근거로 쓰지 않는다.
- 근거가 될 활성 성분이 너무 적으면 판정하지 않고 `unknown`을 돌려준다. 모르는 것을
  "보통"으로 보여주지 않는다.
- 점수는 같은 피부타입 안에서 제품을 견주는 용도다. 의학적 판단이 아니다.

`axes`(진단 5축)를 주면 가중을 조정할 수 있지만, 화면 간 값이 갈라지지 않도록 현재 호출부는 쓰지 않는다.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

from app.services.similarity import FUNC_NAMES, POSITION_HALF, Label

Doc = list[int]

# 선호 기능 가중(0~1). 키는 FUNC_NAMES 코드.
PREFER: dict[str, dict[str, float]] = {
    "ondalsam":   {"O": 0.7, "H": 0.6, "B": 0.5, "S": 0.3},
    "mulgae":     {"P": 1.0, "E": 0.5, "H": 0.3, "W": 0.2},
    "subuji":     {"H": 1.0, "P": 0.5, "B": 0.4, "S": 0.2},
    "hwasan":     {"P": 1.0, "S": 0.8, "E": 0.4, "B": 0.3},
    "samak":      {"H": 1.0, "B": 1.0, "S": 0.3},
    "injeolmi":   {"A": 1.0, "H": 0.6, "B": 0.6, "O": 0.5},
    "yuriguseul": {"S": 1.0, "B": 1.0, "H": 0.3},
    "memilmuk":   {"W": 1.0, "O": 0.5, "U": 0.5, "S": 0.2},
}

# 기피 플래그 가중(점수에서 깎는 최대치, 점). I 자극 소지 · F 향료 · L 건조 알코올.
AVOID: dict[str, dict[str, float]] = {
    "ondalsam":   {"F": 3, "L": 3, "I": 3},
    "mulgae":     {"I": 4},
    "subuji":     {"L": 12, "I": 5, "F": 4},
    "hwasan":     {"F": 10, "L": 8, "I": 6},
    "samak":      {"L": 18, "F": 5, "I": 6},
    "injeolmi":   {"L": 8, "F": 5, "I": 5},
    "yuriguseul": {"F": 22, "L": 20, "I": 16},
    "memilmuk":   {"I": 6, "F": 4},
}

# 라벨 flags 문자열에 로더가 덧붙이는 **내부 마커**(DB 어휘 I F L과 별개). `build_flags`가 붙인다.
#   A  식약처 알레르기 유발 착향제 고시 목록의 성분(ingredient_functions.allergen_listed)
#   G  원료명이 일반 '향료'/'조합향료'(어떤 성분이 들었는지 특정할 수 없는 혼합 착향제)
MARK_LISTED = "A"
MARK_GENERIC = "G"
GENERIC_FRAGRANCE = frozenset({"향료", "조합향료"})

# 기피 플래그는 **확신도 3**(또는 고시 목록)일 때만 인정한다. 추정에 근거한 "주의"는 사용자에게 해롭다.
FLAG_MIN_CONFIDENCE = 3

# 피부타입 필터가 제품을 목록에서 **빼는** 기준(하드 제외). 기존 skin_type_rules의 exclude 태그와 같은 의미이고
# 근거가 분명한 것만 쓴다: 향료 = 고시 목록 성분 또는 일반 향료, 알코올 = 건조 알코올(확신도 3).
HARD_EXCLUDE_FRAGRANCE = frozenset({"hwasan", "yuriguseul"})
HARD_EXCLUDE_ALCOHOL = frozenset({"subuji", "samak", "yuriguseul"})

FLAG_REASON = {
    "F": "향료 성분이 들어 있어요",
    "L": "건조를 부르는 알코올이 들어 있어요",
    "I": "자극이 될 수 있는 성분이 들어 있어요",
}
LISTED_REASON = "식약처 지정 알레르기 유발 착향제가 들어 있어요"

# 타입별 기준 규모: 카탈로그 제품(성분 근거 3종 이상)의 선호 가중 합 **중앙값**(2026-10 실측).
# 타입마다 선호 기능이 달라 같은 상수로 포화시키면 보습 위주 타입은 거의 전부 '잘 맞음'이 된다.
# 중앙값 제품이 점수 ≈ 59(무난), 중앙값의 1.4배가 ≈ 66(잘 맞음)이 되도록 SAT = REF × 1.9.
REF: dict[str, float] = {
    "ondalsam": 4.1, "mulgae": 2.1, "subuji": 5.2, "hwasan": 2.3,
    "samak": 5.7, "injeolmi": 4.1, "yuriguseul": 4.1, "memilmuk": 1.3,
}
SAT_FACTOR = 1.9
# 기피 플래그 하나가 있을 때 감점이 최대치의 몇 배인가(개수가 늘면 0.25씩 더해 1.0까지).
# 알레르기 유발 향료는 거의 모든 제품에 한두 개 들어 있어 낮게 시작하고, 알코올은 한 개로도 크다.
FLAG_BASE = {"F": 0.4, "L": 0.7, "I": 0.5}
MIN_EVIDENCE = 3          # 이보다 적은 활성/에몰리언트 성분이면 판정하지 않는다
MIN_CONFIDENCE = 2
GOOD_AT = 66              # 이 점수 이상이면 잘 맞음
CAUTION_BELOW = 28        # 기능 성분이 거의 없어 이 정도로 낮으면 주의 (해로움보다 "필요한 성분이 없음")
CAUTION_SINGLE = 12       # 기피 플래그 하나의 감점이 이 이상이면 점수와 무관하게 주의
CAUTION_TOTAL = 18        # 감점 합이 이 이상이어도 주의


@dataclass
class Reason:
    kind: str    # plus | minus
    text: str
    # 이 이유를 만든 성분: (표기 순서 position, 이름). 화면이 전성분 칩을 강조하는 데 쓴다.
    ingredients: list[tuple[int, str]] = field(default_factory=list)


@dataclass
class SkinFit:
    verdict: str                      # good | ok | caution | unknown
    score: int | None
    skin_type: str
    reasons: list[Reason] = field(default_factory=list)
    matched: int = 0                  # 내 타입의 선호 기능을 가진 성분 수
    excluded: bool = False            # 이 타입의 필터가 목록에서 빼는 제품인가(하드 제외)
    has_fragrance: bool = False       # 고시 목록 성분 또는 일반 향료가 있다 (타입과 무관한 사실)
    has_drying_alcohol: bool = False  # 건조 알코올(확신도 3)이 있다 (타입과 무관한 사실)


def build_flags(flags: str, allergen_listed: bool, norm_name: str) -> str:
    """DB의 flags에 내부 마커(A·G)를 덧붙인다. 라벨을 읽어 오는 모든 곳이 이걸 거친다."""
    if allergen_listed and MARK_LISTED not in flags:
        flags += MARK_LISTED
    if norm_name in GENERIC_FRAGRANCE and MARK_GENERIC not in flags:
        flags += MARK_GENERIC
    return flags


def _flag_applies(f: str, conf: int, fl: str) -> bool:
    """이 성분의 플래그 f를 판정 근거로 쓰는가. 확신도 3이거나 고시 목록(F)일 때."""
    return f in fl and (conf >= FLAG_MIN_CONFIDENCE or (f == "F" and MARK_LISTED in fl))


def product_facts(doc: Doc, labels: dict[int, Label]) -> tuple[bool, bool]:
    """(향료 있음, 건조 알코올 있음) — 피부타입과 무관한 사실. 근거가 확실한 것만 센다."""
    frag = alc = False
    for ing in doc:
        lab = labels.get(ing)
        if lab is None:
            continue
        _f, _r, fl, conf = lab
        if MARK_LISTED in fl or MARK_GENERIC in fl:
            frag = True
        if "L" in fl and conf >= FLAG_MIN_CONFIDENCE:
            alc = True
    return frag, alc


def hard_excluded(skin_type: str, has_fragrance: bool, has_alcohol: bool) -> bool:
    return (skin_type in HARD_EXCLUDE_FRAGRANCE and has_fragrance) or (
        skin_type in HARD_EXCLUDE_ALCOHOL and has_alcohol
    )


def _adjust(skin_type: str, axes: dict[str, int] | None):
    """진단 5축(0~10)으로 선호·기피 가중을 조정한 사본."""
    prefer = dict(PREFER[skin_type])
    avoid = dict(AVOID[skin_type])
    if not axes:
        return prefer, avoid

    def boost(d: dict[str, float], key: str, k: float) -> None:
        if key in d:
            d[key] *= k
        else:
            d[key] = 0.3 * k

    if axes.get("sensitivity", 5) >= 7:
        for f in "SB":
            boost(prefer, f, 1.3)
        for f in avoid:
            avoid[f] *= 1.4
        for f in "FIL":
            avoid.setdefault(f, 6.0)
    if axes.get("oil", 5) >= 7:
        boost(prefer, "P", 1.3)
    if axes.get("moisture", 5) <= 3:
        boost(prefer, "H", 1.3)
        boost(prefer, "B", 1.2)
    if axes.get("pigmentation", 5) >= 7:
        boost(prefer, "W", 1.3)
    if axes.get("trouble", 5) >= 7:
        boost(prefer, "P", 1.2)
        boost(prefer, "S", 1.2)
        avoid["F"] = avoid.get("F", 0) * 1.3 + 3
    return prefer, avoid


def evaluate(
    doc: Doc,
    labels: dict[int, Label],
    names: dict[int, str],
    skin_type: str,
    axes: dict[str, int] | None = None,
    positions: list[int] | None = None,
) -> SkinFit:
    """제품 하나의 궁합. 모르는 피부타입이면 unknown.

    positions: doc과 같은 길이의 **실제 전성분 표기 순서**(1부터). 앞 성분일수록 크게 치는 가중과 화면의
    칩 강조가 이 값을 쓴다. 라벨 없는 성분이 중간에 끼어 있어도 같은 값이 나오도록, 사전 계산 배치와 카드 API는
    둘 다 실제 position을 넘긴다. 없으면 doc 안의 순번(1부터)을 쓴다.
    """
    if skin_type not in PREFER:
        return SkinFit("unknown", None, skin_type)

    frag, alc = product_facts(doc, labels)
    excluded = hard_excluded(skin_type, frag, alc)
    pos_of = (lambda i: positions[i]) if positions else (lambda i: i + 1)

    prefer, avoid = _adjust(skin_type, axes)
    raw = 0.0
    evidence = 0
    contrib: dict[str, list[tuple[float, int, int]]] = {}   # 기능 → [(기여, 성분, 인덱스)]
    flags: dict[str, list[int]] = {}                         # 플래그 → [인덱스]
    matched: set[int] = set()

    for idx, ing in enumerate(doc):
        lab = labels.get(ing)
        if lab is None:
            continue
        funcs, role, fl, conf = lab
        if conf >= MIN_CONFIDENCE and role in "ae":
            evidence += 1
            decay = 1.0 / (1.0 + (pos_of(idx) - 1) / POSITION_HALF)
            weights = [(prefer[f], f) for f in funcs if f in prefer]
            if weights:
                w, f = max(weights)
                raw += w * decay
                contrib.setdefault(f, []).append((w * decay, ing, idx))
                matched.add(ing)
        # 한 성분은 **가장 구체적인 플래그 하나**에만 속한다(F 향료 > L 알코올 > I 자극). 에탄올(L+I)이나 유제놀(F+I)이
        # 이유와 감점에 두 번 잡히지 않게 하려는 것이다. 이 타입이 기피하지 않는 플래그는 건너뛰므로,
        # 예컨대 지성(F를 기피하지 않음)에서는 F+I 성분이 I로 센다.
        for f in "FLI":
            if f in avoid and _flag_applies(f, conf, fl):
                flags.setdefault(f, []).append(idx)
                break

    base = dict(excluded=excluded, has_fragrance=frag, has_drying_alcohol=alc)
    if evidence < MIN_EVIDENCE:
        return SkinFit("unknown", None, skin_type, matched=len(matched), **base)

    pref = 1.0 - math.exp(-raw / (REF[skin_type] * SAT_FACTOR))
    penalty = 0.0
    worst = 0.0
    for f, hits in flags.items():
        cost = avoid[f] * min(1.0, FLAG_BASE[f] + 0.25 * (len(hits) - 1))
        penalty += cost
        worst = max(worst, cost)
    score = round(max(0.0, min(100.0, 100.0 * (0.30 + 0.70 * pref) - penalty)))

    if worst >= CAUTION_SINGLE or penalty >= CAUTION_TOTAL or score < CAUTION_BELOW:
        verdict = "caution"
    elif score >= GOOD_AT:
        verdict = "good"
    else:
        verdict = "ok"

    def entry(idx: int) -> tuple[int, str]:
        return pos_of(idx), names.get(doc[idx], "")

    reasons: list[Reason] = []
    for f, items in sorted(contrib.items(), key=lambda kv: -sum(c for c, _, _ in kv[1])):
        if len(reasons) >= 2:
            break
        text = f"{FUNC_NAMES[f]} 성분 {len(items)}종"
        reasons.append(Reason("plus", text, [entry(ix) for _, _, ix in sorted(items, key=lambda t: t[2])]))
    for f in sorted(flags, key="FLI".index):     # 향료 → 알코올 → 그 밖의 자극 순
        hits = flags[f]
        listed = f == "F" and any(MARK_LISTED in labels[doc[ix]][2] for ix in hits)
        text = LISTED_REASON if listed else FLAG_REASON[f]
        if f == "I" and ("F" in flags or "L" in flags):
            text = "그 밖에 " + text      # 향료·알코올로 이미 말한 성분은 빼고, 나머지 자극 성분만 말한다
        reasons.append(Reason("minus", text, [entry(ix) for ix in hits]))
    if not reasons:
        reasons.append(Reason("plus" if verdict == "good" else "minus",
                              "이 피부타입에 특히 필요한 기능 성분이 적어요" if verdict != "good" else "무난한 구성이에요"))
    if verdict == "caution":
        reasons.sort(key=lambda r: r.kind != "minus")     # 주의면 이유부터 보여 준다
    return SkinFit(verdict, score, skin_type, reasons, matched=len(matched), **base)


def classify_ingredient(label: Label | None, skin_type: str | None) -> str | None:
    """전성분 칩의 분류: 'key'(내 타입에 추천) · 'warn'(주의) · 'normal' · None(라벨 없음).

    `evaluate`와 같은 기준을 쓴다 — 칩의 추천/주의 개수와 궁합 카드의 이유가 어긋나지 않게.
      warn  고시 목록·일반 향료·건조 알코올(확신도 3)은 타입과 무관하게 주의. 타입이 있으면 그 타입의
            기피 플래그(확신도 3)도 주의.
      key   타입이 있고, 확신도 2 이상의 활성·에몰리언트가 그 타입의 선호 기능을 가질 때.
    """
    if label is None:
        return None
    funcs, role, fl, conf = label
    if MARK_LISTED in fl or MARK_GENERIC in fl or ("L" in fl and conf >= FLAG_MIN_CONFIDENCE):
        return "warn"
    if skin_type in AVOID and any(_flag_applies(f, conf, fl) for f in AVOID[skin_type]):
        return "warn"
    if skin_type in PREFER and conf >= MIN_CONFIDENCE and role in "ae" and any(
        f in PREFER[skin_type] for f in funcs
    ):
        return "key"
    return "normal"


__all__ = [
    "SkinFit", "Reason", "evaluate", "classify_ingredient", "build_flags", "product_facts",
    "hard_excluded", "PREFER", "AVOID",
    "HARD_EXCLUDE_FRAGRANCE", "HARD_EXCLUDE_ALCOHOL",
]
