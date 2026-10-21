"""얼굴이 아닌 사진을 Perfect Corp에 보내기 전에 거른다.

왜 서버에서 한 번 더 보는가
---------------------------
화면(MediaPipe)도 얼굴을 확인하지만 화면의 약속만 믿을 수 없다 — 직접 API를
부르면 문서·풍경 같은 사진이 그대로 해외 업체로 전송된다. 여기서 거르면
(1) 얼굴이 아닌 사진이 외부로 나가지 않고, (2) 쓸데없는 외부 호출·대기가 없고,
(3) 사용자에게 바로 이유를 알려 줄 수 있다. 실패는 **한도를 쓰지 않는다.**

검출기는 OpenCV `FaceDetectorYN` + YuNet(OpenCV Zoo `face_detection_yunet_2023mar`,
MIT 라이선스, 약 230KB)이다. YOLO(ultralytics)는 AGPL-3.0이고 PyTorch를 끌고 와서
이미지가 크게 늘기 때문에 쓰지 않는다.

판정 규칙(`evaluate_faces`)은 검출기와 분리해 두었다. 임계값은 `config.py`에 있고,
거절 사유는 로그로 남겨 튜닝 근거로 쓴다(사진 자체는 남기지 않는다).
애매하면 통과시킨다 — 얼굴 크기·조명처럼 Perfect Corp이 직접 판정하는 오류는
유닛을 쓰지 않으므로, 여기서는 "확실히 아닌 것"을 중심으로 막는다.

사진은 이 모듈을 지나는 동안 메모리에만 있다. `prepare_photo`가 EXIF(GPS 포함)를
제거한 JPEG를 새로 만들어 돌려주고, 이후 외부로 나가는 것은 그 바이트뿐이다.
"""
from __future__ import annotations

import asyncio
import hashlib
import io
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import structlog
from fastapi import HTTPException
from PIL import Image, ImageOps

from app.config import settings

log = structlog.get_logger()

MODEL_PATH = (
    Path(__file__).resolve().parent.parent
    / "assets" / "models" / "face_detection_yunet_2023mar.onnx"
)
# 모델 파일이 바뀌거나 깨졌을 때 조용히 엉뚱한 검출을 하지 않도록 확인한다.
MODEL_SHA256 = "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4"

# 검출은 긴 변을 이 값으로 줄여서 한다(속도). 규칙은 비율만 보므로 영향이 없다.
DETECT_MAX_SIDE = 640
# 디코드 전에 화소 수를 막는다 — 작은 파일이 거대한 이미지로 풀리는 것을 방지.
MAX_PIXELS = 50_000_000
# 전송용으로 줄이는 긴 변. Perfect Corp도 2560을 넘으면 스스로 줄인다.
SEND_MAX_SIDE = 2560
# 얼굴 폭이 이 비율 미만인 두 번째 얼굴(배경의 사람)은 무시한다.
SECOND_FACE_RATIO = 0.5
# 얼굴 상자가 사진 밖으로 나가도 이 비율까지는 봐준다(검출기 상자는 약간 흔들린다).
OUT_OF_FRAME_TOLERANCE = 0.05


@dataclass(frozen=True)
class Face:
    """검출된 얼굴. 좌표는 이미지 크기에 대한 비율(0~1)이다."""

    x: float
    y: float
    w: float
    h: float
    score: float


@dataclass(frozen=True)
class GateResult:
    ok: bool
    code: str | None = None
    message: str | None = None


@dataclass(frozen=True)
class PreparedPhoto:
    """전송용으로 정리된 사진. EXIF가 없는 JPEG 바이트."""

    jpeg: bytes
    width: int
    height: int


_MESSAGES = {
    "no_face": "얼굴이 보이지 않아요. 얼굴이 정면으로 나오게 다시 찍어 주세요.",
    "multiple_faces": "얼굴이 여러 개 보여요. 한 명만 나오게 찍어 주세요.",
    "face_too_small": "얼굴이 너무 작아요. 화면에 얼굴이 가득 차게 가까이에서 찍어 주세요.",
    "face_out_of_frame": "얼굴이 화면 밖으로 나갔어요. 얼굴 전체가 보이게 찍어 주세요.",
    "too_dark": "너무 어두워요. 밝은 곳에서 다시 찍어 주세요.",
    "image_too_small": "사진 해상도가 너무 낮아요. 더 선명한 사진으로 다시 시도해 주세요.",
    "bad_image": "사진을 읽을 수 없어요. JPEG나 PNG 사진인지 확인해 주세요.",
}


def message_for(code: str) -> str:
    return _MESSAGES[code]


