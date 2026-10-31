"""AI 기억 — 챗봇이 대화에서 알게 된 사용자 정보를 한 줄씩 저장한다 (퍼스널 AI 3단계).

원칙
----
- **동의한 사용자에게만 쌓는다**(`user_consents` 'ai-memory'). 동의하지 않았거나 철회했으면 읽지도 쓰지도 않는다.
- **사용자가 직접 한 말만** 담는다. 추정·진단·건강 판단은 저장하지 않는다. 뷰티·피부와 상관없는 개인정보
  (연락처·주소·비밀번호 등)는 걸러 낸다.
- **보이고 고치고 지울 수 있다**(마이페이지 설정). 저장된 문장은 시스템 프롬프트에 들어가므로 한 줄·짧게·줄바꿈 없이만 받는다
  (프롬프트에 지시문을 심는 시도를 막는다).
- 자동 추출은 LLM이 하되 **실패해도 챗봇 응답에 영향이 없다**(응답 뒤 백그라운드). LLM이 막혀도 "○○ 기억해"처럼 사용자가
  명시한 문장은 규칙으로 저장한다.

DB를 읽고 쓰는 함수와 순수 함수(정제·판정·파싱)를 나눠, 순수 함수는 DB 없이 단위 테스트한다.
"""
from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone

import structlog
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.models.personal import UserMemory
from app.models.skin_photo import UserConsent
from app.services import llm

log = structlog.get_logger()

CONSENT_TYPE = "ai-memory"
CONSENT_VERSION = "v1"
MAX_MEMORIES = 20
MAX_LEN = 80
MIN_LEN = 3
# 프롬프트에 넣는 개수(최근 수정 순)
PROMPT_LIMIT = 10
# 자동 추출은 사용자 턴이 이 간격일 때만(비용). 명시적 단서가 있으면 매번.
EXTRACT_EVERY = 3
KINDS = ("preference", "avoid", "concern", "fact")

# 저장하지 않는 내용: 연락처·계정·식별 정보, URL, 프롬프트 지시문
_BLOCKED = re.compile(
    r"(https?://|www\.|@|\d{2,4}-\d{3,4}-\d{4}|\d{6}-?\d{7}|비밀번호|주민|계좌|카드번호|전화|주소|이메일"
    r"|system|assistant|ignore|지시|프롬프트|규칙을 무시|위 내용을 무시)",
    re.IGNORECASE,
)
# 사용자가 기억해 달라고 명시한 단서. 자동 추출을 건너뛰지 않게 하는 신호이기도 하다.
_EXPLICIT = re.compile(r"기억(해|해줘|해 줘|해둬|해 둬|해주세요|해 주세요|해라)")
# 대화에 이런 말이 있으면 기억할 만한 사실이 있을 가능성이 높아 매 턴 추출을 시도한다.
_CUES = ("싫어", "좋아", "알레르기", "예민", "민감", "트러블", "여드름", "건조", "지성", "안 맞", "맞지 않", "자극", "향", "무향", "항상", "매일", "쓰고 있", "쓰는 중", "고민")


def norm(text: str) -> str:
    """중복 판정용 정규화: 공백·문장부호를 걷고 소문자로."""
    return re.sub(r"[\s.,!?~·…\"'`]+", "", text).lower()


def clean(text: str | None) -> str | None:
    """저장해도 되는 한 줄 문장으로 다듬는다. 안 되면 None."""
    if not text:
        return None
    t = " ".join(str(text).replace("\r", " ").replace("\n", " ").split())
    t = t.strip(" -•*\"'`")
    if len(t) < MIN_LEN or _BLOCKED.search(t):
        return None
    return t[:MAX_LEN].rstrip()


