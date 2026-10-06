"""사진 → 글자 (네이버 CLOVA OCR General).

측정(`scripts/IMAGE_MATCH_SUMMARY.md` ③): 제품 **앞면** 실사진 22장 전부 인식 성공,
장당 1.2~3.2초. 인식한 필드를 전부 이어 붙인 **통짜 텍스트**로 제품명을 대조하는
쪽이 가장 좋았다 — 브랜드가 질의에 들어가야 오답이 1위로 오르지 않는다.

호출 방식은 `scripts/CLOVA_OCR/engines_clova.py`의 `run_clova_ocr_bytes`와 같다.
요청 경로라 비동기(httpx)로 다시 쓴다.
"""
from __future__ import annotations

import base64
import time
import uuid

import httpx
import structlog
from fastapi import HTTPException

from app.config import settings

log = structlog.get_logger()

# CLOVA가 받는 형식. 화면은 JPEG로 보낸다.
_FORMATS = {"image/jpeg": "jpg", "image/png": "png"}
TIMEOUT_SEC = 15.0


async def recognize_text(image: bytes, content_type: str) -> list[str]:
    """인식한 글자 조각(필드) 목록. 글자가 없으면 빈 목록.

    키가 없으면 503, CLOVA 호출이 실패하면 502 — 날씨 API와 같은 규칙이다.
    """
    if not settings.CLOVA_OCR_SECRET or not settings.CLOVA_OCR_INVOKE_URL:
        raise HTTPException(
            status_code=503,
            detail="사진 인식 키가 설정되지 않았습니다 (CLOVA_OCR_SECRET, CLOVA_OCR_INVOKE_URL).",
        )
    fmt = _FORMATS.get(content_type)
    if fmt is None:
        raise HTTPException(status_code=422, detail="사진은 JPEG·PNG만 인식할 수 있어요")

    payload = {
        "version": "V2",
        "requestId": str(uuid.uuid4()),
        "timestamp": int(time.time() * 1000),
        "lang": "ko",
        "images": [
            {"format": fmt, "name": "scan", "data": base64.standard_b64encode(image).decode()}
        ],
    }
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SEC) as client:
            resp = await client.post(
                settings.CLOVA_OCR_INVOKE_URL,
                json=payload,
                headers={"X-OCR-SECRET": settings.CLOVA_OCR_SECRET},
            )
    except httpx.HTTPError as exc:
        log.warning("clova_ocr_unreachable", error=str(exc)[:200])
        raise HTTPException(status_code=502, detail="사진을 인식하지 못했어요.") from exc
    if resp.status_code != 200:
        log.warning("clova_ocr_failed", status=resp.status_code, body=resp.text[:200])
        raise HTTPException(status_code=502, detail="사진을 인식하지 못했어요.")

    image_result = (resp.json().get("images") or [{}])[0]
    fields = [f.get("inferText", "") for f in image_result.get("fields", [])]
    log.info(
        "clova_ocr",
        result=image_result.get("inferResult"),
        fields=len(fields),
        ms=round((time.perf_counter() - started) * 1000),
    )
    return [f for f in fields if f]
