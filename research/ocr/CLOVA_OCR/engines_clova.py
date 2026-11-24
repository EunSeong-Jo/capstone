"""네이버 CLOVA OCR(General) API를 OCR 엔진처럼 호출하는 최소 함수형 인터페이스.

ocr_benchmark/engines.py의 OCRResult(engine, text, fragments, latency_sec, error)
형태를 그대로 따라, metrics.py의 채점 로직을 수정 없이 재사용할 수 있게 한다.
로컬 이미지 파일을 base64로 인코딩해 보낸다(공개 URL이 없어도 됨).
"""
import base64
import time
import uuid
from dataclasses import dataclass
from pathlib import Path

import requests


@dataclass
class OCRResult:
    engine: str
    text: str
    fragments: list[str]
    latency_sec: float
    error: str | None = None


_FORMATS = {".png": "png", ".jpg": "jpg", ".jpeg": "jpg"}


def _format(path: Path) -> str:
    return _FORMATS.get(path.suffix.lower(), "jpg")


def run_clova_ocr_bytes(
    image_bytes: bytes, fmt: str, secret_key: str, invoke_url: str, lang: str = "ko", name: str = "image"
) -> OCRResult:
    """region-detection이 만든 메모리상 크롭(인코딩된 바이트)을 그대로 넣기 위한 저수준 함수.
    run_clova_ocr()도 파일을 읽어 이 함수를 호출하는 얇은 래퍼다.
    """
    start = time.perf_counter()
    try:
        data = base64.standard_b64encode(image_bytes).decode("utf-8")
        payload = {
            "version": "V2",
            "requestId": str(uuid.uuid4()),
            "timestamp": int(time.time() * 1000),
            "lang": lang,
            "images": [{"format": fmt, "name": name, "data": data}],
        }
        headers = {"Content-Type": "application/json", "X-OCR-SECRET": secret_key}
        response = requests.post(invoke_url, json=payload, headers=headers, timeout=30)
        response.raise_for_status()
        result = response.json()
        fields = result["images"][0].get("fields", [])
        fragments = [f["inferText"] for f in fields]
        text = " ".join(fragments)
        error = None
    except Exception as e:
        text, fragments, error = "", [], str(e)
    latency = time.perf_counter() - start
    return OCRResult(engine="clova", text=text, fragments=fragments, latency_sec=latency, error=error)


def run_clova_ocr(image_path: Path, secret_key: str, invoke_url: str, lang: str = "ko") -> OCRResult:
    return run_clova_ocr_bytes(
        image_path.read_bytes(), _format(image_path), secret_key, invoke_url, lang=lang, name=image_path.stem
    )


def run_clova_ocr_on_image(image, secret_key: str, invoke_url: str, lang: str = "ko") -> OCRResult:
    """np.ndarray(BGR) 크롭 하나를 jpg로 인코딩해 호출한다 - region-detection 크롭용."""
    import cv2

    ok, buf = cv2.imencode(".jpg", image)
    if not ok:
        return OCRResult(engine="clova", text="", fragments=[], latency_sec=0.0, error="cv2.imencode 실패")
    return run_clova_ocr_bytes(buf.tobytes(), "jpg", secret_key, invoke_url, lang=lang)
