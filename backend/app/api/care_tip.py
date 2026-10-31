"""오늘의 케어 문구 API (AI 생성).

    GET /api/v1/care-tip?skinType=ondalsam

피부타입별로 하루 한 번만 LLM을 호출한다 — 캐시 키에 오늘 날짜(서울 기준)를
넣어서, 날짜가 바뀌면 자동으로 다시 생성되게 한다. 하루 최대 "피부타입 8종"뿐이라
트래픽이 아무리 많아도 호출 비용·지연은 무시할 수준이다.

**문구는 그날 처음 생성된 것으로 고정한다.** 예전에는 키에 날씨 상태(맑음·구름…)도 넣었는데,
날씨가 오가면 같은 날에도 문구가 바뀌어 "탭을 오갈 때마다 다시 생성되는" 것처럼 보였다.
생성할 때 **오늘 하루 예보**(비·눈·강풍·일교차 같은 특이 날씨)를 프롬프트에 반영한다.

날짜는 캐시 키에만 들어가고 생성된 문구 자체에는 넣지 않는다(프롬프트에
날짜를 안 준다) — "9월 4일에는..." 같은 문구가 나오면 다음날 보기
어색해진다.
"""
from __future__ import annotations

from datetime import datetime

import structlog
from fastapi import APIRouter, HTTPException, Query, Response

from app.api.weather import SEOUL_TZ, get_day_outlook, get_weather_snapshot
from app.services.skin_type import SKIN_TYPE_LABELS
from app.core.cache import cache_get, cache_set
from app.schemas.care_tip import CareTipOut
from app.services.llm import chat_completion

router = APIRouter(prefix="/api/v1/care-tip", tags=["care-tip"])
log = structlog.get_logger()

CACHE_TTL = 90_000  # 25시간 — 자정 계산 없이도 날짜가 바뀌면 캐시 키 자체가 달라진다

# 프론트 SKIN_TYPE_META(types/index.ts)와 동일한 라벨. 프롬프트용 한글 표기라
# 여기 한 곳에서만 관리한다 — 프론트 라벨이 바뀌면 이쪽도 맞춰줘야 한다.

_SYSTEM_PROMPT = """\
당신은 화장품 앱 Swappy의 홈 화면에 뜨는 "오늘의 케어" 한 줄 문구를 쓰는 카피라이터입니다.

규칙:
- 한 문장, 공백 포함 18~26자(이모지 제외). 이 범위를 반드시 지킨다.
- 해요체, 친근하지만 과장 없이
- 끝에 어울리는 이모지 1개
- 피부타입 특성과 오늘 날씨 정보를 반영한 실용적인 스킨케어 팁 하나
- "오늘 특이 날씨"가 주어지면 그 이벤트를 중심으로 쓴다(비·습함 → 가벼운 보습과 피지 관리, 바람·건조 → 장벽 보호와 보습,
  일교차 → 보습 레이어링, 더위 → 선케어와 진정, 추위 → 보습과 보온 장벽, 눈 → 건조 대비). 스킨케어 밖의 조언(우산·옷차림)은 쓰지 않는다
- 문구만 출력한다 (설명이나 따옴표를 붙이지 않는다)
"""

# 홈 화면 말풍선 폭에 맞춘 안전망. 프롬프트가 18~26자를 지시하지만 LLM이
# 글자수를 정확히 세면서 생성하는 게 아니라서 지시를 어길 수 있다 — 그때도
# UI가 안 깨지도록 여기서 한 번 더 강제로 자른다. 목표치보다 넉넉히 잡아,
# 정상 범위 응답은 건드리지 않는다. 말풍선은 한 줄 약 15자·2줄까지라 30자가 한계다
# (›힌트 아이콘이 폭을 차지한다) — 28자면 이모지가 붙어도 두 줄에 들어간다.
_MAX_CHARS = 28


def _clamp_tip(text: str) -> str:
    text = text.strip().strip('"').strip()
    if len(text) <= _MAX_CHARS:
        return text
    cut = text[:_MAX_CHARS]
    last_space = cut.rfind(" ")
    if last_space >= 10:  # 너무 앞에서 자르지 않도록 최소 길이는 보존한다
        cut = cut[:last_space]
    return cut.rstrip("· ,!") + "…"


def _cache_key(skin_type: str) -> str:
    today = datetime.now(SEOUL_TZ).date().isoformat()
    return f"care_tip:{skin_type}:{today}"


@router.get("", response_model=CareTipOut, summary="오늘의 케어 문구 (AI 생성, 일 1회 캐싱)")
async def get_care_tip(
    response: Response,
    skin_type: str = Query(..., alias="skinType"),
) -> CareTipOut | Response:
    label = SKIN_TYPE_LABELS.get(skin_type)
    if label is None:
        raise HTTPException(status_code=400, detail=f"알 수 없는 피부타입: {skin_type}")

    # 오늘 문구가 이미 있으면 날씨를 보지도 않는다(날씨 조회가 실패해도 고정된 문구는 나간다)
    key = _cache_key(skin_type)
    cached = await cache_get(key)
    if cached is not None:
        return Response(
            content=cached, media_type="application/json",
            headers={"Cache-Control": "public, max-age=3600", "X-Cache": "HIT"},
        )

    snap = await get_weather_snapshot()
    outlook = await get_day_outlook()      # 실패하면 None — 현재 날씨만으로 쓴다

    humidity_text = f"{snap.humidity}%" if snap.humidity is not None else "정보 없음"
    user_prompt = (
        f"피부타입: {label}\n"
        f"오늘 날씨: {snap.condition_label}, {snap.temperature}도"
        f"(체감 {snap.feels_like}도, 최저 {snap.temp_min}~최고 {snap.temp_max}도)\n"
        f"습도 {humidity_text}, 구름량 {snap.clouds}%, 계절: {snap.season_label}"
    )
    if outlook is not None:
        user_prompt += (
            f"\n오늘 하루 예보: 최저 {outlook.temp_min}~최고 {outlook.temp_max}도, 강수확률 최대 {outlook.pop_max}%"
            f"\n오늘 특이 날씨: {', '.join(outlook.events) if outlook.events else '없음'}"
        )

    try:
        raw = await chat_completion(
            [{"role": "user", "content": user_prompt}], _SYSTEM_PROMPT, max_tokens=70
        )
    except Exception as exc:  # noqa: BLE001 — LLM 장애가 홈 화면을 막으면 안 된다
        log.warning("care_tip_generation_failed", error=str(exc)[:200])
        raise HTTPException(status_code=502, detail="케어 문구를 생성하지 못했습니다.") from exc

    result = CareTipOut(tip=_clamp_tip(raw))
    await cache_set(key, result.model_dump_json(by_alias=True), CACHE_TTL)
    response.headers["Cache-Control"] = "public, max-age=3600"
    response.headers["X-Cache"] = "MISS"
    return result
