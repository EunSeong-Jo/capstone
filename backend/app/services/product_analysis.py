"""내 제품 성분 분석 — 한 제품을 기능·주의 성분·핵심 성분·화장대 안의 위치로 해석한다 (Task 14).

DB를 모른다. 제품의 성분 목록(실제 표기 순서)과 성분 기능 라벨(`ingredient_functions`)만 받아 숫자를 만든다.
조회와 응답 조립은 app/api/analysis.py.

기능·주의 판정은 `services/skin_fit.py`와 **같은 기준**을 쓴다(활성·에몰리언트 확신도 2+, 기피 플래그 확신도 3
또는 식약처 고시 목록). 그래서 상세·카드·배지와 이 분석이 서로 다른 말을 하지 않는다.
"""
from __future__ import annotations

import math

from app.services.similarity import FUNC_NAMES, POSITION_HALF, Label
from app.services.skin_fit import (
    FLAG_MIN_CONFIDENCE,
    MARK_GENERIC,
    MARK_LISTED,
    MIN_CONFIDENCE,
    PREFER,
)

FUNC_ORDER = "HBSWAOPEU"
# 기능 강도 = 1 - exp(-Σ 위치 가중 / STRENGTH_REF). 활성 성분 하나가 맨 앞이면 ≈ 0.39, 셋이면 ≈ 0.78.
STRENGTH_REF = 2.0
# 기능이 '강하다'고 말하는 기준(0~100)과 '비어 있다'고 말하는 기준
STRONG = 50
WEAK = 40

CAUTION_ORDER = ("listed", "fragrance", "alcohol", "irritant")
CAUTION_LABEL = {
    "listed": "식약처 지정 알레르기 유발 착향제",
    "fragrance": "향료 성분",
    "alcohol": "건조를 부르는 알코올",
    "irritant": "자극이 될 수 있는 성분",
}

Doc = list[int]


def function_strengths(
    doc: Doc, labels: dict[int, Label], positions: list[int] | None = None
) -> dict[str, dict]:
    """기능별 {'value': 0~100, 'count': 성분 수}. 활성·에몰리언트(확신도 2+)만, 앞 성분일수록 크게."""
    pos_of = (lambda i: positions[i]) if positions else (lambda i: i + 1)
    raw = {f: 0.0 for f in FUNC_ORDER}
    count = {f: 0 for f in FUNC_ORDER}
    for idx, ing in enumerate(doc):
        lab = labels.get(ing)
        if lab is None:
            continue
        funcs, role, _fl, conf = lab
        if conf < MIN_CONFIDENCE or role not in "ae":
            continue
        decay = 1.0 / (1.0 + (pos_of(idx) - 1) / POSITION_HALF)
        for f in funcs:
            if f in raw:
                raw[f] += decay
                count[f] += 1
    return {
        f: {"value": round(100 * (1 - math.exp(-raw[f] / STRENGTH_REF))), "count": count[f]}
        for f in FUNC_ORDER
    }


def key_ingredients(
    doc: Doc,
    labels: dict[int, Label],
    names: dict[int, str],
    positions: list[int] | None = None,
    limit: int = 5,
) -> list[dict]:
    """앞쪽(함량이 많은) 활성 성분. 기능이 있는 것만, 표기 순서대로."""
    pos_of = (lambda i: positions[i]) if positions else (lambda i: i + 1)
    out = []
    for idx, ing in enumerate(doc):
        lab = labels.get(ing)
        if lab is None:
            continue
        funcs, role, _fl, conf = lab
        if role != "a" or conf < MIN_CONFIDENCE or not funcs:
            continue
        out.append({
            "position": pos_of(idx),
            "name": names.get(ing, ""),
            "functions": [FUNC_NAMES[f] for f in funcs if f in FUNC_NAMES],
            "ingredient_id": ing,
        })
        if len(out) >= limit:
            break
    return out


