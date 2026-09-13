from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.weather import CACHE_KEY as WEATHER_CACHE_KEY
from app.api.weather import fetch_weather_snapshot
from app.core.cache import cache_get
from app.db.session import get_db
from app.schemas.weather import WeatherOut
from app.services import llm, rag

router = APIRouter(prefix="/api/v1", tags=["chat"])
log = structlog.get_logger()

_SYSTEM_TEMPLATE = """\
당신은 Swappy 앱의 화장품 전문 AI 챗봇입니다.

[사용자 정보]
피부 타입: {skin_type_label}
오늘 날씨: {weather_context}

[참고 제품 데이터]
{products_context}

[답변 절차 — 반드시 이 순서로 생각하세요]
1. 사용자 질문에서 핵심 의도를 파악한다 (추천 / 성분 비교 / 대체품 탐색 등)
2. 위 제품 데이터에서 관련 항목을 찾는다
3. 제품의 주요성분을 보고 {skin_type_label} 피부 타입에 어울리는지 일반 지식으로 판단한다
   (데이터베이스에 피부타입별 적합도 정보 자체는 아직 없다 — 성분 기반으로만 판단하고,
    확정적으로 "이 피부타입 전용"이라고 단정하지 않는다)
4. 사용자가 날씨·계절과 관련된 질문을 하거나, 추천 이유를 보강할 때 위 날씨 정보를
   참고한다 (예: 건조하거나 습도가 낮은 날엔 보습 성분을, 무더운 날엔 산뜻한 제형을
   우선 언급). 날씨 정보를 가져오지 못했다면 그 사실을 말하고 날씨 없이 답한다
5. 데이터에 있는 정보만 바탕으로 답변을 구성한다
6. 데이터에 없는 정보는 절대 추측하거나 생성하지 않는다

[할루시네이션 방지 규칙]
- 제품 데이터에 명시된 이름, 성분, 가격, 카테고리, 평점만 사용한다
- "효능"은 제품 데이터에 없다. 성분을 근거로 일반적으로 알려진 효과를 설명하되,
  이 제품이 임상적으로 검증된 효능이 있다고 단정하지 않는다
- "~일 것 같아요", "~라고 알려져 있어요" 같은 추측 표현을 사용하지 않는다
- 데이터에 없는 제품이나 성분을 절대 언급하지 않는다
- 확실하지 않으면 "현재 데이터에 없는 정보예요"라고 솔직하게 답한다

[형식 규칙 — 반드시 준수]
- 별표(*), 샵(#) 같은 마크다운 기호를 절대 사용하지 않는다
- 항목마다 줄바꿈을 넣어 읽기 쉽게 구성한다
- 제품 목록은 아래 형식을 따른다:

  1️⃣ 제품명
  브랜드 | 가격원
  주요성분: ...
  추천 이유: ...

- 서론은 한 줄로 짧게, 바로 핵심으로 이어간다
- 이모지는 항목 번호(1️⃣2️⃣3️⃣)와 카테고리 구분(💧 🌿 🛡 등)에만 적절히 사용한다
- 마지막에 한 줄 팁이나 요약을 덧붙인다
"""


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    skin_type: str | None = None
    history: list[Message] = []


class ChatResponse(BaseModel):
    reply: str


async def _get_weather_context() -> str:
    """날씨 정보를 프롬프트용 한 줄로 만든다.

    weather.py의 10분 캐시를 그대로 재사용한다(홈 화면에서 이미 채워둔
    경우가 많다). 캐시가 비어 있으면 직접 조회하되, 여기서 실패해도
    챗봇 응답 자체는 막지 않는다 — 날씨는 참고 정보일 뿐 핵심 기능이 아니다.
    """
    try:
        cached = await cache_get(WEATHER_CACHE_KEY)
        if cached is not None:
            w = WeatherOut.model_validate_json(cached)
        else:
            snap = await fetch_weather_snapshot()
            w = WeatherOut(
                condition=snap.condition,
                condition_label=snap.condition_label,
                icon=snap.icon,
                temperature=snap.temperature,
                season=snap.season,
                season_label=snap.season_label,
                humidity=snap.humidity,
            )
        humidity_text = f"{w.humidity}%" if w.humidity is not None else "정보 없음"
        return f"{w.condition_label}, {w.temperature}도, 습도 {humidity_text}, {w.season_label}"
    except Exception as exc:
        log.warning("chat_weather_unavailable", error=str(exc)[:200])
        return "가져오지 못함"


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, db: AsyncSession = Depends(get_db)) -> ChatResponse:
    products = await rag.search_products(db, req.message, req.skin_type)
    skin_label = rag.skin_type_label(req.skin_type) if req.skin_type else "미확인"
    weather_context = await _get_weather_context()

    if products:
        products_context = "\n".join(
            f"- {p['name']} ({p['brand']}, {p['price']:,}원) | "
            f"카테고리: {p['category']} | "
            f"주요성분: {', '.join(p['ingredients']) or '정보 없음'} | "
            f"평점: {p['rating'] if p['rating'] is not None else '정보 없음'}"
            for p in products
        )
    else:
        products_context = "현재 등록된 제품 데이터 없음"

    system = _SYSTEM_TEMPLATE.format(
        skin_type_label=skin_label,
        weather_context=weather_context,
        products_context=products_context,
    )

    messages = [{"role": m.role, "content": m.content} for m in req.history]
    messages.append({"role": "user", "content": req.message})

    try:
        reply = await llm.chat_completion(messages, system)
    except Exception as exc:
        # 원본 예외 메시지(APIKey 인코딩 오류 등 내부 구현 디테일)를 그대로
        # 사용자에게 보여주면 안 된다 — 서버 로그로만 남기고, 사용자에게는
        # 무슨 일이 있었는지 알아볼 수 있는 일반 메시지만 준다.
        log.error("chat_llm_error", error=str(exc)[:300])
        raise HTTPException(
            status_code=503,
            detail="지금 답변을 가져오지 못했어요. 잠시 후 다시 시도해주세요.",
        ) from exc

    return ChatResponse(reply=reply)