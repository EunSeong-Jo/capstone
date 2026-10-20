"""얼굴 사진 → 피부 분석 (Perfect Corp YouCam AI Skin Analysis).

호출 흐름 (문서: docs.perfectcorp.com/reference/ai_skin_analysis, 2026-10-20 확인)
    1. POST /file                 파일 등록 → file_id + 서명된 업로드 URL
    2. PUT  <업로드 URL>          바이너리 업로드 (**건너뛰면 404/500**)
    3. POST /task/skin-analysis   src_file_id + dst_actions + format=json → task_id
    4. GET  /task/skin-analysis/<task_id>   success / error 가 될 때까지 폴링

유닛은 **작업이 성공했을 때만** 차감된다(실패·진행 중은 무료). 가격은 분석 유형 수
구간별 정액이다 — SD 5~8개 12유닛, 9~12개 14유닛.

SD와 HD
-------
같은 사진에서 우리가 쓰는 유형의 점수는 거의 같았고(6개 중 5개가 소수점까지 동일,
acne만 3.8 차이), HD는 모공·주름의 **부위별** 결과가 더 나올 뿐이다. SD가 더 싸고
입력 해상도 조건도 느슨(짧은 변 480px, HD는 1080px)해서 SD를 기본으로 한다.
`PERFECT_CORP_MODE=hd`로 바꾸면 유형 이름만 `hd_` 접두사로 바뀐다.

점수 방향: Perfect Corp의 `raw_score`·`ui_score`는 **높을수록 건강**하다. 문서는
`ui_score`가 "심리적 동기 부여용으로 보정된 값"이라 하고 분석에는 `raw_score`를 쓰라고
한다. 그래서 진단 축은 raw로, 화면에 보여 주는 막대는 ui로 만든다.

`mask_urls`(얼굴 위에 그린 분석 이미지의 서명 URL)는 쓰지 않고 버린다 — 얼굴이 담긴
이미지의 주소를 DB에 두거나 화면에 내려보내지 않기 위해서다.
"""
from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path
from typing import Any

import httpx
import structlog
from fastapi import HTTPException

from app.config import settings

log = structlog.get_logger()

MOCK_PATH = Path(__file__).resolve().parent.parent / "assets" / "perfect_corp_mock.json"

HTTP_TIMEOUT_SEC = 30.0
POLL_TOTAL_SEC = 60.0
# 처음엔 자주, 갈수록 느리게 본다(문서는 짧은 간격 폴링을 권하지 않는다).
POLL_DELAYS_SEC = (1.5, 2.0, 3.0, 4.0, 5.0)

# 진단 5축의 재료. 둘 중 하나라도 응답에 없으면 쓸 수 없는 분석이다.
AXIS_CONCERNS = ("oiliness", "moisture", "redness", "age_spot", "acne")

# Perfect Corp 오류 코드 → 사용자 안내. 이들은 사진 문제라 한도를 쓰지 않는다(422).
_PHOTO_ERRORS = {
    "error_below_min_image_size": "사진 해상도가 너무 낮아요. 더 선명한 사진으로 다시 시도해 주세요.",
    "error_exceed_max_image_size": "사진이 너무 커요. 크기를 줄여서 다시 시도해 주세요.",
    "error_src_face_too_small": "얼굴이 너무 작아요. 화면에 얼굴이 가득 차게 가까이에서 찍어 주세요.",
    "error_src_face_out_of_bound": "얼굴이 화면 밖으로 나갔어요. 얼굴 전체가 보이게 찍어 주세요.",
    "error_lighting_dark": "너무 어두워요. 밝은 곳에서 다시 찍어 주세요.",
}

_UNAVAILABLE = "피부 분석을 지금은 사용할 수 없어요. 잠시 뒤에 다시 시도해 주세요."


# ── 유형 이름 ────────────────────────────────────────────────────────
def provider_name(concern: str, mode: str) -> str:
    """우리 이름(SD 기준) → 호출에 쓰는 이름."""
    if mode != "hd":
        return concern
    return {"dark_circle_v2": "hd_dark_circle"}.get(concern, f"hd_{concern}")


def our_name(provider_type: str) -> str:
    """응답의 type → 우리 이름. `hd_` 접두사를 떼고 dark_circle을 맞춘다."""
    name = provider_type.removeprefix("hd_")
    return "dark_circle_v2" if name == "dark_circle" else name


