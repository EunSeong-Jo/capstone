"""후기 사진 — data URL 해석과 공개 URL.

사진은 `review_photos` 테이블에 바이트로 둔다(파일 서버가 없다). 화면이
올리기 전에 줄여서 보내지만, 서버도 형식과 크기를 다시 본다 — 화면의 약속만
믿으면 수십 MB 원본이 DB에 들어갈 수 있다.
"""
from __future__ import annotations

import base64
import binascii
import re

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.personal import ReviewPhoto

MAX_PHOTO_BYTES = 2 * 1024 * 1024
_DATA_URL = re.compile(r"^data:(image/(?:jpeg|png|webp));base64,(.+)$", re.DOTALL)


def decode_photo(data_url: str) -> tuple[str, bytes]:
    """data URL → (content_type, bytes). 형식이 틀리거나 너무 크면 422."""
    m = _DATA_URL.match(data_url)
    if m is None:
        raise HTTPException(status_code=422, detail="사진은 JPEG·PNG·WEBP만 올릴 수 있어요")
    try:
        data = base64.b64decode(m.group(2), validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=422, detail="사진 데이터를 읽을 수 없어요") from None
    if len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(status_code=422, detail="사진 한 장은 2MB까지 올릴 수 있어요")
    return m.group(1), data


def photo_url(photo_id: int) -> str:
    return f"/api/v1/reviews/photos/{photo_id}"


async def photo_urls_of(db: AsyncSession, review_ids: list[int]) -> dict[int, list[str]]:
    """후기 id → 사진 URL 목록(올린 순서). 바이트는 읽지 않는다."""
    if not review_ids:
        return {}
    rows = await db.execute(
        select(ReviewPhoto.id, ReviewPhoto.review_id)
        .where(ReviewPhoto.review_id.in_(review_ids))
        .order_by(ReviewPhoto.review_id, ReviewPhoto.position)
    )
    out: dict[int, list[str]] = {}
    for pid, rid in rows:
        out.setdefault(rid, []).append(photo_url(pid))
    return out
