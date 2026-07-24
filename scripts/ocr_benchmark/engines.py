"""3개 OCR 엔진에 대한 최소한의 함수형 인터페이스.

모델 로딩(느림, 최초 다운로드 포함)은 build_engines()에서 한 번만 수행하고,
반환되는 각 함수는 (image: np.ndarray) -> OCRResult 형태로 통일한다.
비교 공정성을 위해 3개 엔진 모두 CPU로 강제 실행한다.
"""
import time
from dataclasses import dataclass
from typing import Callable

import numpy as np


@dataclass
class OCRResult:
    engine: str
    text: str
    fragments: list[str]
    latency_sec: float
    error: str | None = None


def run_tesseract(image: np.ndarray, lang: str = "kor+eng") -> OCRResult:
    import pytesseract

    start = time.perf_counter()
    try:
        text = pytesseract.image_to_string(image, lang=lang)
        fragments = [line.strip() for line in text.split("\n") if line.strip()]
        error = None
    except Exception as e:
        text = ""
        fragments = []
        error = str(e)
    latency = time.perf_counter() - start
    return OCRResult(engine="tesseract", text=text, fragments=fragments, latency_sec=latency, error=error)


def run_easyocr(image: np.ndarray, reader) -> OCRResult:
    start = time.perf_counter()
    try:
        fragments = reader.readtext(image, detail=0)
        text = " ".join(fragments)
        error = None
    except Exception as e:
        text = ""
        fragments = []
        error = str(e)
    latency = time.perf_counter() - start
    return OCRResult(engine="easyocr", text=text, fragments=fragments, latency_sec=latency, error=error)


def run_paddleocr(image: np.ndarray, ocr) -> OCRResult:
    start = time.perf_counter()
    try:
        raw = ocr.ocr(image, cls=True)
        fragments = []
        for page in raw or []:
            for line in page or []:
                # line == [box, (text, confidence)]
                fragments.append(line[1][0])
        text = " ".join(fragments)
        error = None
    except Exception as e:
        text = ""
        fragments = []
        error = str(e)
    latency = time.perf_counter() - start
    return OCRResult(engine="paddleocr", text=text, fragments=fragments, latency_sec=latency, error=error)


def build_engines() -> dict[str, Callable[[np.ndarray], OCRResult]]:
    """모델을 1회 로딩(첫 실행 시 다운로드 포함)하고 3개의 균일한 실행 함수를 반환한다."""
    import easyocr
    from paddleocr import PaddleOCR

    easyocr_reader = easyocr.Reader(["ko", "en"], gpu=False)
    paddle_ocr = PaddleOCR(lang="korean", use_angle_cls=True, show_log=False)

    return {
        "tesseract": lambda image: run_tesseract(image),
        "easyocr": lambda image: run_easyocr(image, easyocr_reader),
        "paddleocr": lambda image: run_paddleocr(image, paddle_ocr),
    }
