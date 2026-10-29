"""오늘의 개인 브리핑 — 오늘 날씨 × 내 약한 피부 항목 × 내 화장대 (퍼스널 AI 4단계).

홈의 케어 문구는 피부타입 8종이 공유하는 한 줄이다. 이 브리핑은 **나만의** 한 장이다: 오늘 날씨가 내 피부에 요구하는 것(건조·더위·일교차·
자외선…)과 최근 사진 분석에서 신경 쓸 항목을 합쳐 "오늘 필요한 기능"을 정하고, **내 화장대에서 그 기능이 가장 강한 제품**을 먼저 쓰라고 알려 준다.

원칙
----
- 사실은 계산이다. 날씨·예보는 외부 값, 제품의 기능 강도는 성분 라벨 계산(`function_strengths`)이다. 문장은 규칙으로 만들어 LLM이 없어도 같다.
- 화장대에 필요한 기능을 가진 제품이 없으면 지어내지 않고 없다고 말한다(챗봇으로 찾아 보도록 안내).
- 날씨를 못 가져와도(키 없음·장애) 브리핑은 나온다 — 그때는 내 피부 항목만으로 만든다.

규칙(`needs_from_weather`·`needs_from_concerns`·`pick_product`·`compose`)은 DB를 모르는 순수 함수라 단위 테스트한다.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from app.services.personal_context import ClosetEntry, PersonalSnapshot
from app.services.product_analysis import CONCERN_SPEC, josa
from app.services.similarity import FUNC_NAMES

# 화장대 제품이 그 기능을 돕는다고 볼 최소 강도
PICK_MIN = 30
# 사진 분석에서 신경 쓸 항목이 날씨보다 한 걸음 더 내 얘기라 약간 더 쳐 준다
CONCERN_BONUS = 1.15

_NAME_TO_KEY = {spec[0]: key for key, spec in CONCERN_SPEC.items()}


@dataclass(frozen=True)
class Need:
    func: str                 # 기능 코드(H 보습 · B 장벽 · S 진정 · P 피지·모공 · U 자외선차단 …)
    why: str                  # 사용자에게 보여 줄 이유
    weight: float = 1.0


@dataclass
class Briefing:
    headline: str
    reasons: list[str] = field(default_factory=list)
    tips: list[str] = field(default_factory=list)       # 제품과 무관한 한 줄 팁(우산·일교차 …)
    pick: dict | None = None                           # {id, name, brand, why, function}
    missing: str | None = None                         # 필요한 기능을 가진 제품이 화장대에 없을 때 안내
    weather: dict | None = None                        # {label, temperature, humidity}


def needs_from_weather(
    temp: int | None, humidity: int | None, events: list[str], condition: str | None, season: str | None
) -> tuple[list[Need], list[str]]:
    """오늘 날씨가 요구하는 기능과 제품과 무관한 팁. 예보 특이사항(`events`, 케어 문구와 같은 문자열)을 우선한다."""
    needs: list[Need] = []
    tips: list[str] = []
    ev = " ".join(events)
    dry = "건조" in ev or (humidity is not None and humidity <= 40)
    cold = "추위" in ev or (temp is not None and temp <= 5)
    hot = "더위" in ev or (temp is not None and temp >= 28)
    humid = humidity is not None and humidity >= 75

    if dry:
        needs.append(Need("H", f"건조한 날이에요(습도 {humidity}%)" if humidity is not None else "건조한 날이에요"))
        needs.append(Need("B", "건조하면 장벽이 약해져요", 0.8))
    if cold:
        needs.append(Need("B", "쌀쌀해서 피부 장벽이 약해지기 쉬워요"))
    if hot or humid:
        needs.append(Need("P", "덥고 습해서 피지가 늘기 쉬워요"))
    if "일교차" in ev:
        needs.append(Need("B", "일교차가 커서 피부 컨디션이 흔들릴 수 있어요", 0.9))
    if condition == "sunny" and (temp is None or temp >= 10) and season in ("spring", "summer", "autumn", None):
        needs.append(Need("U", "맑아서 자외선이 있는 날이에요", 0.9))
    if "비" in ev or condition == "rainy":
        tips.append("비 예보가 있어요. 우산을 챙기고, 습한 날엔 가볍게 바르세요.")
    if "눈" in ev or condition == "snowy":
        tips.append("눈 예보가 있어요. 찬 바람에 피부가 거칠어지기 쉬우니 보습을 든든히 하세요.")
    if "강풍" in ev or condition == "windy":
        tips.append("바람이 강해요. 마스크나 스카프로 얼굴을 감싸면 건조함을 줄일 수 있어요.")
    return needs, tips


def needs_from_concerns(weak: tuple[tuple[str, int], ...]) -> list[Need]:
    """사진 분석에서 신경 쓸 항목(낮은 순) → 그 항목을 돕는 기능. 가장 낮은 두 항목만."""
    out: list[Need] = []
    for name, score in weak[:2]:
        key = _NAME_TO_KEY.get(name)
        if key is None:
            continue
        for f in CONCERN_SPEC[key][2][:2]:
            out.append(Need(f, f"최근 AI 분석에서 {josa(name, '이가')} {score}점이라 신경 쓸 부분이에요", CONCERN_BONUS))
    return out


def pick_product(needs: list[Need], closet: tuple[ClosetEntry, ...]) -> tuple[ClosetEntry, Need, int] | None:
    """필요한 기능과 화장대 제품의 강도(× 필요 가중)를 곱해 가장 높은 조합. `PICK_MIN` 미만이면 None."""
    best: tuple[float, ClosetEntry, Need, int] | None = None
    for need in needs:
        for e in closet:
            value = dict(e.strengths).get(need.func, 0)
            if value < PICK_MIN:
                continue
            score = value * need.weight
            if best is None or score > best[0]:
                best = (score, e, need, value)
    return (best[1], best[2], best[3]) if best else None


def compose(
    snapshot: PersonalSnapshot,
    *,
    temp: int | None = None,
    humidity: int | None = None,
    label: str | None = None,
    events: list[str] | None = None,
    condition: str | None = None,
    season: str | None = None,
    has_weather: bool = True,
) -> Briefing:
    """날씨와 내 요약으로 브리핑 한 장."""
    w_needs, tips = needs_from_weather(temp, humidity, events or [], condition, season) if has_weather else ([], [])
    c_needs = needs_from_concerns(snapshot.weak_concerns)
    needs = c_needs + w_needs

    reasons: list[str] = []
    for n in w_needs[:2]:
        if n.why not in reasons:
            reasons.append(n.why)
    if c_needs and c_needs[0].why not in reasons:
        reasons.append(c_needs[0].why)

    # 고른 제품의 근거(필요한 기능의 이유)가 이유 목록 앞에 오도록 맨 앞으로 올린다
    weather = {"label": label, "temperature": temp, "humidity": humidity} if has_weather and temp is not None else None
    picked = pick_product(needs, snapshot.closet) if needs else None

    if picked and picked[1].why not in reasons:
        reasons.insert(0, picked[1].why)
    if picked:
        entry, need, value = picked
        func_name = FUNC_NAMES.get(need.func, need.func)
        headline = f"오늘은 '{entry.name}'{josa(entry.name, '을를')[len(entry.name):]} 먼저 써 보세요"
        pick = {
            "id": entry.id, "name": entry.name, "brand": entry.brand, "function": func_name,
            "why": f"{func_name} 성분이 내 화장대에서 가장 강한 제품이에요({value}).",
        }
        missing = None
    else:
        pick = None
        if needs:
            want = FUNC_NAMES.get(needs[0].func, needs[0].func)
            headline = f"오늘은 {want} 케어가 필요해요"
            missing = f"내 화장대에는 {want} 성분이 강한 제품이 없어요. 챗봇에게 '{want}에 좋은 제품 추천해 줘'라고 물어보세요." if snapshot.closet else (
                "화장대가 비어 있어요. 쓰는 제품을 등록하면 오늘 먼저 쓸 제품을 골라 드려요."
            )
        else:
            headline = "오늘은 평소 루틴대로 가면 좋아요"
            missing = None if snapshot.closet else "화장대에 쓰는 제품을 등록하면 날씨에 맞는 제품을 골라 드려요."
    return Briefing(headline=headline, reasons=reasons, tips=tips, pick=pick, missing=missing, weather=weather)