def caution_kind(label: Label | None) -> str | None:
    """이 성분이 주의 성분이면 가장 구체적인 종류 하나(고시 목록 > 향료 > 알코올 > 자극), 아니면 None.

    피부타입과 무관한 사실이다. 근거가 확실한 것만 센다: 고시 목록·일반 향료, 확신도 3 플래그.
    """
    if label is None:
        return None
    _f, _r, fl, conf = label
    if MARK_LISTED in fl:
        return "listed"
    if MARK_GENERIC in fl or ("F" in fl and conf >= FLAG_MIN_CONFIDENCE):
        return "fragrance"
    if "L" in fl and conf >= FLAG_MIN_CONFIDENCE:
        return "alcohol"
    if "I" in fl and conf >= FLAG_MIN_CONFIDENCE:
        return "irritant"
    return None


def cautions(
    doc: Doc,
    labels: dict[int, Label],
    names: dict[int, str],
    positions: list[int] | None = None,
) -> list[dict]:
    """주의 성분을 종류별로. 성분 하나는 한 종류에만 속한다."""
    pos_of = (lambda i: positions[i]) if positions else (lambda i: i + 1)
    groups: dict[str, list[dict]] = {}
    for idx, ing in enumerate(doc):
        kind = caution_kind(labels.get(ing))
        if kind:
            groups.setdefault(kind, []).append({"position": pos_of(idx), "name": names.get(ing, "")})
    return [
        {"kind": k, "label": CAUTION_LABEL[k], "ingredients": groups[k]}
        for k in CAUTION_ORDER
        if k in groups
    ]


def cosine(a: dict[str, dict], b: dict[str, dict]) -> float:
    """두 제품의 기능 강도 벡터 코사인(0~1)."""
    va = [a[f]["value"] for f in FUNC_ORDER]
    vb = [b[f]["value"] for f in FUNC_ORDER]
    na = math.sqrt(sum(x * x for x in va))
    nb = math.sqrt(sum(x * x for x in vb))
    if na == 0 or nb == 0:
        return 0.0
    return sum(x * y for x, y in zip(va, vb)) / (na * nb)


def closet_position(
    mine: dict[str, dict],
    others: list[tuple[int, str, dict[str, dict]]],
    skin_type: str | None,
) -> dict:
    """같은 카테고리의 내 다른 보유 제품과 견준 이 제품의 위치.

    overlaps  이 제품이 강한 기능(>= STRONG)을 다른 보유 제품도 강하게 가진 경우 — "이미 있는 기능"
    gaps      내 피부타입이 중요하게 보는 기능(선호 가중 0.6+)인데 이 제품과 다른 보유 제품 모두 약한(< WEAK) 경우
              (피부타입을 모르면 비워 둔다 — 무엇이 필요한지 말할 근거가 없다)
    similar   기능 구성이 가장 닮은 보유 제품(코사인 %)
    others: [(product_id, 표시 이름, 기능 강도)]
    """
    overlaps = []
    for f in FUNC_ORDER:
        if mine[f]["value"] < STRONG:
            continue
        shared = [(pid, name) for pid, name, s in others if s[f]["value"] >= STRONG]
        if shared:
            overlaps.append({
                "function": f,
                "name": FUNC_NAMES[f],
                "products": [{"id": pid, "name": name} for pid, name in shared[:3]],
            })

    gaps = []
    if skin_type in PREFER:
        for f, w in sorted(PREFER[skin_type].items(), key=lambda kv: -kv[1]):
            if w < 0.6:
                continue
            best = max([mine[f]["value"], *(s[f]["value"] for _, _, s in others)])
            if best < WEAK:
                gaps.append({"function": f, "name": FUNC_NAMES[f]})

    similar = sorted(
        ({"id": pid, "name": name, "percent": round(100 * cosine(mine, s))} for pid, name, s in others),
        key=lambda x: -x["percent"],
    )[:3]
    return {
        "owned_count": len(others),
        "overlaps": overlaps,
        "gaps": gaps,
        "similar": [x for x in similar if x["percent"] > 0],
    }


# ── 내 피부 상태(진단 5축)와 견주기 ────────────────────────────────────────
#
# 진단 5축(0~10)은 문답과 얼굴 사진 분석을 합친 값이다(services/diagnosis.py). 축의 방향:
#   moisture 높을수록 촉촉 · oil 높을수록 지성 · sensitivity 높을수록 민감 ·
#   pigmentation 높을수록 색소 고민 · trouble 높을수록 트러블
# 그래서 '신경 쓸 정도(concern)'는 수분만 뒤집는다(10 − 점수).
#
# 이 비교는 궁합 점수(skin_fit)를 바꾸지 않는다. 궁합은 피부타입만으로 정해 목록·배지·카드가 같은 값을 보게 하고,
# 5축은 여기서 "내 피부 상태에 이 제품이 어떻게 도움이 되는가"를 풀어서 말하는 데만 쓴다.

