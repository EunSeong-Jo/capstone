"""얼굴 가림 검사 — 손·마스크·머리카락이 얼굴을 가렸는지 (MediaPipe `selfie_multiclass_256x256`).

왜 필요한가
-----------
얼굴 검출기(YuNet)는 눈·코만 보여도 얼굴로 잡고 가려진 입·턱 위치까지 추정해 돌려주므로, 손이나
마스크로 하관을 가려도 통과한다. 이 모델은 사진의 픽셀을 배경·머리카락·몸 피부·얼굴 피부·옷·기타로
나눈다 — 손은 **몸 피부**로, 마스크는 옷·기타로 분류된다. 그래서 얼굴 영역을 볼·코와 입·턱으로 나눠
각 영역의 **얼굴 피부 비율**을 보면 어디가 가려졌는지 알 수 있다.

기준값은 업체(Perfect Corp)가 정상 처리한 시험 사진(볼 95·96%·코와 입 100%·턱 76~79%)과 같은 사진에
흰 마스크·피부색 손 모양을 그려 본 결과(코와 입 25~49%·턱 6~48%)로 잡았다(`config.py`의 `FACE_SKIN_MIN_*`:
볼 70%·코와 입 80%·턱 60%). 일부만 가린 경우까지 잡도록 올렸고, 턱은 목과 맞닿아 정상 사진도 80%를 넘기 어려워 60%까지만 올렸다.
이마는 보지 않는다 — 시험 사진도 앞머리가 이마를 덮고 있는데 업체가 받아 줬다. 실제 손·마스크 사진으로
조정이 필요하다.

모델(약 16MB, Apache-2.0)은 저장소에 커밋하지 않는다(`.gitignore`). 이미지를 빌드할 때
(`python -m app.services.occlusion`)나 처음 쓸 때 내려받고 SHA256을 확인한다. 받지 못하거나 라이브러리를
읽지 못하면 **이 검사만 건너뛴다**(None) — 분석 전체를 막지 않는다. 추론은 `ai-edge-litert`(TFLite 런타임)로
하고, 인터프리터는 스레드에 안전하지 않아 잠금을 건다.
"""
from __future__ import annotations

import hashlib
import io
import threading
import time
from dataclasses import dataclass
from pathlib import Path

import httpx
import numpy as np
import structlog
from PIL import Image

from app.config import settings

log = structlog.get_logger()

MODEL_PATH = (
    Path(__file__).resolve().parent.parent / "assets" / "models" / "selfie_multiclass_256x256.tflite"
)
MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/image_segmenter/"
    "selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite"
)
# 모델이 바뀌거나 내려받다 깨졌을 때 조용히 엉뚱한 판정을 하지 않도록 확인한다.
MODEL_SHA256 = "c6748b1253a99067ef71f7e26ca71096cd449baefa8f101900ea23016507e0e0"

INPUT_SIDE = 256
# 클래스 번호: 0 배경, 1 머리카락, 2 몸 피부(손), 3 얼굴 피부, 4 옷, 5 기타(안경·모자 등)
FACE_SKIN = 3
# 모델을 못 읽었을 때 다시 시도하기까지 기다리는 시간(초) — 요청마다 내려받기를 반복하지 않는다.
RETRY_AFTER_SEC = 300


@dataclass(frozen=True)
class Occlusion:
    ok: bool
    # 기준에 가장 못 미친 영역: cheek / nose_mouth / chin. ok면 None
    region: str | None
    # 영역별 얼굴 피부 비율(0~1). 기준 조정·로그용
    ratios: dict[str, float]


# 얼굴 상자(검출기, 이미지 대비 비율)에 대한 영역 — (키, 영역, [x0, y0, x1, y1] 상자 폭·높이의 비율)
_REGIONS: list[tuple[str, str, tuple[float, float, float, float]]] = [
    ("cheek_a", "cheek", (0.05, 0.45, 0.30, 0.75)),
    ("cheek_b", "cheek", (0.70, 0.45, 0.95, 0.75)),
    ("nose_mouth", "nose_mouth", (0.30, 0.40, 0.70, 0.80)),
    # 턱은 목과 맞닿아 몸 피부로 섞이고 수염은 머리카락으로 나뉘어, 시험 사진도 77%라 낮게 둔다
    ("chin", "chin", (0.30, 0.80, 0.70, 1.00)),
]


