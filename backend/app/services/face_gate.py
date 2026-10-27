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

이 검사는 **분석 업체의 촬영 요구(얼굴 폭 60% 이상·정면·밝고 고른 조명·초점·잘림 없음)를 업체에
보내기 전에 먼저 확인**한다 — 부적합한 사진은 외부로 나가지 않고, 이유를 바로 알려 주며, 한도도
쓰지 않는다.

판정 규칙(`evaluate_faces`)은 검출기와 분리해 두었다. 임계값은 `config.py`에 있고,
거절 사유는 로그로 남겨 튜닝 근거로 쓴다(사진 자체는 남기지 않는다).
애매하면 통과시킨다 — 업체가 직접 판정하는 오류는 유닛을 쓰지 않으므로, 눈 위치처럼 근거가 없거나
어림이 불안정한 항목(위·아래 고개 숙임, 표정)은 보지 않는다.

사진은 이 모듈을 지나는 동안 메모리에만 있다. `prepare_photo`가 EXIF(GPS 포함)를
제거한 JPEG를 새로 만들어 돌려주고, 이후 외부로 나가는 것은 그 바이트뿐이다.
"""
from __future__ import annotations

import asyncio
import hashlib
import io
import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import structlog
from fastapi import HTTPException
from PIL import Image, ImageOps

from app.config import settings
from app.services.occlusion import Occlusion, check_occlusion

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
    # YuNet 특징점(0~1 비율): 오른쪽 눈 x·y, 왼쪽 눈, 코끝, 오른쪽 입꼬리, 왼쪽 입꼬리. 없으면 None.
    landmarks: tuple[float, ...] | None = None
    # 사진의 가로÷세로. 특징점 거리를 픽셀 비율로 되돌릴 때 쓴다.
    aspect: float = 1.0


@dataclass(frozen=True)
class PhotoStats:
    """가장 큰 얼굴 상자 안의 조명·선명도."""

    luminance: float  # 평균 밝기(0~255)
    imbalance: float  # 좌우 밝기 차 ÷ 평균
    sharpness: float  # 라플라시안 분산(128×128)


@dataclass(frozen=True)
class CheckItem:
    """체크리스트 한 칸. `ok`가 None이면 판단하지 못했다(앞 단계가 막혔거나 근거가 없다)."""

    key: str
    label: str
    ok: bool | None
    message: str | None = None   # ok가 False일 때 사용자에게 보일 한 문장


@dataclass(frozen=True)
class GateResult:
    ok: bool
    code: str | None = None
    message: str | None = None
    # 항목별 결과(얼굴 인식·한 명·얼굴 전체·크기·정면·조명·초점). 어디가 걸렸는지 한꺼번에 보여 줄 때 쓴다.
    items: list[CheckItem] | None = None
    # 판정에 쓴 측정값(얼굴 폭 어림·기울기·코 치우침·밝기·좌우 차·선명도). 왜 걸렸는지 확인하는 용도다.
    metrics: dict[str, float] | None = None


@dataclass(frozen=True)
class PreparedPhoto:
    """전송용으로 정리된 사진. EXIF가 없는 JPEG 바이트."""

    jpeg: bytes
    width: int
    height: int


# 사용자에게 보이는 문구. **한 문장**이다 — 화면이 뒤에 "분석 횟수는 차감되지 않았어요."를 붙이므로
# 이유를 따로 말하지 않고 무엇을 고쳐 찍을지만 알려 준다.
_MESSAGES = {
    "no_face": "얼굴이 정면으로 나오게 다시 찍어 주세요.",
    "multiple_faces": "한 명만 나오게 다시 찍어 주세요.",
    "face_too_small": "얼굴 폭이 사진의 60% 이상이 되게 가까이에서 다시 찍어 주세요.",
    "face_out_of_frame": "얼굴 전체가 보이게 다시 찍어 주세요.",
    "face_tilted": "고개를 똑바로 세우고 다시 찍어 주세요.",
    "face_turned": "카메라를 정면으로 보고 다시 찍어 주세요.",
    "occluded_cheek": "볼이 가려졌어요. 손·머리카락·마스크를 치우고 다시 찍어 주세요.",
    "occluded_nose_mouth": "코와 입이 가려졌어요. 손이나 마스크를 치우고 다시 찍어 주세요.",
    "occluded_chin": "턱이 가려졌어요. 손이나 마스크를 치우고 다시 찍어 주세요.",
    "too_dark": "밝은 곳에서 다시 찍어 주세요.",
    "too_bright": "빛이 얼굴에 직접 닿지 않는 곳에서 다시 찍어 주세요.",
    "uneven_light": "빛이 고르게 닿는 곳에서 다시 찍어 주세요.",
    "blurry": "초점을 맞추고 흔들리지 않게 다시 찍어 주세요.",
    "image_too_small": "사진 해상도가 낮아요. 더 선명한 사진으로 다시 시도해 주세요.",
    "bad_image": "사진을 읽을 수 없어요. JPEG나 PNG 사진인지 확인해 주세요.",
}


def message_for(code: str) -> str:
    return _MESSAGES[code]


# 체크리스트 항목(순서가 곧 안내 우선순위다)
_ITEM_LABELS = [
    ("face", "얼굴 인식"),
    ("single", "한 명만"),
    ("frame", "얼굴 전체"),
    ("size", "얼굴 크기"),
    ("pose", "정면"),
    ("clear", "가림 없음"),
    ("light", "조명"),
    ("sharp", "초점"),
]

# 귀~귀 얼굴 폭에 대한 두 눈 사이 거리의 비율(눈 사이 약 63mm·얼굴 폭 약 140mm).
IPD_PER_FACE_WIDTH = 0.45
# 특징점이 사진 가장자리에서 이 비율 안쪽에 있어야 한다 — 얼굴이 잘리면 검출 상자는 안쪽으로 잘려 나와
# 상자만으로는 모르지만, 눈·코·입 점은 가장자리에 붙는다.
LANDMARK_MARGIN = 0.01


def _face_geometry(face: Face) -> tuple[float, float, float] | None:
    """(얼굴 폭 어림 비율, 기울기 도, 코 치우침) — 눈 위치가 없으면 None."""
    lm = face.landmarks
    if lm is None or len(lm) < 6:
        return None
    rx, ry, lx, ly, nx, _ = lm[:6]
    dx = lx - rx                       # 사진 폭에 대한 비율
    dy = (ly - ry) / face.aspect       # 세로 차이도 사진 폭에 대한 비율로
    ipd = math.hypot(dx, dy)
    if ipd <= 0:
        return None
    roll = abs(math.degrees(math.atan2(dy, abs(dx))))
    yaw = abs((nx - (rx + lx) / 2) / ipd)
    return ipd / IPD_PER_FACE_WIDTH, roll, yaw


def evaluate_faces(
    faces: list[Face],
    luminance: float | None,
    *,
    min_score: float | None = None,
    min_width_ratio: float | None = None,
    min_luminance: float | None = None,
    stats: PhotoStats | None = None,
    occlusion: Occlusion | None = None,
) -> GateResult:
    """검출 결과 → 통과 여부. 검출기 없이 테스트할 수 있는 순수 함수다.

    `luminance`는 가장 큰 얼굴 상자 안의 평균 밝기(0~255)이고, 모르면 None이다. `stats`가 있으면
    좌우 밝기 차·선명도도 보고, `occlusion`이 있으면 가림도 본다.
    순서: 얼굴 → 한 명 → 잘림 → 크기 → 정면 → 가림 → 조명 → 초점.
    """
    min_score = settings.FACE_MIN_SCORE if min_score is None else min_score
    min_width_ratio = (
        settings.FACE_MIN_WIDTH_RATIO if min_width_ratio is None else min_width_ratio
    )
    min_luminance = settings.FACE_MIN_LUMINANCE if min_luminance is None else min_luminance

    confident = sorted((f for f in faces if f.score >= min_score), key=lambda f: -f.w)
    if not confident:
        items = [CheckItem("face", "얼굴 인식", False, _MESSAGES["no_face"])]
        items += [CheckItem(k, label, None) for k, label in _ITEM_LABELS[1:]]
        return GateResult(False, "no_face", _MESSAGES["no_face"], items)

    main = confident[0]
    geometry = _face_geometry(main)

    # 측정값을 먼저 모두 모은다 — 어느 기준에 걸리든 결과에 같이 실어 보낸다.
    metrics: dict[str, float] = {"box_width": round(main.w, 3)}
    if geometry is not None:
        metrics.update(
            face_width=round(geometry[0], 3), roll_deg=round(geometry[1], 1), yaw_offset=round(geometry[2], 3)
        )
    if occlusion is not None:
        metrics.update({f"skin_{k}": v for k, v in occlusion.ratios.items()})
    if luminance is not None:
        metrics["luminance"] = round(luminance, 1)
    if stats is not None:
        metrics.update(light_imbalance=round(stats.imbalance, 3), sharpness=round(stats.sharpness, 1))

    # 항목마다 (통과 여부, 걸렸을 때의 코드)를 낸다. 앞 항목이 걸려도 뒤 항목을 계속 본다 —
    # 한 번에 어디가 문제인지 알려 주기 위해서다. 순서가 곧 안내 우선순위다.
    results: list[tuple[str, bool | None, str | None]] = []

    multiple = len(confident) > 1 and confident[1].w >= main.w * SECOND_FACE_RATIO
    results.append(("single", not multiple, "multiple_faces"))

    tol = OUT_OF_FRAME_TOLERANCE
    cut = main.landmarks is not None and any(
        v < LANDMARK_MARGIN or v > 1 - LANDMARK_MARGIN for v in main.landmarks
    )
    out = (
        cut
        or main.x < -tol
        or main.y < -tol
        or main.x + main.w > 1 + tol
        or main.y + main.h > 1 + tol
    )
    results.append(("frame", not out, "face_out_of_frame"))

    if geometry is None:
        # 눈 위치가 없으면 상자 폭으로만 본다(어림이 틀릴 수 있어 기준이 더 느슨하다).
        results.append(("size", main.w >= settings.FACE_MIN_BOX_RATIO, "face_too_small"))
        results.append(("pose", None, None))
    else:
        width, roll, yaw = geometry
        results.append(("size", width >= min_width_ratio, "face_too_small"))
        if roll > settings.FACE_MAX_ROLL_DEG:
            results.append(("pose", False, "face_tilted"))
        elif yaw > settings.FACE_MAX_YAW_OFFSET:
            results.append(("pose", False, "face_turned"))
        else:
            results.append(("pose", True, None))

    if occlusion is None:
        results.append(("clear", None, None))      # 모델을 쓸 수 없으면 판단하지 않는다
    elif occlusion.ok:
        results.append(("clear", True, None))
    else:
        results.append(("clear", False, f"occluded_{occlusion.region}"))

    if luminance is None and stats is None:
        results.append(("light", None, None))
    elif luminance is not None and luminance < min_luminance:
        results.append(("light", False, "too_dark"))
    elif stats is not None and stats.luminance > settings.FACE_MAX_LUMINANCE:
        results.append(("light", False, "too_bright"))
    elif stats is not None and stats.imbalance > settings.FACE_MAX_LIGHT_IMBALANCE:
        results.append(("light", False, "uneven_light"))
    else:
        results.append(("light", True, None))

    results.append(
        ("sharp", None if stats is None else stats.sharpness >= settings.FACE_MIN_SHARPNESS, "blurry")
    )

    labels = dict(_ITEM_LABELS)
    items = [CheckItem("face", labels["face"], True)]
    first: str | None = None
    for key, ok, code in results:
        items.append(
            CheckItem(key, labels[key], ok, _MESSAGES[code] if ok is False and code else None)
        )
        if ok is False and first is None:
            first = code

    if first:
        return GateResult(False, first, _MESSAGES[first], items, metrics)
    return GateResult(True, items=items, metrics=metrics)


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


def detect_faces(photo: PreparedPhoto) -> tuple[list[Face], PhotoStats | None]:
    """(얼굴 목록, 가장 큰 얼굴 안의 조명·선명도). 동기 함수 — 스레드에서 부른다."""
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
            landmarks=tuple(
                float(v) / (sw if i % 2 == 0 else sh) for i, v in enumerate(r[4:14])
            ),
            aspect=sw / sh,
        )
        for r in rows
    ]
    main = max(faces, key=lambda f: f.w)
    x0 = max(0, int(main.x * sw))
    y0 = max(0, int(main.y * sh))
    x1 = min(sw, int((main.x + main.w) * sw))
    y1 = min(sh, int((main.y + main.h) * sh))
    stats = None
    if x1 - x0 > 1 and y1 - y0 > 1:
        gray = cv2.cvtColor(small[y0:y1, x0:x1], cv2.COLOR_BGR2GRAY)
        mean = float(gray.mean())
        half = gray.shape[1] // 2
        left, right = float(gray[:, :half].mean()), float(gray[:, half:].mean())
        sharp = float(cv2.Laplacian(cv2.resize(gray, (128, 128)), cv2.CV_64F).var())
        stats = PhotoStats(
            luminance=mean,
            imbalance=abs(left - right) / mean if mean > 0 else 0.0,
            sharpness=sharp,
        )
    return faces, stats


async def inspect_photo(photo: PreparedPhoto) -> GateResult:
    """사진을 검증해 결과를 돌려준다(예외를 내지 않는다). 촬영 직후 미리 알려 줄 때 쓴다."""
    faces, stats = await asyncio.to_thread(detect_faces, photo)
    # 가림 검사는 가장 큰 얼굴 기준이다. 얼굴이 없으면 건너뛴다(어차피 no_face로 막힌다).
    confident = [f for f in faces if f.score >= settings.FACE_MIN_SCORE]
    occlusion = None
    if confident:
        main = max(confident, key=lambda f: f.w)
        occlusion = await asyncio.to_thread(check_occlusion, photo.jpeg, main.x, main.y, main.w, main.h)
    result = evaluate_faces(
        faces, stats.luminance if stats else None, stats=stats, occlusion=occlusion
    )
    if not result.ok:
        log.info(
            "face_gate_reject",
            code=result.code,
            faces=len(faces),
            top_w=round(max((f.w for f in faces), default=0), 3),
            luminance=None if stats is None else round(stats.luminance),
            sharpness=None if stats is None else round(stats.sharpness),
            metrics=result.metrics,
        )
    return result


async def check_face(photo: PreparedPhoto) -> None:
    """얼굴이 아니거나 쓸 수 없는 사진이면 422. 통과하면 아무 일도 없다."""
    result = await inspect_photo(photo)
    if not result.ok:
        raise HTTPException(status_code=422, detail=result.message)
