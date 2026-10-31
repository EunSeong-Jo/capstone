from __future__ import annotations

import re

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.weather import CACHE_KEY as WEATHER_CACHE_KEY
from app.api.weather import fetch_weather_snapshot
from app.config import settings
from app.core.cache import cache_get
from app.core.deps import get_optional_user
from app.core.rate_limit import allow_daily, client_ip
from app.db.session import get_db
from app.models.user import User
from app.schemas.weather import WeatherOut
from app.services import chat_fallback, chat_tools, llm, personal_context, rag
from app.services import memory as memory_service
from app.services.llm import LLMUnavailable

router = APIRouter(prefix="/api/v1", tags=["chat"])
log = structlog.get_logger()

_SYSTEM_TEMPLATE = """\
당신은 Swappy 앱의 화장품 전문 AI 챗봇입니다.

[사용자 정보]
피부 타입: {skin_type_label}
오늘 날씨: {weather_context}

[내 정보 요약 — 이 사용자 본인의 데이터]
{personal_context}

[참고 제품 데이터]
{products_context}

[답변 절차 — 반드시 이 순서로 생각하세요]
1. 사용자 질문에서 핵심 의도를 파악한다 (제품 추천 / 성분 자체 설명 / 성분 비교 /
   대체품 탐색 등). 특정 제품이 아니라 성분 자체("OO가 뭐야", "OO 효과 궁금해")를
   묻는 질문이면 2~3번은 건너뛰고 [성분 설명 규칙]을 따른다
2. 위 제품 데이터에서 관련 항목을 찾는다
3. 제품의 주요성분을 보고 {skin_type_label} 피부 타입에 어울리는지 일반 지식으로 판단한다
   (데이터베이스에 피부타입별 적합도 정보 자체는 아직 없다 — 성분 기반으로만 판단하고,
    확정적으로 "이 피부타입 전용"이라고 단정하지 않는다)
4. 사용자가 날씨·계절과 관련된 질문을 하거나, 추천 이유를 보강할 때 위 날씨 정보를
   참고한다 (예: 건조하거나 습도가 낮은 날엔 보습 성분을, 무더운 날엔 산뜻한 제형을
   우선 언급). 날씨 정보를 가져오지 못했다면 그 사실을 말하고 날씨 없이 답한다
5. 제품에 대한 사실(이름/가격/함유 성분/평점 등)은 위 제품 데이터에 있는 것만 말한다
6. 제품 관련 정보는 데이터에 없으면 절대 추측하거나 지어내지 않는다
   (성분 자체에 대한 일반 지식 설명은 예외 — [성분 설명 규칙] 참고)
7. [내 정보 요약]이 있으면 사용자 본인의 화장대·피부 상태·예산이므로 답에 자연스럽게 반영한다
   (예: 이미 쓰는 제품은 새로 추천하지 않고 보완·대체 관점으로, 신경 쓸 부분을 돕는 성분을 우선 언급).
   화장대 목록에 없는 제품을 사용자가 쓴다고 말하지 않는다. 요약이 "없음"이면 개인 정보 없이 답한다

[성분 설명 규칙]
사용자가 특정 성분 자체를 궁금해하면("나이아신아마이드가 뭐야", "비타민 성분이
궁금해", "레티놀 효과 알려줘") 위 제품 데이터에 없어도 일반적으로 알려진 화장품·
성분 지식으로 설명해도 된다.
- 이건 우리 DB에서 검증한 정보가 아니라 일반 지식이라는 걸 **답변 맨 끝에 한 줄로만** 밝힌다
  (예: "일반적으로 알려진 내용이에요"). 첫 줄이나 소제목마다 되풀이하지 않는다
- 성분 이름을 모르고 효과·고민으로 묻는 질문("진정 성분이 뭐야", "건조할 때 좋은 성분", "여드름에 좋은 성분")에는
  그 효과로 알려진 대표 성분 3~5개를 성분마다 한 줄로 짧게 설명한다
- 그 성분이 "우리 제품 중 어디에 들어있는지"는 여전히 위 제품 데이터에 있는
  것만 말한다 — 목록에 없는 제품에 그 성분이 들어있다고 단정하지 않는다

[할루시네이션 방지 규칙 — 제품에 대한 사실에 적용]
- 제품 데이터에 명시된 이름, 성분, 가격, 카테고리, 평점만 사실로 단정한다
- "효능"은 제품 데이터에 없다. 성분을 근거로 일반적으로 알려진 효과를 설명하되,
  이 제품이 임상적으로 검증된 효능이 있다고 단정하지 않는다
- "~일 것 같아요", "~라고 알려져 있어요" 같은 추측 표현을 제품에 대한 사실에는
  사용하지 않는다 (성분 자체의 일반 설명에는 [성분 설명 규칙]이 우선한다)
- 데이터에 없는 제품을 있다고 단정하지 않는다
- 제품에 대해 확실하지 않으면 "현재 데이터에 없는 정보예요"라고 솔직하게 답한다

[도구 사용 규칙]
- 도구가 있으면 제품·가격·점수·대체품·루틴 같은 **사실은 도구로 확인한 값만** 말한다. 기억이나 추측으로 제품을 지어내지 않는다
- 내 화장대 제품은 [내 정보 요약]의 #번호가 제품 id다. 대체품·궁합은 그 id로 도구를 부른다
- 사용자가 예산으로 루틴을 원하면 build_routine, 비슷하지만 더 싼 제품이면 find_alternatives(cheaper_only)를 쓴다
- 피부가 어떻게 변했는지 물으면 get_skin_report, 오늘 뭘 바르면 좋은지 물으면 get_today_briefing을 쓴다(변화의 원인은 단정하지 않는다)
- 장바구니·화장대에 담아 달라고 하면 propose_* 도구로 *제안*만 하고, "담았어요"라고 말하지 말고 "아래 버튼으로 담을 수 있어요"라고 안내한다
- 도구가 오류를 주면 그대로 알리고 다른 방법을 제안한다
- 항상 한국어로 답한다. 제품 id(#번호)는 도구에 넘길 때만 쓰고 사용자에게 보이는 글에는 쓰지 않는다
- 사용자가 담아 달라고 했고 어떤 제품인지 분명하면 되묻지 말고 그 제품마다 propose_* 도구를 바로 부른다(루틴이면 선택한 조합의 제품들, 최대 4개).
  화면에 사용자가 직접 누르는 [담기] 버튼이 따로 나오므로 글로 "담아 드릴까요?"라고 되묻는 것은 필요 없다.
  어떤 제품인지 정할 수 없을 때만 어느 쪽으로 할지 한 번 묻는다

[앱 사용 안내 — 앱 이용 방법 질문은 이 내용으로만 답한다]
- 앱 소개: 쓰던 화장품과 성분이 비슷하면서 더 저렴하거나 내 피부에 더 잘 맞는 대체품을 찾아 주는 앱이다.
  성분 분석, 대체품 찾기·성분 비교, 내 피부 궁합, 얼굴 사진 AI 분석, 챗봇이 주요 기능이다
- 피부타입 진단: 질문에 답하면 8가지 피부타입 중 하나로 진단하는 문답 진단이 있다
  (마이페이지 > 피부타입 재진단, 또는 챗봇 입력창 옆 + 메뉴의 '피부타입 진단하기').
  얼굴 사진을 찍어 AI가 분석하는 방법은 마이페이지 > AI 피부관리에 있다
- 화장대 등록: 챗봇 입력창 옆 + 메뉴의 '내 화장품 등록하기'(제품명 입력 또는 제품 앞면 사진), 제품 상세 화면의 '내 피부와의 궁합' 제목 오른쪽 '+ 화장대에 추가'(담긴 제품은 '화장대에 있어요'를 다시 누르면 빠진다), 또는 화장대 탭의 '제품 추가'(스캔 화면)에서 제품을 찾아 추가한다
- 포인트: 주문 금액의 1%와 후기 작성 100P가 쌓이고, 취소·반품하면 회수된다. 내역은 마이페이지 > 포인트
- 주문·배송: 상태와 배송 추적은 마이페이지 > 주문내역, 취소·반품·환불은 마이페이지 > 취소/반품/환불 내역에서 본다.
  배송 일정은 챗봇이 알 수 없다
- 성분 비교: 제품 상세의 '다른 제품과 성분 비교하기', 또는 홈 '오늘의 교체 제안'의 '성분 비교'
- 위 안내에 없는 앱 기능은 모른다고 하고 마이페이지나 고객센터를 안내한다. 지어내지 않는다

[말투·분량 규칙]
- 사용자를 "사용자님", "회원님", "님"으로 부르지 않는다. 호칭 없이 주어를 생략하거나 "화장대에 있는 ~"처럼 쓴다
- 내 정보(피부타입, 피하는 성분, 신경 쓰는 부위, 취향)는 질문과 직접 관련 있을 때만, 답변 전체에서 한 번 말한다.
  인사·감사·앱 사용법·범위 밖 질문에는 꺼내지 않는다
- 분량: 인사·감사·짧은 확인은 1~2문장이고 제품 추천이나 팁을 덧붙이지 않는다. 성분 설명은 8줄·300자 안팎.
  앱 사용법은 4줄 이내. 같은 말을 소제목·본문·요약에서 반복하지 않는다
- 제품이 아닌 질문은 제품을 억지로 끌어오지 않는다
- 화장품·피부와 무관한 질문(점심 메뉴, 날씨 잡담 등)은 한 문장으로 범위 밖이라고 말하고, 할 수 있는 질문 예시를 하나만 든다. 날씨·피부 팁을 덧붙이지 않는다
- 검색·도구 결과의 구조를 설명하지 않는다("이 결과에는 ~가 없고", "데이터에서 ~만 나왔어요"). 못 찾았으면 "찾지 못했어요"라고만 하고 대안을 바로 준다
- 예산이 저장돼 있고 루틴을 요청받았으면 되묻지 말고 그 범위로 짠다. 끝에 "다음 중 하나를 도와드릴 수 있어요" 같은 메뉴 안내를 붙이지 않는다
- 예산 루틴 질문에는 가장 잘 맞는 조합 하나만 제품별로 보여 주고, 나머지 조합은 합계를 한 줄씩만 쓴다(길어서 잘리지 않게)
- 예산·화장대 제품·피부타입은 그것을 묻거나 답에 꼭 필요할 때만 말한다. 제품 추천 끝에 예산 이야기를 덧붙이지 않는다
- 도구로 할 수 없는 일(배송 일정, 결제, 적립 계산 등)은 한 번 정중히 말하고 어디서 확인하는지만 알려 준다.
  다른 기능이나 날씨 이야기를 덧붙이지 않는다
- 항상 한국어로만 쓴다. 영어 문장과 영어 판정값(ok·caution·good)을 쓰지 말고 무난·주의·잘 맞음으로 옮긴다.
  제품 번호(#), 도구 이름, 내부 값은 말하지 않는다
- 한글 단어 사이에 영어 철자를 섞어 쓰지 않는다(예: "알코올 덴atured" 금지 → "알코올 데나트" 또는 "변성 알코올")
- 사용자 정보를 말할 때 "내 취향", "내가 좋아하는"처럼 1인칭으로 쓰지 않는다. 챗봇이 말하는 글이므로
  "좋아하시는 성분", "쓰고 계신 제품", "취향으로 저장된 성분"처럼 존대 표현으로 쓴다

[형식 규칙 — 반드시 준수]
- 굵게 강조할 때만 **텍스트** 형식을 쓴다 (앱 화면이 이것만 굵게 렌더링한다)
- 그 외 마크다운 기호(#, -, `, > 등)는 절대 사용하지 않는다 — 화면에서 그대로
  기호로 보여 오히려 지저분해진다
- 소제목이 필요하면 **굵은 글씨**로 짧게 쓴다. 소제목에 이모지를 붙이지 않는다
- 목록은 항목 앞에 "· "를 붙여 한 줄씩 쓴다
- 이모지는 제품 번호(1️⃣2️⃣3️⃣)에만 쓴다. 💧 🌿 🛡 💡 ✨ 같은 장식 이모지는 쓰지 않는다
- 제품 목록은 아래 형식을 따른다. 답변에서 말한 제품은 데이터의 이름 그대로 쓴다(카드가 이름으로 연결된다).
  주요성분은 추천 이유에 필요한 2~3개만 쓴다:

  1️⃣ **제품명**
  브랜드 | 가격원
  주요성분: ...
  추천 이유: ...

- 서론은 한 줄로 짧게, 바로 핵심으로 이어간다
- 마지막 요약이나 팁은 꼭 필요할 때만 한 줄로 쓴다. "💡 팁", "한 줄 요약" 같은 머리말은 붙이지 않는다
"""


