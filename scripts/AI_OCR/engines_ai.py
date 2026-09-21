"""Claude / GPT-4o Vision API를 OCR 엔진처럼 호출하는 최소 함수형 인터페이스.

ocr_benchmark/engines.py의 OCRResult(engine, text, fragments, latency_sec, error)
형태를 그대로 따라, metrics.py의 채점 로직을 수정 없이 재사용할 수 있게 한다.
"""
import base64
import time
from dataclasses import dataclass
from pathlib import Path


@dataclass
class OCRResult:
    engine: str
    text: str
    fragments: list[str]
    latency_sec: float
    error: str | None = None


PROMPT = (
    "이 이미지는 화장품 패키지 사진입니다. 사진에 보이는 모든 텍스트를 "
    "보이는 줄 순서 그대로, 한 줄에 하나씩, 설명이나 해석 없이 텍스트만 출력하세요."
)

_MEDIA_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}


def _media_type(path: Path) -> str:
    return _MEDIA_TYPES.get(path.suffix.lower(), "image/png")


def _to_fragments(text: str) -> list[str]:
    return [line.strip() for line in text.split("\n") if line.strip()]


def run_claude_ocr(image_path: Path, client, model: str = "claude-opus-5") -> OCRResult:
    """thinking을 꺼서 지연시간을 최소화한다 - 텍스트 추출은 추론이 필요 없는 작업이고,
    이 스크립트의 목적 자체가 속도 비교이므로 불필요한 thinking 오버헤드를 배제한다.
    """
    start = time.perf_counter()
    try:
        data = base64.standard_b64encode(image_path.read_bytes()).decode("utf-8")
        response = client.messages.create(
            model=model,
            max_tokens=2048,
            thinking={"type": "disabled"},
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {"type": "base64", "media_type": _media_type(image_path), "data": data},
                    },
                    {"type": "text", "text": PROMPT},
                ],
            }],
        )
        if response.stop_reason == "refusal":
            text, error = "", "refusal"
        else:
            text = "".join(block.text for block in response.content if block.type == "text")
            error = None
        fragments = _to_fragments(text)
    except Exception as e:
        text, fragments, error = "", [], str(e)
    latency = time.perf_counter() - start
    return OCRResult(engine="claude", text=text, fragments=fragments, latency_sec=latency, error=error)


def run_openai_ocr(image_path: Path, client, model: str = "gpt-4o") -> OCRResult:
    start = time.perf_counter()
    try:
        data = base64.standard_b64encode(image_path.read_bytes()).decode("utf-8")
        media_type = _media_type(image_path)
        response = client.chat.completions.create(
            model=model,
            max_tokens=2048,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": PROMPT},
                    {"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{data}"}},
                ],
            }],
        )
        text = response.choices[0].message.content or ""
        error = None
        fragments = _to_fragments(text)
    except Exception as e:
        text, fragments, error = "", [], str(e)
    latency = time.perf_counter() - start
    return OCRResult(engine="openai", text=text, fragments=fragments, latency_sec=latency, error=error)
