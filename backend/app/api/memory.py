"""AI 기억 관리 (퍼스널 AI 3단계).

    GET    /api/v1/me/ai-memory        기억 사용 동의 상태
    PUT    /api/v1/me/ai-memory        동의·철회
    GET    /api/v1/me/memories         기억 목록
    POST   /api/v1/me/memories         직접 추가
    PATCH  /api/v1/me/memories/{id}    문장 수정·끄기/켜기
    DELETE /api/v1/me/memories/{id}    하나 지우기
    DELETE /api/v1/me/memories         전부 지우기

챗봇이 대화에서 알게 된 내용을 사용자가 **보고·고치고·지울 수 있어야** 한다는 원칙의 화면 쪽 통로다.
동의하지 않았으면 챗봇은 기억을 읽지도 쓰지도 않는다(`services/memory.py`). 철회해도 목록은 남으므로 지우려면 따로 지운다.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.personal import UserMemory
from app.models.user import User
from app.schemas.memory import AiMemoryStateIn, AiMemoryStateOut, MemoryIn, MemoryOut, MemoryPatch
from app.services import memory as mem

router = APIRouter(prefix="/api/v1/me", tags=["ai-memory"])


async def _state(db: AsyncSession, user: User) -> AiMemoryStateOut:
    row = await mem.consent_row(db, user.id)
    enabled = row is not None and row.withdrawn_at is None
    count = await db.scalar(select(func.count()).select_from(UserMemory).where(UserMemory.user_id == user.id)) or 0
    return AiMemoryStateOut(
        enabled=enabled,
        version=mem.CONSENT_VERSION,
        agreed_at=row.agreed_at if (row is not None and enabled) else None,
        count=int(count),
        limit=mem.MAX_MEMORIES,
    )


@router.get("/ai-memory", response_model=AiMemoryStateOut, summary="AI 기억 사용 상태")
async def read_state(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> AiMemoryStateOut:
    return await _state(db, user)


@router.put("/ai-memory", response_model=AiMemoryStateOut, summary="AI 기억 동의·철회")
async def set_state(
    body: AiMemoryStateIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> AiMemoryStateOut:
    await mem.set_enabled(db, user.id, body.enabled)
    return await _state(db, user)


@router.get("/memories", response_model=list[MemoryOut], summary="AI가 기억하는 내 정보")
async def list_memories(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> list[UserMemory]:
    return await mem.list_memories(db, user.id)


@router.post("/memories", response_model=MemoryOut, status_code=status.HTTP_201_CREATED, summary="기억 직접 추가")
async def add_memory(body: MemoryIn, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> UserMemory:
    if not await mem.is_enabled(db, user.id):
        raise HTTPException(status_code=409, detail="먼저 AI 기억을 켜 주세요")
    text = mem.clean(body.text)
    if text is None:
        raise HTTPException(status_code=422, detail="저장할 수 없는 내용이에요(너무 짧거나 개인 정보·특수한 표현이 들어 있어요)")
    await mem.add_memories(db, user.id, [("fact", text)], source="user")
    row = await db.scalar(select(UserMemory).where(UserMemory.user_id == user.id, UserMemory.norm_text == mem.norm(text)))
    assert row is not None
    return row


@router.patch("/memories/{memory_id}", response_model=MemoryOut, summary="기억 수정·끄기")
async def patch_memory(
    memory_id: int, body: MemoryPatch, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> UserMemory:
    row = await db.scalar(select(UserMemory).where(UserMemory.id == memory_id, UserMemory.user_id == user.id))
    if row is None:
        raise HTTPException(status_code=404, detail="기억을 찾을 수 없어요")
    if body.text is not None:
        text = mem.clean(body.text)
        if text is None:
            raise HTTPException(status_code=422, detail="저장할 수 없는 내용이에요")
        key = mem.norm(text)
        clash = await db.scalar(
            select(UserMemory.id).where(UserMemory.user_id == user.id, UserMemory.norm_text == key, UserMemory.id != row.id)
        )
        if clash is not None:
            raise HTTPException(status_code=409, detail="이미 같은 내용이 있어요")
        row.content, row.norm_text, row.source = text, key, "user"
    if body.enabled is not None:
        row.enabled = body.enabled
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/memories/{memory_id}", status_code=204, response_class=Response, summary="기억 하나 지우기")
async def delete_memory(memory_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> Response:
    res = await db.execute(delete(UserMemory).where(UserMemory.id == memory_id, UserMemory.user_id == user.id))
    await db.commit()
    if res.rowcount == 0:
        raise HTTPException(status_code=404, detail="기억을 찾을 수 없어요")
    return Response(status_code=204)


@router.delete("/memories", status_code=204, response_class=Response, summary="기억 전부 지우기")
async def delete_all(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> Response:
    await db.execute(delete(UserMemory).where(UserMemory.user_id == user.id))
    await db.commit()
    return Response(status_code=204)