# ── 호출 ─────────────────────────────────────────────────────────────
def _auth() -> dict[str, str]:
    return {"Authorization": f"Bearer {settings.PERFECT_CORP_API_KEY}"}


def _ensure_ok(resp: httpx.Response, step: str) -> dict:
    if resp.status_code != 200:
        # 본문은 오류 설명만 담지만 길이를 줄여 남긴다. 키·서명 URL은 본문에 없다.
        log.warning("perfect_corp_failed", step=step, status=resp.status_code, body=resp.text[:200])
        raise HTTPException(status_code=502, detail=_UNAVAILABLE)
    return resp.json()


async def run_analysis(
    client: httpx.AsyncClient, jpeg: bytes, concerns: tuple[str, ...]
) -> list[dict]:
    """파일 등록 → 업로드 → 작업 생성 → 폴링. 응답의 `results.output` 목록을 돌려준다.

    `client`를 받는 이유는 테스트가 `MockTransport`로 실제 호출 없이 흐름 전체를
    돌려 보기 위해서다.
    """
    base = settings.PERFECT_CORP_BASE_URL.rstrip("/")

    reg = _ensure_ok(
        await client.post(
            f"{base}/file",
            headers=_auth(),
            json={"files": [{"content_type": "image/jpeg", "file_name": "face.jpg",
                             "file_size": len(jpeg)}]},
        ),
        "file",
    )
    try:
        entry = reg["data"]["files"][0]
        file_id = entry["file_id"]
        upload = entry["requests"][0]
    except (KeyError, IndexError, TypeError):
        log.warning("perfect_corp_bad_file_response")
        raise HTTPException(status_code=502, detail=_UNAVAILABLE) from None

    put = await client.request(
        upload.get("method", "PUT"), upload["url"], headers=upload.get("headers") or {},
        content=jpeg,
    )
    if put.status_code // 100 != 2:
        log.warning("perfect_corp_upload_failed", status=put.status_code)
        raise HTTPException(status_code=502, detail=_UNAVAILABLE)

    mode = settings.PERFECT_CORP_MODE
    task = _ensure_ok(
        await client.post(
            f"{base}/task/skin-analysis",
            headers=_auth(),
            json={
                "src_file_id": file_id,
                "dst_actions": [provider_name(c, mode) for c in concerns],
                "format": "json",
            },
        ),
        "task",
    )
    try:
        task_id = task["data"]["task_id"]
    except (KeyError, TypeError):
        raise HTTPException(status_code=502, detail=_UNAVAILABLE) from None

    deadline = time.monotonic() + POLL_TOTAL_SEC
    attempt = 0
    while True:
        delay = POLL_DELAYS_SEC[min(attempt, len(POLL_DELAYS_SEC) - 1)]
        attempt += 1
        await asyncio.sleep(delay)
        poll = _ensure_ok(
            await client.get(f"{base}/task/skin-analysis/{task_id}", headers=_auth()), "poll"
        )
        data = poll.get("data") or {}
        status = data.get("task_status")
        if status == "success":
            return (data.get("results") or {}).get("output") or []
        if status == "error":
            _raise_task_error(data.get("error"))
        if time.monotonic() > deadline:
            log.warning("perfect_corp_timeout", task_id=task_id)
            raise HTTPException(status_code=502, detail=_UNAVAILABLE)


def _raise_task_error(error: Any) -> None:
    """작업이 `error`로 끝났다. 사진 문제면 422, 아니면 502."""
    code = error.get("error") or error.get("code") if isinstance(error, dict) else error
    log.info("perfect_corp_task_error", code=code)
    if isinstance(code, str) and code in _PHOTO_ERRORS:
        raise HTTPException(status_code=422, detail=_PHOTO_ERRORS[code])
    raise HTTPException(status_code=502, detail=_UNAVAILABLE)


def mock_output(concerns: tuple[str, ...]) -> list[dict]:
    """저장해 둔 응답에서 요청한 유형만 돌려준다(실제 API처럼). 유닛을 쓰지 않는다."""
    doc = json.loads(MOCK_PATH.read_text(encoding="utf-8"))
    wanted = set(concerns)
    return [dict(e) for e in doc["output"] if e["type"] in wanted]


