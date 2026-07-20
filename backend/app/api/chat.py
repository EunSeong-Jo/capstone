from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services import llm, rag

router = APIRouter(prefix="/api/v1", tags=["chat"])

_SYSTEM_TEMPLATE = """\
당신은 Swappy 앱의 화장품 전문 AI 챗봇입니다.
사용자의 피부 타입: {skin_type}

[참고 제품 데이터]
{products_context}

[답변 절차 — 반드시 이 순서로 생각하세요]
1. 사용자 질문에서 핵심 의도를 파악한다 (추천 / 성분 비교 / 대체품 탐색 등)
2. 위 제품 데이터에서 관련 항목을 찾는다
3. 피부 타입({skin_type})과 맞는지 확인한다
4. 데이터에 있는 정보만 바탕으로 답변을 구성한다
5. 데이터에 없는 정보는 절대 추측하거나 생성하지 않는다

[할루시네이션 방지 규칙]
- 제품 데이터에 명시된 이름·성분·가격·효능만 사용한다
- "~일 것 같아요", "~라고 알려져 있어요" 같은 추측 표현을 금지한다
- 데이터에 없는 제품이나 성분을 언급하지 않는다
- 확실하지 않으면 "현재 데이터에 없는 정보예요"라고 솔직하게 답한다

[형식 규칙 — 반드시 준수]
- 별표(*), 샵(#) 같은 마크다운 기호를 절대 사용하지 않는다
- 항목마다 반드시 줄바꿈(\n)을 넣어 한 화면에 펼쳐 보이게 한다
- 제품 목록은 아래 형식을 따른다:

  1️⃣ 제품명
  브랜드 | 가격원
  효능: ...
  추천 이유: ...

- 서론은 한 줄로 짧게, 바로 추천 목록으로 이어간다
- 이모지는 항목 번호(1️⃣2️⃣3️⃣), 카테고리 구분(💧보습 🌿진정 🛡피부장벽 등)에만 사용한다
- 마지막에 한 줄 요약 또는 추가 팁을 덧붙인다
"""


class Message(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    skin_type: str | None = None
    history: list[Message] = []


class ChatResponse(BaseModel):
    reply: str


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    products = rag.search_products(req.message, req.skin_type)

    if products:
        products_context = "\n".join(
            f"- {p['name']} ({p['brand']}, {p['price']:,}원) | "
            f"효능: {', '.join(p['efficacy'])} | "
            f"주요성분: {', '.join(p['ingredients'])} | "
            f"적합피부: {', '.join(p['skin_types'])} | "
            f"평점: {p['rating']}"
            for p in products
        )
    else:
        products_context = "현재 등록된 제품 데이터 없음"

    system = _SYSTEM_TEMPLATE.format(
        skin_type=req.skin_type or "미확인",
        products_context=products_context,
    )

    messages = [{"role": m.role, "content": m.content} for m in req.history]
    messages.append({"role": "user", "content": req.message})

    try:
        reply = await llm.chat_completion(messages, system)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"LLM 오류: {exc}") from exc

    return ChatResponse(reply=reply)