_MAX_HISTORY = 20
# 답변 길이 상한(토큰). 1024로는 제품 여러 개를 나열하는 답이 중간에 잘렸다.
_MAX_REPLY_TOKENS = 1800

# 프롬프트가 금지해도 모델이 가끔 쓰는 호칭("사용자님이", "회원님의")을 지운다.
_HONORIFIC = re.compile(r"(?:사용자|회원|고객)님(?:께서|께|이|은|는|의|도)?\s*")


def _tidy_reply(reply: str) -> str:
    """호칭을 빼고 빈 줄을 정리한다. 내용은 건드리지 않는다."""
    text = _HONORIFIC.sub("", reply)
    text = re.sub(r"\s*\(?#\d{1,8}\)?", "", text)       # 제품 번호(#867)는 사용자에게 보이지 않는다
    return re.sub(r"\n{3,}", "\n\n", text).strip()


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    skin_type: str | None = None
    history: list[Message] = []
    # 마이 성분은 기기에만 있어 클라이언트가 실어 보낸다(로그인한 사용자의 개인 요약에만 쓰인다).
    my_ingredients: list[str] = Field(default_factory=list, max_length=personal_context.MAX_MY_INGREDIENTS)


class ProductCard(BaseModel):
    """답변 아래에 보여 줄 제품 카드(도구가 찾은 제품). 필드는 프론트 카드가 그대로 읽는다(camelCase)."""

    id: int
    name: str
    brand: str = ""
    category: str = ""
    price: int = 0
    imageUrl: str | None = None  # noqa: N815 — 이 라우터는 camelCase 변환 없이 필드를 그대로 선언한다
    rating: float | None = None
    fitScore: int | None = None  # noqa: N815