def evaluate_faces(
    faces: list[Face],
    luminance: float | None,
    *,
    min_score: float | None = None,
    min_width_ratio: float | None = None,
    min_luminance: float | None = None,
) -> GateResult:
    """검출 결과 → 통과 여부. 검출기 없이 테스트할 수 있는 순수 함수다.

    `luminance`는 가장 큰 얼굴 상자 안의 평균 밝기(0~255)이고, 모르면 None이다.
    """
    min_score = settings.FACE_MIN_SCORE if min_score is None else min_score
    min_width_ratio = (
        settings.FACE_MIN_WIDTH_RATIO if min_width_ratio is None else min_width_ratio
    )
    min_luminance = settings.FACE_MIN_LUMINANCE if min_luminance is None else min_luminance

    confident = sorted((f for f in faces if f.score >= min_score), key=lambda f: -f.w)
    if not confident:
        return GateResult(False, "no_face", _MESSAGES["no_face"])

    main = confident[0]
    if len(confident) > 1 and confident[1].w >= main.w * SECOND_FACE_RATIO:
        return GateResult(False, "multiple_faces", _MESSAGES["multiple_faces"])

    tol = OUT_OF_FRAME_TOLERANCE
    if (
        main.x < -tol
        or main.y < -tol
        or main.x + main.w > 1 + tol
        or main.y + main.h > 1 + tol
    ):
        return GateResult(False, "face_out_of_frame", _MESSAGES["face_out_of_frame"])

    if main.w < min_width_ratio:
        return GateResult(False, "face_too_small", _MESSAGES["face_too_small"])

    if luminance is not None and luminance < min_luminance:
        return GateResult(False, "too_dark", _MESSAGES["too_dark"])

    return GateResult(True)


# ── 사진 정리 (회전 적용 · EXIF 제거) ─────────────────────────────────
def prepare_photo(data: bytes, min_short_side: int) -> PreparedPhoto:
    """바이트 → EXIF 없는 JPEG. 읽을 수 없거나 너무 작으면 422.

    EXIF의 회전 정보는 **픽셀에 먼저 적용**한다. 그냥 지우면 세로로 찍은 사진이
    눕고, 얼굴 인식이 실패한다. GPS 같은 나머지 메타데이터는 새로 저장하면서
    사라진다(`save`에 exif를 넘기지 않는다).
    """
    try:
        img = Image.open(io.BytesIO(data))
        if img.width * img.height > MAX_PIXELS:
            raise HTTPException(status_code=422, detail=_MESSAGES["bad_image"])
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGB")
    except HTTPException:
        raise
    except Exception:  # noqa: BLE001 — Pillow는 깨진 파일마다 다른 예외를 낸다
        raise HTTPException(status_code=422, detail=_MESSAGES["bad_image"]) from None

    if min(img.size) < min_short_side:
        log.info("face_gate_reject", code="image_too_small", size=img.size)
        raise HTTPException(status_code=422, detail=_MESSAGES["image_too_small"])

    if max(img.size) > SEND_MAX_SIDE:
        scale = SEND_MAX_SIDE / max(img.size)
        img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)

    out = io.BytesIO()
    img.save(out, format="JPEG", quality=90)  # exif·icc를 넘기지 않아 메타데이터가 빠진다
    return PreparedPhoto(jpeg=out.getvalue(), width=img.width, height=img.height)


# ── 검출기 ───────────────────────────────────────────────────────────
_detector = None


def _load_detector():
    """프로세스당 한 번만 모델을 읽는다."""
    global _detector
    if _detector is None:
        import cv2  # 무거운 import라 필요할 때만

        raw = MODEL_PATH.read_bytes()
        if hashlib.sha256(raw).hexdigest() != MODEL_SHA256:
            raise RuntimeError("YuNet 모델 파일이 예상과 다릅니다 (face_gate.MODEL_SHA256)")
        _detector = cv2.FaceDetectorYN.create(str(MODEL_PATH), "", (320, 320), 0.6, 0.3, 5000)
    return _detector


def detect_faces(photo: PreparedPhoto) -> tuple[list[Face], float | None]:
    """(얼굴 목록, 가장 큰 얼굴 안의 평균 밝기). 동기 함수 — 스레드에서 부른다."""
    import cv2

    arr = cv2.imdecode(np.frombuffer(photo.jpeg, np.uint8), cv2.IMREAD_COLOR)
    h, w = arr.shape[:2]
    scale = min(1.0, DETECT_MAX_SIDE / max(h, w))
    small = cv2.resize(arr, (round(w * scale), round(h * scale))) if scale < 1.0 else arr
    sh, sw = small.shape[:2]

    det = _load_detector()
    det.setInputSize((sw, sh))
    _, rows = det.detect(small)
    if rows is None:
        return [], None

    faces = [
        Face(
            x=float(r[0]) / sw, y=float(r[1]) / sh,
            w=float(r[2]) / sw, h=float(r[3]) / sh, score=float(r[14]),
        )
        for r in rows
    ]
    main = max(faces, key=lambda f: f.w)
    x0 = max(0, int(main.x * sw))
    y0 = max(0, int(main.y * sh))
    x1 = min(sw, int((main.x + main.w) * sw))
    y1 = min(sh, int((main.y + main.h) * sh))
    luminance = None
    if x1 > x0 and y1 > y0:
        gray = cv2.cvtColor(small[y0:y1, x0:x1], cv2.COLOR_BGR2GRAY)
        luminance = float(gray.mean())
    return faces, luminance


async def check_face(photo: PreparedPhoto) -> None:
    """얼굴이 아니거나 쓸 수 없는 사진이면 422. 통과하면 아무 일도 없다."""
    faces, luminance = await asyncio.to_thread(detect_faces, photo)
    result = evaluate_faces(faces, luminance)
    if not result.ok:
        log.info(
            "face_gate_reject",
            code=result.code,
            faces=len(faces),
            top_w=round(max((f.w for f in faces), default=0), 3),
            luminance=None if luminance is None else round(luminance),
        )
        raise HTTPException(status_code=422, detail=result.message)