def _minimum(region: str) -> float:
    return {
        "cheek": settings.FACE_SKIN_MIN_CHEEK,
        "nose_mouth": settings.FACE_SKIN_MIN_NOSE_MOUTH,
        "chin": settings.FACE_SKIN_MIN_CHIN,
    }[region]


# ── 모델 파일 ────────────────────────────────────────────────────────
def _file_ok() -> bool:
    try:
        return hashlib.sha256(MODEL_PATH.read_bytes()).hexdigest() == MODEL_SHA256
    except OSError:
        return False


def ensure_model() -> bool:
    """모델 파일이 있으면 True, 없으면 내려받는다. 실패하면 False(예외를 내지 않는다)."""
    if _file_ok():
        return True
    try:
        MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
        data = httpx.get(MODEL_URL, timeout=120.0, follow_redirects=True).content
        if hashlib.sha256(data).hexdigest() != MODEL_SHA256:
            log.warning("occlusion_model_hash_mismatch")
            return False
        tmp = MODEL_PATH.with_suffix(".tmp")
        tmp.write_bytes(data)
        tmp.replace(MODEL_PATH)
        log.info("occlusion_model_downloaded", bytes=len(data))
        return True
    except Exception as exc:  # noqa: BLE001 — 네트워크·디스크 어떤 오류든 이 검사만 꺼진다
        log.warning("occlusion_model_unavailable", error=type(exc).__name__)
        return False


# ── 추론기 ───────────────────────────────────────────────────────────
_lock = threading.Lock()
_interpreter = None
_retry_at = 0.0


def _load():
    """프로세스당 한 번만 모델을 읽는다. 쓸 수 없으면 None. 잠금을 쥔 채 부른다."""
    global _interpreter, _retry_at
    if _interpreter is not None:
        return _interpreter
    if time.monotonic() < _retry_at:
        return None
    try:
        if not ensure_model():
            raise RuntimeError("model unavailable")
        from ai_edge_litert.interpreter import Interpreter  # 무거운 import라 필요할 때만

        it = Interpreter(model_path=str(MODEL_PATH))
        it.allocate_tensors()
        _interpreter = it
    except Exception as exc:  # noqa: BLE001
        log.warning("occlusion_disabled", error=type(exc).__name__)
        _retry_at = time.monotonic() + RETRY_AFTER_SEC
        return None
    return _interpreter


def check_occlusion(jpeg: bytes, x: float, y: float, w: float, h: float) -> Occlusion | None:
    """가림 검사. `(x, y, w, h)`는 얼굴 상자(이미지 대비 0~1). 모델을 쓸 수 없으면 None."""
    with _lock:
        it = _load()
        if it is None:
            return None
        img = Image.open(io.BytesIO(jpeg)).convert("RGB").resize((INPUT_SIDE, INPUT_SIDE), Image.BILINEAR)
        arr = (np.asarray(img, dtype=np.float32) / 255.0)[None]
        it.set_tensor(it.get_input_details()[0]["index"], arr)
        it.invoke()
        classes = it.get_tensor(it.get_output_details()[0]["index"])[0].argmax(-1)

    ratios: dict[str, float] = {}
    worst: tuple[str, float] | None = None
    n = INPUT_SIDE
    for key, region, (a, b, c, d) in _REGIONS:
        x0, x1 = int((x + a * w) * n), int((x + c * w) * n)
        y0, y1 = int((y + b * h) * n), int((y + d * h) * n)
        x0, y0 = max(0, x0), max(0, y0)
        x1, y1 = min(n, max(x1, x0 + 1)), min(n, max(y1, y0 + 1))
        patch = classes[y0:y1, x0:x1]
        if patch.size == 0:
            return None          # 영역이 이미지 밖이다 — 판단하지 않는다
        ratio = float((patch == FACE_SKIN).mean())
        ratios[key] = round(ratio, 2)
        gap = _minimum(region) - ratio
        if gap > 0 and (worst is None or gap > worst[1]):
            worst = (region, gap)
    return Occlusion(ok=worst is None, region=worst[0] if worst else None, ratios=ratios)


if __name__ == "__main__":  # 이미지를 빌드할 때: python -m app.services.occlusion
    raise SystemExit(0 if ensure_model() else 1)