class ChatAction(BaseModel):
    """"담을까요?" 제안. 서버는 담지 않는다 — 사용자가 버튼을 눌러 기존 API를 부른다."""

    type: str  # add_to_cart | add_to_closet
    productId: int  # noqa: N815
    label: str


class ChatResponse(BaseModel):
    reply: str
    cards: list[ProductCard] = []
    actions: list[ChatAction] = []
    # "fallback"이면 LLM 키·장애로 DB 기반 답변(services/chat_fallback.py)을 준 것.
    mode: str = "ai"


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


def _mentioned_cards(cards: list[dict], reply: str, *, fallback: bool = True) -> list[dict]:
    """도구가 본 제품 중 답변에서 실제로 언급한 것만 카드로 낸다(루틴 3안을 다 조회해도 말하지 않은 제품 카드가 붙으면 어수선하다).
    하나도 못 찾으면(모델이 제품명을 줄여 쓴 경우) 앞쪽 몇 개만 남긴다."""
    def keys(card: dict) -> list[str]:
        """카드 이름이 답변에 나왔는지 볼 열쇠들. 모델이 브랜드를 빼거나 이름을 줄여 써도 잡는다."""
        name = "".join(card["name"].split())
        brand = "".join((card.get("brand") or "").split())
        out = [name[:10]]
        if brand and name.startswith(brand) and len(name) - len(brand) >= 4:
            out.append(name[len(brand):][:8])
        return [k for k in out if len(k) >= 4]

    flat = "".join(reply.split())
    hit = [c for c in cards if any(k in flat for k in keys(c))]
    return hit or (cards[:4] if fallback else [])