def explicit_memory(message: str) -> str | None:
    """"향료 들어간 건 싫어, 기억해"에서 앞 문장을 뽑는다. 단서가 없거나 앞에 내용이 없으면 None."""
    m = _EXPLICIT.search(message)
    if not m:
        return None
    head = message[: m.start()].strip()
    # "그럼 크림이 좋다는 내용을 기억해줘" → "크림이 좋다". 말머리와 "~다는 내용을" 같은 군더더기를 걷어 사실만 남긴다.
    head = re.sub(r"^(?:그럼|그러면|그리고|그래서|아|음|참고로)[\s,]+", "", head)
    head = re.sub(r"(?<=다)(?:는|고)\s*(?:(?:내용|말|얘기|이야기|사실|것|거|걸)\s*)?(?:을|를|도)?$", "", head)
    head = re.sub(r"\s*(?:이?라는)\s*(?:내용|말|얘기|이야기|사실)\s*(?:을|를|도)?$", "", head)
    head = re.sub(r"\s*(?:내용|얘기|이야기)\s*(?:을|를)$", "", head)
    head = re.sub(r"(?:이?라고|라는\s*거|라는\s*걸|것도|것을|걸|좀|꼭|제발|이거|그거|앞으로)\s*$", "", head.strip()).strip(" ,.!~")
    head = re.sub(r"(?:이?라고|좀|꼭)\s*$", "", head).strip(" ,.!~")
    return clean(head)


def should_extract(message: str, user_turns: int) -> bool:
    """이번 대화에서 자동 추출을 시도할지. 명시적 단서·피부 관련 단서가 있거나 `EXTRACT_EVERY`번째 턴일 때."""
    if _EXPLICIT.search(message):
        return True
    if any(c in message for c in _CUES):
        return True
    return user_turns > 0 and user_turns % EXTRACT_EVERY == 0


EXTRACT_SYSTEM = f"""\
당신은 화장품 앱의 '기억 추출기'입니다. 대화에서 **사용자가 직접 말한** 피부·화장품 관련 사실만 한 줄씩 뽑습니다.

규칙
- 사용자가 말하지 않은 것(추측·진단·일반 상식)은 절대 쓰지 않는다. 챗봇의 말은 근거가 아니다.
- 피부 고민, 좋아하는/피하는 성분·제형·향, 알레르기·민감 반응, 쓰는 루틴·습관, 예산 선호처럼 **추천에 도움이 되는 것만**.
- 연락처·주소·계정·결제·건강 질환 진단·정치·종교 등 화장품과 무관하거나 민감한 정보는 쓰지 않는다.
- 각 항목은 {MAX_LEN}자 이내의 한국어 한 문장(예: "향료가 들어간 제품은 싫어함").
- kind는 preference(좋아함) · avoid(피함) · concern(고민) · fact(그 밖의 사실) 중 하나.
- 뽑을 게 없으면 빈 배열.

JSON 배열만 출력한다. 예: [{{"kind":"avoid","text":"향료가 들어간 제품은 싫어함"}}]"""


def parse_extraction(raw: str) -> list[tuple[str, str]]:
    """모델 출력에서 [(kind, text)]. JSON 배열이 아니거나 깨져도 예외 없이 빈 목록을 돌려준다."""
    if not raw:
        return []
    m = re.search(r"\[.*\]", raw, re.DOTALL)
    if not m:
        return []
    try:
        data = json.loads(m.group(0))
    except ValueError:
        return []
    out: list[tuple[str, str]] = []
    for row in data if isinstance(data, list) else []:
        if not isinstance(row, dict):
            continue
        text = clean(row.get("text"))
        if text is None:
            continue
        kind = row.get("kind") if row.get("kind") in KINDS else "fact"
        out.append((kind, text))
    return out[:5]


# ── 동의 ──────────────────────────────────────────────────────────────────


async def consent_row(db: AsyncSession, user_id: uuid.UUID) -> UserConsent | None:
    return await db.scalar(
        select(UserConsent).where(UserConsent.user_id == user_id, UserConsent.consent_type == CONSENT_TYPE)
    )


async def is_enabled(db: AsyncSession, user_id: uuid.UUID) -> bool:
    row = await consent_row(db, user_id)
    return row is not None and row.withdrawn_at is None


async def set_enabled(db: AsyncSession, user_id: uuid.UUID, enabled: bool) -> UserConsent | None:
    now = datetime.now(timezone.utc)
    row = await consent_row(db, user_id)
    if enabled:
        if row is None:
            row = UserConsent(user_id=user_id, consent_type=CONSENT_TYPE, version=CONSENT_VERSION, agreed_at=now)
            db.add(row)
        else:
            row.version, row.agreed_at, row.withdrawn_at = CONSENT_VERSION, now, None
    elif row is not None and row.withdrawn_at is None:
        row.withdrawn_at = now
    await db.commit()
    return row