AXIS_SPEC = {
    # 축: (이름, 신경 쓸 때의 표현, 돕는 기능, 자극 성분을 경계하는 축인가)
    "moisture": ("수분", "건조한 편", "HB", False),
    "oil": ("유분", "유분이 많은 편", "P", False),
    "sensitivity": ("민감도", "민감한 편", "SB", True),
    "pigmentation": ("색소·잡티", "색소 고민이 있는 편", "WO", False),
    "trouble": ("트러블", "트러블이 잦은 편", "PS", True),
}
FOCUS_AT = 6      # 신경 쓸 정도가 이 이상이면 '신경 쓸 부분'
MILD_AT = 4       # 이 이상이면 '약간'
GOOD_COVER = 50
SOME_COVER = 25


def concern_of(axis: str, score: int) -> int:
    return 10 - score if axis == "moisture" else score


def skin_state(
    axes: dict[str, int],
    strengths: dict[str, dict],
    caution_groups: list[dict],
) -> list[dict]:
    """축마다 {axis,name,score,concern,level,need,coverage,status,message,risk}. 신경 쓸 정도가 큰 순서.

    status  good 충분히 도움 · some 도움은 되나 부족 · lack 돕는 성분이 부족 · fine 신경 쓸 필요가 적음
    risk    자극을 경계하는 축(민감도·트러블)에서 주의 성분이 있으면 그 종류들의 문구
    """
    out = []
    kinds = {g["kind"] for g in caution_groups}
    for axis, (name, level_text, need, guard) in AXIS_SPEC.items():
        if axis not in axes:
            continue
        score = axes[axis]
        concern = concern_of(axis, score)
        level = "focus" if concern >= FOCUS_AT else "mild" if concern >= MILD_AT else "fine"
        best = max(need, key=lambda f: strengths[f]["value"])        # 이 축을 가장 잘 돕는 기능
        cover = strengths[best]["value"]
        count = strengths[best]["count"]
        need_names = "·".join(FUNC_NAMES[f] for f in need)

        if level == "fine":
            status, message = "fine", "신경 쓸 필요가 적은 부분이에요"
        elif cover >= GOOD_COVER:
            status = "good"
            message = f"{FUNC_NAMES[best]} 성분 {count}종이 도와줘요"
        elif cover >= SOME_COVER:
            status = "some"
            message = f"{need_names} 성분이 있지만 충분하진 않아요"
        else:
            status = "lack"
            message = f"{need_names}을(를) 돕는 성분이 부족해요"

        risk = None
        if guard and level != "fine":
            hit = [CAUTION_LABEL[k] for k in CAUTION_ORDER if k in kinds]
            if hit:
                risk = "·".join(hit) + "이(가) 들어 있어 예민할 땐 조심해요"
        out.append({
            "axis": axis, "name": name, "score": score, "concern": level,
            "level": level_text if level != "fine" else "괜찮은 편",
            "need": [FUNC_NAMES[f] for f in need], "coverage": cover,
            "status": status, "message": message, "risk": risk,
        })
    rank = {"focus": 0, "mild": 1, "fine": 2}
    return sorted(out, key=lambda r: (rank[r["concern"]], -concern_of(r["axis"], r["score"])))


def skin_state_summary(state: list[dict]) -> str | None:
    """한 줄 요약. 신경 쓸 부분이 없으면 None."""
    focus = [s for s in state if s["concern"] == "focus"]
    if not focus:
        return None
    lack = [s for s in focus if s["status"] == "lack"]
    good = [s for s in focus if s["status"] == "good"]
    names = lambda xs: ", ".join(s["name"] for s in xs)  # noqa: E731
    if lack and not good:
        return f"내 피부의 신경 쓸 부분({names(focus)})을 이 제품이 충분히 돕지는 못해요"
    if good and not lack:
        return f"내 피부의 신경 쓸 부분({names(focus)})을 이 제품이 잘 돕고 있어요"
    return f"{names(good)}은(는) 잘 돕지만 {names(lack)}은(는) 부족해요"