async def _remember_explicit(
    user: User | None, db: AsyncSession, message: str, history: list[dict]
) -> tuple[bool, list[str]]:
    """(기억 사용 중인가, 이번 말에서 저장한 문장). 어떤 실패도 챗봇을 막지 않는다."""
    if user is None or not settings.PERSONAL_AI_ENABLED:
        return False, []
    try:
        if not await memory_service.is_enabled(db, user.id):
            return False, []
        items = await memory_service.explicit_items(message, history)
        saved = await memory_service.add_memories(db, user.id, items, source="explicit") if items else []
        return True, saved
    except Exception as exc:  # noqa: BLE001
        log.warning("chat_memory_failed", error=str(exc)[:200])
        await db.rollback()
        return False, []


def _with_remembered(reply: str, remembered: list[str]) -> str:
    """저장했으면 사용자가 알 수 있게 답변 끝에 알린다(보이지 않게 쌓지 않는다)."""
    if not remembered:
        return reply
    return f"{reply}\n\n📌 기억해 둘게요: {' / '.join(remembered)}\n(마이페이지 > 설정 > AI 기억에서 지울 수 있어요)"


async def _snapshot_of(
    user: User | None, db: AsyncSession, req: ChatRequest
) -> personal_context.PersonalSnapshot | None:
    if user is None or not settings.PERSONAL_AI_ENABLED:
        return None
    try:
        return await personal_context.build_snapshot(db, user.id, req.my_ingredients)
    except Exception as exc:  # noqa: BLE001 — 개인 요약을 못 만들어도 일반 챗봇으로 답한다
        log.warning("chat_personal_context_failed", error=str(exc)[:200])
        await db.rollback()  # 실패한 쿼리가 트랜잭션을 망가뜨린 채로 뒤 쿼리가 이어지지 않게
        return None