async def analyze_face(jpeg: bytes, concerns: tuple[str, ...]) -> list[dict]:
    """엔드포인트가 부르는 진입점. 키가 없으면 503, 호출이 실패하면 502."""
    if settings.PERFECT_CORP_MOCK:
        return mock_output(concerns)
    if not settings.PERFECT_CORP_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="피부 분석 키가 설정되지 않았습니다 (PERFECT_CORP_API_KEY).",
        )
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SEC) as client:
            output = await run_analysis(client, jpeg, concerns)
    except httpx.HTTPError as exc:
        log.warning("perfect_corp_unreachable", error=str(exc)[:200])
        raise HTTPException(status_code=502, detail=_UNAVAILABLE) from exc
    log.info(
        "perfect_corp_done", mode=settings.PERFECT_CORP_MODE, concerns=len(concerns),
        ms=round((time.perf_counter() - started) * 1000),
    )
    return output


# ── 해석 ─────────────────────────────────────────────────────────────
def parse_output(output: list[dict]) -> dict:
    """응답 → `{"concerns": {key: {"raw", "ui"}}, "skin_types": {region: str}}`.

    같은 유형이 부위별로 여러 번 나오면(HD의 모공·주름) `whole`을 쓰고, 없으면 첫 값을
    쓴다. `all`·`skin_age`·`resize_image` 같은 부가 항목과 `mask_urls`는 버린다.
    """
    concerns: dict[str, dict] = {}
    skin_types: dict[str, str] = {}
    for e in output:
        name = our_name(str(e.get("type", "")))
        if name == "skin_type":
            region = e.get("region")
            if region and e.get("skin_type"):
                skin_types[region] = str(e["skin_type"])
            continue
        if "raw_score" not in e:
            continue
        item = {"raw": float(e["raw_score"]), "ui": int(round(e.get("ui_score", e["raw_score"])))}
        if name not in concerns or e.get("region") == "whole":
            concerns[name] = item
    return {"concerns": concerns, "skin_types": skin_types}


def _clamp(v: float) -> int:
    return max(0, min(10, round(v)))


def skin_type_nudges(skin_types: dict[str, str]) -> dict[str, float]:
    """업체의 피부 분류(Normal·Oily·Dry·Combination·Redness…)를 축의 작은 보정으로 옮긴다.

    점수만으로는 구분이 어려운 복합성(T존만 번들거림)을 잡는 용도다. 크기는
    `PHOTO_SKIN_TYPE_NUDGE`(기본 1축 점수)로 작게 둔다 — 분류는 점수보다 거칠다.
    """
    n = settings.PHOTO_SKIN_TYPE_NUDGE
    labels = " ".join(skin_types.values())
    out = {"oil": 0.0, "moisture": 0.0, "sensitivity": 0.0}
    if "Oily" in labels:
        out["oil"] += n
    if "Dry" in labels:
        out["moisture"] -= n
    if "Combination" in labels:
        out["oil"] += n / 2
        out["moisture"] -= n / 2
    if "Redness" in labels:
        out["sensitivity"] += n
    return out


def to_axes(parsed: dict) -> dict[str, int]:
    """분석 → 진단 5축(0~10, 높을수록 그 성향이 강함).

    Perfect Corp은 높을수록 건강하므로 문제 축(유분·민감·색소·트러블)은 `(100 - raw) / 10`,
    수분은 `raw / 10`이다. 건강한 피부는 값이 한쪽에 몰리므로 `PHOTO_AXIS_GAIN`으로
    문제 축의 간격을 키울 수 있다(실측 뒤 조정).
    """
    c = parsed["concerns"]
    missing = [k for k in AXIS_CONCERNS if k not in c]
    if missing:
        log.warning("perfect_corp_incomplete", missing=missing)
        raise HTTPException(status_code=502, detail="분석 결과가 불완전해요. 다시 시도해 주세요.")

    gain = settings.PHOTO_AXIS_GAIN
    nudge = skin_type_nudges(parsed["skin_types"])

    def problem(key: str) -> float:
        return (100 - c[key]["raw"]) / 10 * gain

    return {
        "moisture": _clamp(c["moisture"]["raw"] / 10 + nudge["moisture"]),
        "oil": _clamp(problem("oiliness") + nudge["oil"]),
        "sensitivity": _clamp(problem("redness") + nudge["sensitivity"]),
        "pigmentation": _clamp(problem("age_spot")),
        "trouble": _clamp(problem("acne")),
    }