# ── 저장·조회 ─────────────────────────────────────────────────────────────


async def list_memories(db: AsyncSession, user_id: uuid.UUID, *, enabled_only: bool = False, limit: int = MAX_MEMORIES) -> list[UserMemory]:
    stmt = select(UserMemory).where(UserMemory.user_id == user_id)
    if enabled_only:
        stmt = stmt.where(UserMemory.enabled.is_(True))
    return list((await db.scalars(stmt.order_by(UserMemory.updated_at.desc(), UserMemory.id.desc()).limit(limit))).all())


async def prompt_texts(db: AsyncSession, user_id: uuid.UUID) -> tuple[str, ...]:
    """프롬프트에 넣을 기억 문장. 동의하지 않았으면 비어 있다."""
    if not await is_enabled(db, user_id):
        return ()
    return tuple(m.content for m in await list_memories(db, user_id, enabled_only=True, limit=PROMPT_LIMIT))


async def add_memories(
    db: AsyncSession, user_id: uuid.UUID, items: list[tuple[str, str]], source: str = "auto"
) -> list[str]:
    """새로 저장된 문장 목록. 이미 있는 것(정규화 기준)은 시각만 갱신하고, 상한을 넘으면 오래된 자동 기억부터 지운다."""
    saved: list[str] = []
    now = datetime.now(timezone.utc)
    for kind, text in items:
        text = clean(text)
        if text is None:
            continue
        key = norm(text)
        existing = await db.scalar(select(UserMemory).where(UserMemory.user_id == user_id, UserMemory.norm_text == key))
        if existing is not None:
            existing.updated_at = now
            existing.enabled = True
            continue
        db.add(UserMemory(user_id=user_id, content=text, norm_text=key, kind=kind if kind in KINDS else "fact", source=source))
        saved.append(text)
        await db.flush()
    await _trim(db, user_id)
    await db.commit()
    return saved


async def _trim(db: AsyncSession, user_id: uuid.UUID) -> None:
    """`MAX_MEMORIES`를 넘으면 오래된 것부터 지운다. 사용자가 직접 쓴 것(user)·명시한 것(explicit)은 자동 기억보다 나중에 지운다."""
    count = await db.scalar(select(func.count()).select_from(UserMemory).where(UserMemory.user_id == user_id)) or 0
    extra = count - MAX_MEMORIES
    if extra <= 0:
        return
    rows = (
        await db.scalars(
            select(UserMemory)
            .where(UserMemory.user_id == user_id)
            .order_by((UserMemory.source == "auto").desc(), UserMemory.updated_at.asc(), UserMemory.id.asc())
            .limit(extra)
        )
    ).all()
    if rows:
        await db.execute(delete(UserMemory).where(UserMemory.id.in_([r.id for r in rows])))


# ── 응답 뒤 자동 추출 (백그라운드) ────────────────────────────────────────


async def extract_and_store(user_id: uuid.UUID, message: str, reply: str, history: list[dict]) -> None:
    """대화에서 사실을 뽑아 저장한다. **어떤 실패도 밖으로 던지지 않는다** — 챗봇 응답은 이미 나갔다."""
    try:
        # 사용자가 한 말만 넘긴다. 챗봇 답변에는 저장돼 있던 피부타입·분석 결과가 섞여 있어, 그걸 "사용자가 말한 사실"로
        # 잘못 뽑는 일이 있었다("피부가 울긋불긋해지는 편"). 이 함수는 근거를 사용자 발화로만 제한한다.
        recent = [m for m in history[-6:] if m["role"] == "user"]
        convo = "\n".join(f"사용자: {m['content'][:300]}" for m in recent)
        convo += f"\n사용자: {message[:500]}"
        raw = await llm.chat_completion([{"role": "user", "content": convo}], EXTRACT_SYSTEM, max_tokens=300)
        items = parse_extraction(raw)
        if not items:
            return
        async with AsyncSessionLocal() as db:
            if not await is_enabled(db, user_id):      # 그 사이 철회했을 수 있다
                return
            await add_memories(db, user_id, items, source="auto")
    except llm.LLMUnavailable:
        log.info("memory_extract_skipped_llm_unavailable")
    except Exception as exc:  # noqa: BLE001
        log.warning("memory_extract_failed", error=str(exc)[:200])
