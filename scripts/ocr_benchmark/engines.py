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


def run_tesseract(image: np.ndarray, lang: str = "kor+eng", psm: int = 11) -> OCRResult:
    """PSM(페이지 분할 모드) 기본값은 11(sparse text, 순서 가정 없음).

    기본 PSM 3(문서 전체 가정)은 화장품 패키지처럼 텍스트가 문서 형태가 아니라
    여기저기 흩어진 블록(브랜드 로고, 성분표, 로트번호 등)으로 존재하는 이미지에서
    완전 실패(빈 결과) 비율이 높았다(38장 중 34%). psm 6(균일한 단일 블록 가정)도
    후보 - 텍스트 영역 검출(--region-detection)로 이미 크롭된 입력이면 6이 더 나을 수 있다.
    """
    import pytesseract

    start = time.perf_counter()
    try:
        text = pytesseract.image_to_string(image, lang=lang, config=f"--psm {psm}")
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


def _extract_paddleocr_fragments(ocr, image: np.ndarray) -> list[str]:
    """PaddleOCR 2.x(`ocr.ocr()`)와 3.x/PP-OCRv5(`ocr.predict()`) 반환 형식을 모두 지원한다.

    2.x: ocr.ocr(image, cls=True) -> [[ [box, (text, score)], ... ]] (페이지 단위 중첩 리스트)
    3.x: ocr.predict(image) -> 이미지당 하나의 결과 객체, rec_texts 속성/키에 인식된 문자열 리스트
    현재 requirements.txt는 2.x(2.9.1)로 고정돼 있음 - 3.x로 올리면 생성자 파라미터도
    바뀌므로(예: use_angle_cls -> use_textline_orientation) build_engines()도 같이 검증 필요.
    """
    if hasattr(ocr, "predict"):
        results = ocr.predict(image)
        fragments = []
        for res in results or []:
            texts = res.get("rec_texts") if isinstance(res, dict) else getattr(res, "rec_texts", None)
            if texts:
                fragments.extend(texts)
        return fragments

    raw = ocr.ocr(image, cls=True)
    fragments = []
    for page in raw or []:
        for line in page or []:
            # line == [box, (text, confidence)]
            fragments.append(line[1][0])
    return fragments


def run_paddleocr(image: np.ndarray, ocr) -> OCRResult:
    start = time.perf_counter()
    try:
        fragments = _extract_paddleocr_fragments(ocr, image)
        text = " ".join(fragments)
        error = None
    except Exception as e:
        text = ""
        fragments = []
        error = str(e)
    latency = time.perf_counter() - start
    return OCRResult(engine="paddleocr", text=text, fragments=fragments, latency_sec=latency, error=error)


def run_tesseract_easyocr_fallback(
    image: np.ndarray,
    easyocr_reader,
    lang: str = "kor+eng",
    psm: int = 11,
    min_chars: int = 1,
) -> OCRResult:
    """Tesseract를 먼저 시도(빠름) → 결과가 사실상 비어 있으면 EasyOCR로 재시도.

    Tesseract의 완전 실패율(38장 중 34%)이 가장 큰 실패 원인이었으므로, 빈 결과일 때만
    더 느리지만 안정적인 EasyOCR로 다시 시도해 속도와 안정성을 함께 노린다. 재시도가
    일어나면 latency_sec은 두 엔진 소요 시간의 합으로 기록한다(실제 운영에서의 비용을
    투명하게 반영).
    """
    tess_result = run_tesseract(image, lang=lang, psm=psm)
    joined = "".join(tess_result.fragments).strip()
    if len(joined) > min_chars:
        return OCRResult(
            engine="tesseract_easyocr_fallback",
            text=tess_result.text,
            fragments=tess_result.fragments,
            latency_sec=tess_result.latency_sec,
            error=tess_result.error,
        )

    easy_result = run_easyocr(image, easyocr_reader)
    return OCRResult(
        engine="tesseract_easyocr_fallback",
        text=easy_result.text,
        fragments=easy_result.fragments,
        latency_sec=tess_result.latency_sec + easy_result.latency_sec,
        error=easy_result.error,
    )


ALL_ENGINE_NAMES = ["tesseract", "easyocr", "paddleocr", "tesseract_easyocr_fallback"]


def build_engines(
    tesseract_psm: int = 11, engines: list[str] | None = None, easyocr_gpu: bool = False
) -> dict[str, Callable[[np.ndarray], OCRResult]]:
    """모델을 1회 로딩(첫 실행 시 다운로드 포함)하고 요청받은 엔진의 실행 함수만 반환한다.

    engines를 좁히면 안 쓰는 모델은 아예 안 만든다(로딩/추론 둘 다 스킵) - 특정 엔진 하나만
    빠르게 재검증하고 싶을 때(예: 후보 결정 후 paddleocr만) 46장 기준 벤치마크 시간을 크게
    줄여준다. easyocr reader는 easyocr/fallback 둘 중 하나라도 요청되면 한 번만 만들어 공유.

    easyocr_gpu=True는 EasyOCR(PyTorch 기반)만 CUDA로 돌린다. Tesseract는 GPU 백엔드가
    존재하지 않아 항상 CPU로 실행되고, PaddleOCR도 이 함수에서는 별도 처리하지 않는다 - 기본은
    False(CPU)로 엔진 간 레이턴시 비교의 공정성을 유지한다(README 참고). GPU 비교 실험을 할
    때만 명시적으로 켠다.
    """
    requested = set(engines) if engines is not None else set(ALL_ENGINE_NAMES)
    unknown = requested - set(ALL_ENGINE_NAMES)
    if unknown:
        raise ValueError(f"알 수 없는 엔진: {sorted(unknown)} (사용 가능: {ALL_ENGINE_NAMES})")

    result: dict[str, Callable[[np.ndarray], OCRResult]] = {}

    easyocr_reader = None
    if requested & {"easyocr", "tesseract_easyocr_fallback"}:
        import easyocr

        easyocr_reader = easyocr.Reader(["ko", "en"], gpu=easyocr_gpu)

    if "tesseract" in requested:
        result["tesseract"] = lambda image: run_tesseract(image, psm=tesseract_psm)
    if "easyocr" in requested:
        result["easyocr"] = lambda image: run_easyocr(image, easyocr_reader)
    if "paddleocr" in requested:
        from paddleocr import PaddleOCR

        # 3.x(PP-OCRv5)로 업그레이드: use_angle_cls -> use_textline_orientation, show_log 제거.
        # enable_mkldnn=False는 필수 - 기본값(True)에서는 oneDNN 백엔드가
        # "ConvertPirAttribute2RuntimeAttribute not support" 오류로 추론 자체가 크래시한다
        # (paddlepaddle 3.3.1 CPU 실행 시 재현 확인). 정확도에는 영향 없음, 속도만 소폭 저하.
        paddle_ocr = PaddleOCR(lang="korean", use_textline_orientation=True, enable_mkldnn=False)
        result["paddleocr"] = lambda image: run_paddleocr(image, paddle_ocr)
    if "tesseract_easyocr_fallback" in requested:
        result["tesseract_easyocr_fallback"] = lambda image: run_tesseract_easyocr_fallback(
            image, easyocr_reader, psm=tesseract_psm
        )

    return result
