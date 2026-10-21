"""사진 분석 이미지(항목별 분석 결과 PNG)의 보관.

Perfect Corp이 항목마다 돌려주는 `mask_urls`는 2시간이면 만료되는 서명 URL이고, 받아 보면
**얼굴 사진이 없는 투명 PNG**(표시할 부위에만 색이 있다)다. 지난 분석도 다시 보여 주려고
**분석 직후 서버가 이 PNG를 받아 그대로 디스크에 저장**한다 — 원본 사진과 합성하지 않으므로
얼굴 사진은 어디에도 남지 않는다(원본은 분석 중 메모리에만 있다). 화면은 이 PNG를 중립 배경 위에
그린다.

 - 위치: `SKIN_IMAGE_DIR/<user_id>/<analysis_id>/<key>.png` (docker 볼륨, 저장소 밖).
   DB에는 경로를 두지 않는다 — `metrics["images"]`는 키 목록일 뿐이고, 실제로 있는 파일은
   디렉터리를 보고 정한다. 그래서 파일이 없는 환경(공용 DB를 다른 PC에서 볼 때)은 점수만 보인다.
 - 공개하지 않는다. 본인만 인증 API로 받는다(`api/skin_photo.py`).
 - 삭제: 동의 철회와 계정 삭제 때 사용자 디렉터리를 통째로 지운다. 보관 기간은 그때까지다.
 - 저장은 **최선 노력**이다. 디렉터리를 쓸 수 없거나 내려받기가 실패해도 분석은 성공한다.
"""
from __future__ import annotations

import asyncio
import re
import shutil
import uuid
from pathlib import Path

import httpx
import structlog

from app.config import settings

log = structlog.get_logger()

KEY_RE = re.compile(r"^[a-z0-9_]{1,40}$")
MAX_IMAGE_BYTES = 3 * 1024 * 1024
_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
DOWNLOAD_TIMEOUT_SEC = 15.0


def _root() -> Path:
    return Path(settings.SKIN_IMAGE_DIR)


def _dir(user_id: uuid.UUID, analysis_id: uuid.UUID) -> Path:
    return _root() / str(user_id) / str(analysis_id)


def image_path(user_id: uuid.UUID, analysis_id: uuid.UUID, key: str) -> Path | None:
    """키가 안전한 이름이고 파일이 있으면 경로, 아니면 None (경로 탈출 방지)."""
    if not KEY_RE.match(key):
        return None
    path = _dir(user_id, analysis_id) / f"{key}.png"
    return path if path.is_file() else None


def available_keys(user_id: uuid.UUID, analysis_id: uuid.UUID) -> list[str]:
    """디스크에 실제로 있는 이미지 키."""
    d = _dir(user_id, analysis_id)
    try:
        return sorted(p.stem for p in d.glob("*.png") if KEY_RE.match(p.stem))
    except OSError:
        return []


def _write(user_id: uuid.UUID, analysis_id: uuid.UUID, images: dict[str, bytes]) -> list[str]:
    d = _dir(user_id, analysis_id)
    saved: list[str] = []
    for key, data in images.items():
        if not KEY_RE.match(key) or not data.startswith(_PNG_MAGIC) or len(data) > MAX_IMAGE_BYTES:
            continue
        d.mkdir(parents=True, exist_ok=True)
        tmp = d / f".{key}.tmp"
        tmp.write_bytes(data)
        tmp.replace(d / f"{key}.png")        # 반쯤 쓰인 파일이 보이지 않게
        saved.append(key)
    return saved


async def save_images(
    user_id: uuid.UUID, analysis_id: uuid.UUID, images: dict[str, bytes]
) -> list[str]:
    """저장에 성공한 키 목록. 디스크 오류는 삼키고 빈 목록을 돌려준다."""
    if not images:
        return []
    try:
        return await asyncio.to_thread(_write, user_id, analysis_id, images)
    except OSError as exc:
        log.warning("skin_image_save_failed", error=str(exc)[:200])
        return []


def delete_analysis_images(user_id: uuid.UUID, analysis_id: uuid.UUID) -> None:
    shutil.rmtree(_dir(user_id, analysis_id), ignore_errors=True)


def delete_user_images(user_id: uuid.UUID) -> None:
    """동의 철회·계정 삭제 때. 없으면 아무 일도 없다."""
    shutil.rmtree(_root() / str(user_id), ignore_errors=True)


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