@router.post("/chat", response_model=ChatResponse)
async def chat(
    req: ChatRequest,
    request: Request,
    background: BackgroundTasks,
    user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
) -> ChatResponse:
    # 비회원은 IP 기준 하루 몇 번만. LLM 호출이라 비용이 들고, 화면의 횟수 제한은
    # 기기에서 세서 시크릿 창이나 직접 호출로 넘을 수 있다 — 실제 차단은 여기서 한다.
    if user is None and not await allow_daily(
        "chat-guest", client_ip(request), settings.GUEST_CHAT_DAILY_LIMIT
    ):
        raise HTTPException(status_code=401, detail="로그인하면 챗봇과 계속 대화할 수 있어요.")

    # AI 기억: 동의한 사용자가 "○○ 기억해"라고 하면 바로 저장한다(AI가 문맥으로 정하고, 막히면 규칙으로 대신한다). 자동 추출은 응답 뒤에 한다.
    memory_on, remembered = await _remember_explicit(user, db, req.message, [m.model_dump() for m in req.history])

    # 로그인한 사용자만 개인 요약을 만든다. 실패해도 챗봇 자체는 막지 않는다(개인화는 덤이다).
    snapshot = await _snapshot_of(user, db, req)
    # 피부타입은 요청값이 우선이고(진단 직후 아직 저장 전일 수 있다), 없으면 서버에 저장된 값을 쓴다.
    skin_type = req.skin_type or (snapshot.skin_type if snapshot else None)

    products = await rag.search_products(db, req.message, skin_type, prefer_fit=snapshot is not None)
    skin_label = rag.skin_type_label(skin_type) if skin_type else "미확인"
    weather_context = await _get_weather_context()
    personal = personal_context.render(snapshot) if snapshot else ""

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
        personal_context=personal or "없음 (비회원이거나 아직 저장된 정보가 없음)",
        products_context=products_context,
    )

    # history가 무제한이라 최근 것만 보낸다(토큰·비용 상한).
    messages = [{"role": m.role, "content": m.content} for m in req.history[-_MAX_HISTORY:]]
    messages.append({"role": "user", "content": req.message})

    ctx = chat_tools.ToolContext(db=db, skin_type=skin_type, snapshot=snapshot, user_id=user.id if user else None)
    use_tools = user is not None and settings.PERSONAL_AI_ENABLED and settings.CHAT_TOOLS_ENABLED
    try:
        if use_tools:
            reply = _tidy_reply(
                await llm.chat_with_tools(
                    messages, system, chat_tools.TOOLS, chat_tools.make_runner(ctx), max_tokens=_MAX_REPLY_TOKENS
                )
            )
        else:
            reply = _tidy_reply(await llm.chat_completion(messages, system, max_tokens=_MAX_REPLY_TOKENS))
    except LLMUnavailable as exc:
        # 키 만료·한도·장애 — 모델 없이 DB로 답한다. 로그는 키 교체 신호로 남긴다.
        log.warning("chat_llm_fallback", error=str(exc)[:300])
        try:
            if use_tools and chat_tools.wants_routine(req.message):
                # 모델 없이도 예산 루틴은 같은 엔진으로 짠다
                result = await chat_tools.build_routine(ctx, {"budget_max": chat_tools.parse_budget(req.message)})
                reply = f"{chat_fallback.NOTICE}\n\n{chat_tools.routine_reply(result, chat_tools.wants_cart(req.message))}"
                cards = _mentioned_cards(ctx.cards, reply)
                # 담아 달라고 했으면 카드마다 [담기]를 붙인다(모델이 없어 어느 조합인지 못 고르므로 사용자가 고른다)
                if chat_tools.wants_cart(req.message):
                    for c in cards:
                        ctx.add_action({"type": "add_to_cart", "productId": c["id"], "label": f"{c['name']}을(를) 장바구니에 담을까요?"})
                return ChatResponse(reply=_with_remembered(reply, remembered), cards=cards, actions=ctx.actions, mode="fallback")
            return ChatResponse(
                reply=_with_remembered(await chat_fallback.fallback_reply(db, req.message, skin_type, snapshot), remembered),
                mode="fallback",
            )
        except Exception as fb_exc:
            log.error("chat_fallback_error", error=str(fb_exc)[:300])
            raise HTTPException(
                status_code=503,
                detail="지금 답변을 가져오지 못했어요. 잠시 후 다시 시도해주세요.",
            ) from fb_exc
    except Exception as exc:
        # 원본 예외 메시지(APIKey 인코딩 오류 등 내부 구현 디테일)를 그대로
        # 사용자에게 보여주면 안 된다 — 서버 로그로만 남기고, 사용자에게는
        # 무슨 일이 있었는지 알아볼 수 있는 일반 메시지만 준다.
        log.error("chat_llm_error", error=str(exc)[:300])
        raise HTTPException(
            status_code=503,
            detail="지금 답변을 가져오지 못했어요. 잠시 후 다시 시도해주세요.",
        ) from exc

    # 사용자가 "장바구니에 담아 줘"라고 했는데 모델이 제안 도구를 부르지 않았으면, 답변에서 말한 제품으로 제안을 만든다.
    # 어차피 사용자가 [담기]를 눌러야 담기므로 안전하다(제안만 하고 실행하지 않는다).
    if use_tools and chat_tools.wants_cart(req.message) and not ctx.actions:
        for c in _mentioned_cards(ctx.cards, reply)[:4]:
            ctx.add_action({"type": "add_to_cart", "productId": c["id"], "label": f"{c['name']}을(를) 장바구니에 담을까요?"})
    # 제안(actions)의 제품은 말했든 안 했든 카드로 함께 보인다(버튼이 어느 제품 것인지 알아야 한다)
    proposed = {a["productId"] for a in ctx.actions}
    cards = [c for c in ctx.cards if c["id"] in proposed] + [
        c for c in _mentioned_cards(ctx.cards, reply) if c["id"] not in proposed
    ]
    if not cards and products:
        # 모델이 도구를 부르지 않고 참고 제품 데이터만으로 추천한 경우: 답변에 이름이 나온 제품만 카드로 낸다
        cards = _mentioned_cards(
            [
                {"id": p["id"], "name": p["name"], "brand": p["brand"], "category": p["category"], "price": p["price"],
                 "imageUrl": p.get("image_url"), "rating": p["rating"]}
                for p in products
            ],
            reply,
            fallback=False,
        )
    # 자동 기억 추출은 응답이 나간 뒤에 한다(실패해도 응답에 영향 없음). 명시 저장이 이미 된 말은 건너뛴다.
    if user is not None and memory_on and not remembered:
        user_turns = sum(1 for m in req.history if m.role == "user") + 1
        if memory_service.should_extract(req.message, user_turns):
            background.add_task(memory_service.extract_and_store, user.id, req.message, reply, [m.model_dump() for m in req.history])
    return ChatResponse(reply=_with_remembered(reply, remembered), cards=cards, actions=ctx.actions)