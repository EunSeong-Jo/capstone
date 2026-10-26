"""사진 분석 이미지(항목별 분석 결과 PNG)의 보관.

Perfect Corp이 항목마다 돌려주는 `mask_urls`는 2시간이면 만료되는 서명 URL이고, 받아 보면
**얼굴 사진이 없는 투명 PNG**(표시할 부위에만 색이 있다)다. 지난 분석도 다시 보여 주려고
**분석 직후 서버가 이 PNG를 받아 `skin_analysis_images` 테이블에 저장**한다 — 원본 사진과
합성하지 않으므로 얼굴 사진은 어디에도 남지 않는다(원본은 분석 중 메모리에만 있다).
화면은 이 PNG를 중립 배경 위에 그린다.

 - 위치: DB 테이블. 컨테이너 디스크는 재배포 때 사라져서(Lightsail은 영구 볼륨이 없다) 디스크에 두지 않는다.
 - 공개하지 않는다. 본인만 인증 API로 받는다(`api/skin_photo.py`).
 - 삭제: 분석이 지워지면(계정 삭제 포함) FK CASCADE로 함께 지운다. 동의를 철회해도 이미 만든 결과는 지우지 않는다.
 - 저장은 분석 행과 **같은 트랜잭션**이다. 검증을 통과한 이미지만 넣고, 하나도 없으면 점수만 저장한다.
"""
from __future__ import annotations

import asyncio
import re
import uuid

import httpx
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.skin_photo import SkinAnalysisImage

log = structlog.get_logger()

KEY_RE = re.compile(r"^[a-z0-9_]{1,40}$")
MAX_IMAGE_BYTES = 3 * 1024 * 1024
_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
DOWNLOAD_TIMEOUT_SEC = 15.0


def valid_images(images: dict[str, bytes]) -> dict[str, bytes]:
    """키가 안전한 이름이고 PNG이며 크기가 한도 안인 것만."""
    return {
        k: d for k, d in images.items()
        if KEY_RE.match(k) and d.startswith(_PNG_MAGIC) and len(d) <= MAX_IMAGE_BYTES
    }


def add_images(
    db: AsyncSession, user_id: uuid.UUID, analysis_id: uuid.UUID, images: dict[str, bytes]
) -> None:
    """세션에 올린다(커밋은 호출자). `valid_images`를 통과한 것만 넘긴다. 분석 행이 먼저 add 되어 있어야 한다."""
    db.add_all(
        SkinAnalysisImage(analysis_id=analysis_id, key=k, user_id=user_id, png=d)
        for k, d in images.items()
    )


async def get_image(db: AsyncSession, analysis_id: uuid.UUID, key: str) -> bytes | None:
    if not KEY_RE.match(key):
        return None
    return await db.scalar(
        select(SkinAnalysisImage.png).where(
            SkinAnalysisImage.analysis_id == analysis_id, SkinAnalysisImage.key == key
        )
    )


async def keys_for(db: AsyncSession, analysis_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[str]]:
    """분석별로 실제로 저장된 이미지 키(정렬). 쿼리 한 번."""
    if not analysis_ids:
        return {}
    rows = await db.execute(
        select(SkinAnalysisImage.analysis_id, SkinAnalysisImage.key)
        .where(SkinAnalysisImage.analysis_id.in_(analysis_ids))
        .order_by(SkinAnalysisImage.key)
    )
    out: dict[uuid.UUID, list[str]] = {}
    for aid, key in rows:
        out.setdefault(aid, []).append(key)
    return out


async def download_masks(urls: dict[str, str]) -> dict[str, bytes]:
    """서명 URL에서 PNG를 받는다. **인증 헤더를 보내지 않는다**(업체 API 키가 S3로 새지 않게).

    개별 실패는 그 항목만 건너뛴다.
    """
    safe = {k: u for k, u in urls.items() if KEY_RE.match(k) and u.startswith("https://")}
    if not safe:
        return {}

    async with httpx.AsyncClient(timeout=DOWNLOAD_TIMEOUT_SEC) as client:

        async def one(key: str, url: str) -> tuple[str, bytes | None]:
            try:
                res = await client.get(url)
            except httpx.HTTPError as exc:
                log.warning("skin_mask_download_failed", key=key, error=type(exc).__name__)
                return key, None
            if res.status_code != 200 or len(res.content) > MAX_IMAGE_BYTES:
                log.warning("skin_mask_download_rejected", key=key, status=res.status_code)
                return key, None
            return key, res.content

        done = await asyncio.gather(*(one(k, u) for k, u in safe.items()))
    return {k: data for k, data in done if data}
