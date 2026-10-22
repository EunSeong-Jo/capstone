"""얼굴 사진 분석 — DB·외부 호출이 필요 없는 부분.

- 사전 필터(`face_gate`): 규칙은 검출기 없이, 검출기는 얼굴이 아닌 합성 이미지로.
- 사진 정리: 회전은 픽셀에 반영하고 EXIF(GPS 포함)는 지운다.
- 응답 해석·축 변환·혼합.
- Perfect Corp 호출 흐름 전체를 `httpx.MockTransport`로 — 실제 호출·유닛 소모 없음.

실제 얼굴이 통과하는지는 팀 사진으로 직접 확인한다(개인 사진은 저장소에 두지 않는다).
"""
from __future__ import annotations

import io
import json
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import httpx
import numpy as np
import pytest
from fastapi import HTTPException
from PIL import Image

from app.config import settings
from app.services import face_gate, occlusion, skin_photo
from app.services.diagnosis import blend_scores
from app.services.face_gate import Face, evaluate_faces
from app.services.skin_quota import BASIC_CONCERNS, EXTENDED_CONCERNS, month_window

SEOUL = ZoneInfo("Asia/Seoul")


def _face(w=0.6, x=0.2, y=0.2, h=0.6, score=0.95) -> Face:
    return Face(x=x, y=y, w=w, h=h, score=score)


# ── 사전 필터 규칙 ───────────────────────────────────────────────────
def test_gate_passes_one_clear_face():
    assert evaluate_faces([_face()], luminance=120).ok


def test_gate_rejects_no_face_and_low_confidence():
    assert evaluate_faces([], 120).code == "no_face"
    assert evaluate_faces([_face(score=0.5)], 120).code == "no_face"


def test_gate_rejects_two_comparable_faces_but_ignores_small_background_face():
    assert evaluate_faces([_face(w=0.6), _face(w=0.5, x=0.0)], 120).code == "multiple_faces"
    # 배경의 작은 얼굴(주 얼굴의 절반 미만)은 무시한다.
    assert evaluate_faces([_face(w=0.6), _face(w=0.2, x=0.7, y=0.7, h=0.2)], 120).ok


@pytest.mark.parametrize(
    "w, ok",
    [(0.39, False), (0.41, True)],  # 기본 임계값 0.40 경계
)
def test_gate_width_ratio_boundary(w, ok):
    res = evaluate_faces([_face(w=w, x=0.3)], 120)
    assert res.ok is ok
    assert res.code in (None, "face_too_small")


def test_gate_rejects_face_out_of_frame_but_tolerates_small_overhang():
    assert evaluate_faces([_face(x=0.6, w=0.6)], 120).code == "face_out_of_frame"
    assert evaluate_faces([_face(x=-0.03, w=0.6)], 120).ok  # 5% 허용


# 업체가 정상 처리한 시험 사진(skin_test.jpg)을 우리 검출기(YuNet)로 잰 값 — 검출 상자 폭은 58.8%지만
# 눈 사이 거리로 어림한 얼굴 폭은 64%이고 정면이다. 이 사진이 통과해야 "업체와 같은 기준"이다.
_SAMPLE_LANDMARKS = (0.349, 0.441, 0.638, 0.431, 0.497, 0.560, 0.384, 0.677, 0.629, 0.669)


def _lm_face(*, ipd=0.289, roll_deg=0.0, nose_off=0.0, cx=0.5, cy=0.45):
    """눈 사이 거리 `ipd`(사진 폭 대비)·기울기·코 치우침을 가진 정면 얼굴. 사진은 3:4."""
    import math

    aspect = 0.75
    rx, lx = cx - ipd / 2, cx + ipd / 2
    dy = math.tan(math.radians(roll_deg)) * ipd * aspect   # 세로 비율로
    ry, ly = cy - dy / 2, cy + dy / 2
    nx = cx + nose_off * ipd
    lm = (rx, ry, lx, ly, nx, cy + 0.12, rx + 0.03, cy + 0.2, lx - 0.03, cy + 0.2)
    return Face(x=0.2, y=0.2, w=0.6, h=0.6, score=0.95, landmarks=lm, aspect=aspect)


def test_gate_accepts_the_vendor_approved_sample():
    face = Face(x=0.204, y=0.221, w=0.588, h=0.621, score=0.934,
                landmarks=_SAMPLE_LANDMARKS, aspect=0.75)
    stats = face_gate.PhotoStats(luminance=120.1, imbalance=0.096, sharpness=2241.8)
    assert evaluate_faces([face], 120.1, stats=stats).ok


@pytest.mark.parametrize("ipd, ok", [(0.25, False), (0.28, True)])  # 얼굴 폭 어림 55.6% / 62.2%, 기준 60%
def test_gate_uses_estimated_face_width_like_the_vendor(ipd, ok):
    res = evaluate_faces([_lm_face(ipd=ipd)], 120)
    assert res.ok is ok
    assert res.code in (None, "face_too_small")


def test_gate_rejects_tilted_and_turned_faces():
    assert evaluate_faces([_lm_face(roll_deg=10)], 120).ok
    assert evaluate_faces([_lm_face(roll_deg=20)], 120).code == "face_tilted"
    assert evaluate_faces([_lm_face(nose_off=0.05)], 120).ok
    assert evaluate_faces([_lm_face(nose_off=0.25)], 120).code == "face_turned"


def test_gate_rejects_a_face_cut_by_the_frame_even_when_the_box_looks_inside():
    face = _lm_face(cx=0.5)
    lm = list(face.landmarks)
    lm[0] = 0.004   # 오른쪽 눈이 가장자리에 붙었다
    cut = Face(x=face.x, y=face.y, w=face.w, h=face.h, score=face.score,
               landmarks=tuple(lm), aspect=face.aspect)
    assert evaluate_faces([cut], 120).code == "face_out_of_frame"


def test_gate_checks_lighting_and_focus_when_stats_are_given():
    face = _lm_face()

    def stats(lum=120.0, imb=0.1, sharp=500.0):
        return face_gate.PhotoStats(luminance=lum, imbalance=imb, sharpness=sharp)

    assert evaluate_faces([face], 120, stats=stats()).ok
    assert evaluate_faces([face], 240, stats=stats(lum=240)).code == "too_bright"
    assert evaluate_faces([face], 120, stats=stats(imb=0.5)).code == "uneven_light"
    assert evaluate_faces([face], 120, stats=stats(sharp=30)).code == "blurry"
    assert evaluate_faces([face], 120).ok                # stats를 모르면 판단하지 않는다


def test_gate_checklist_lists_every_item_so_all_failures_show_at_once():
    face = _lm_face(ipd=0.22, roll_deg=25)          # 너무 작고 기울어졌다
    stats = face_gate.PhotoStats(luminance=120.0, imbalance=0.1, sharpness=20.0)   # 게다가 흐리다
    res = evaluate_faces([face], 120, stats=stats)
    assert res.ok is False and res.code == "face_too_small"      # 안내 우선순위는 그대로
    by_key = {i.key: i for i in res.items}
    assert list(by_key) == ["face", "single", "frame", "size", "pose", "clear", "light", "sharp"]
    assert [k for k, i in by_key.items() if i.ok is False] == ["size", "pose", "sharp"]
    assert all(i.message for i in by_key.values() if i.ok is False)
    assert by_key["face"].ok and by_key["light"].ok


def test_gate_checklist_marks_unknowns_and_all_pass():
    ok = evaluate_faces([_lm_face()], 120, stats=face_gate.PhotoStats(120.0, 0.1, 500.0))
    from app.services.occlusion import Occlusion

    full = evaluate_faces([_lm_face()], 120, stats=face_gate.PhotoStats(120.0, 0.1, 500.0),
                          occlusion=Occlusion(True, None, {}))
    assert full.ok and all(i.ok is True for i in full.items)
    # 가림 검사 모델이 없으면 그 항목만 판단하지 않는다
    assert ok.ok and [i.key for i in ok.items if i.ok is None] == ["clear"]

    # stats를 모르면 조명·초점은 판단하지 않는다
    partial = evaluate_faces([_lm_face()], None)
    by_key = {i.key: i.ok for i in partial.items}
    assert partial.ok and by_key["light"] is None and by_key["sharp"] is None

    none = evaluate_faces([], 120)
    assert none.code == "no_face"
    assert [i.ok for i in none.items] == [False] + [None] * 7


def test_gate_checks_occlusion_per_region_and_skips_it_without_a_model():
    from app.services.occlusion import Occlusion

    face = _lm_face()
    ok = Occlusion(ok=True, region=None, ratios={"chin": 0.8})
    assert evaluate_faces([face], 120, occlusion=ok).ok

    for region in ("cheek", "nose_mouth", "chin"):
        res = evaluate_faces([face], 120, occlusion=Occlusion(False, region, {"chin": 0.1}))
        assert res.code == f"occluded_{region}"
        assert "가려졌어요" in res.message
        assert [i.ok for i in res.items if i.key == "clear"] == [False]
        assert res.metrics["skin_chin"] == 0.1

    unknown = evaluate_faces([face], 120)          # 모델을 못 읽으면 이 항목만 판단하지 않는다
    assert unknown.ok and [i.ok for i in unknown.items if i.key == "clear"] == [None]


@pytest.mark.skipif(not occlusion._file_ok(), reason="가림 검사 모델 파일이 없다(내려받지 못한 환경)")
def test_occlusion_model_flags_a_picture_without_face_skin():
    # 얼굴이 아닌 무늬 위에 얼굴 상자를 놓으면 얼굴 피부 비율이 낮아 걸린다 — 모델이 실제로 돈다는 확인
    arr = np.random.default_rng(1).integers(0, 255, (640, 480, 3), dtype=np.uint8)
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, "JPEG")
    res = occlusion.check_occlusion(buf.getvalue(), 0.2, 0.2, 0.6, 0.6)
    assert res is not None and res.ok is False
    assert set(res.ratios) == {"cheek_a", "cheek_b", "nose_mouth", "chin"}


def test_occlusion_is_skipped_when_the_model_cannot_be_loaded(monkeypatch):
    monkeypatch.setattr(occlusion, "_interpreter", None)
    monkeypatch.setattr(occlusion, "ensure_model", lambda: False)
    monkeypatch.setattr(occlusion, "_retry_at", 0.0)
    assert occlusion.check_occlusion(b"not used", 0.2, 0.2, 0.6, 0.6) is None


def test_gate_falls_back_to_box_width_without_landmarks():
    # 눈 위치를 못 얻으면 상자 폭(40%)으로만 본다 — 기존 동작
    assert evaluate_faces([_face(w=0.41, x=0.3)], 120).ok
    assert evaluate_faces([_face(w=0.39, x=0.3)], 120).code == "face_too_small"


def test_gate_rejects_dark_photo_but_unknown_luminance_passes():
    assert evaluate_faces([_face()], luminance=20).code == "too_dark"
    assert evaluate_faces([_face()], luminance=None).ok


# ── 검출기 (얼굴이 아닌 이미지) ─────────────────────────────────────
def _png(arr: np.ndarray) -> bytes:
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, "PNG")
    return buf.getvalue()


@pytest.mark.parametrize("kind", ["noise", "white", "checker"])
async def test_detector_rejects_non_face_images(kind):
    rng = np.random.default_rng(0)
    if kind == "noise":
        arr = rng.integers(0, 255, (900, 700, 3), dtype=np.uint8)
    elif kind == "white":
        arr = np.full((900, 700, 3), 255, np.uint8)
    else:
        cb = ((np.indices((900, 700)).sum(0) // 50) % 2 * 255).astype(np.uint8)
        arr = np.stack([cb] * 3, -1)
    photo = face_gate.prepare_photo(_png(arr), 480)
    with pytest.raises(HTTPException) as exc:
        await face_gate.check_face(photo)
    assert exc.value.status_code == 422
    assert "얼굴" in exc.value.detail


# ── 사진 정리 ────────────────────────────────────────────────────────
def test_prepare_photo_applies_rotation_and_strips_exif_and_gps():
    img = Image.new("RGB", (800, 600), (200, 150, 120))
    exif = Image.Exif()
    exif[274] = 6  # 오른쪽으로 90도 — 세로 사진
    exif[0x8825] = {1: "N", 2: (37.0, 30.0, 0.0), 3: "E", 4: (127.0, 0.0, 0.0)}  # GPS
    buf = io.BytesIO()
    img.save(buf, "JPEG", exif=exif)

    photo = face_gate.prepare_photo(buf.getvalue(), 480)

    out = Image.open(io.BytesIO(photo.jpeg))
    assert (out.width, out.height) == (600, 800)       # 회전이 픽셀에 반영됨
    assert dict(out.getexif()) == {}                   # EXIF·GPS 없음
    assert photo.jpeg[:2] == b"\xff\xd8"


def test_prepare_photo_rejects_garbage_and_small_images():
    with pytest.raises(HTTPException) as bad:
        face_gate.prepare_photo(b"not an image", 480)
    assert bad.value.status_code == 422

    small = io.BytesIO()
    Image.new("RGB", (300, 300)).save(small, "JPEG")
    with pytest.raises(HTTPException) as tiny:
        face_gate.prepare_photo(small.getvalue(), 480)
    assert tiny.value.status_code == 422
    assert "해상도" in tiny.value.detail


# ── 응답 해석 ────────────────────────────────────────────────────────
MOCK = skin_photo.mock_output(EXTENDED_CONCERNS)


def test_mock_output_returns_only_requested_concerns():
    basic = {e["type"] for e in skin_photo.mock_output(BASIC_CONCERNS)}
    assert basic == set(BASIC_CONCERNS)
    assert {
        "firmness", "radiance", "texture", "dark_circle_v2",
        "eye_bag", "droopy_upper_eyelid", "droopy_lower_eyelid", "tear_trough",
    } <= {e["type"] for e in MOCK}
    assert len(EXTENDED_CONCERNS) == 16 and len(BASIC_CONCERNS) == 8


def test_extract_mask_urls_keys_and_skips_missing():
    out = skin_photo.extract_mask_urls([
        {"type": "oiliness", "mask_urls": ["https://x/a.png", "https://x/b.png"]},
        {"type": "skin_type", "region": "t_zone", "mask_urls": ["https://x/t.png"]},
        {"type": "hd_dark_circle", "mask_urls": ["https://x/d.png"]},
        {"type": "acne", "mask_urls": []},
        {"type": "pore"},
        {"type": "all", "mask_urls": [None]},
        {"type": "resize_image", "mask_urls": ["https://x/original-resized.jpg"]},
    ])
    assert out == {
        "oiliness": "https://x/a.png",
        "skin_type_t_zone": "https://x/t.png",
        "dark_circle_v2": "https://x/d.png",
    }


def test_mock_masks_are_transparent_overlays_without_a_face_photo():
    import io

    from PIL import Image

    masks = skin_photo.mock_masks(("oiliness", "skin_type", "acne"))
    assert set(masks) == {"oiliness", "acne"}
    img = Image.open(io.BytesIO(masks["oiliness"]))
    assert img.mode == "RGBA" and img.getpixel((2, 2))[3] == 0          # 바탕은 투명
    assert any(a > 0 for *_, a in img.getdata())                        # 표시는 있다
    assert masks["oiliness"] == skin_photo.mock_masks(("oiliness",))["oiliness"]   # 항상 같은 그림


def test_mock_fixture_has_no_image_urls():
    raw = skin_photo.MOCK_PATH.read_text(encoding="utf-8")
    assert "amazonaws" not in raw and "mask_urls" not in raw


def test_parse_output_drops_masks_and_extras_and_prefers_whole_region():
    out = [
        {"type": "hd_pore", "region": "forehead", "raw_score": 70.0, "ui_score": 75,
         "mask_urls": ["https://x/y.png?X-Amz-Signature=abc"]},
        {"type": "hd_pore", "region": "whole", "raw_score": 36.1, "ui_score": 61},
        {"type": "hd_dark_circle", "raw_score": 78.3, "ui_score": 76},
        {"type": "skin_type", "region": "t_zone", "skin_type": "Oily"},
        {"type": "all", "score": 77.4},
        {"type": "skin_age", "score": 25},
        {"type": "resize_image", "mask_urls": ["https://x/r.jpg"]},
    ]
    parsed = skin_photo.parse_output(out)
    assert parsed["concerns"]["pore"] == {"raw": 36.1, "ui": 61}      # whole 우선
    assert "dark_circle_v2" in parsed["concerns"]                     # 이름 정규화
    assert parsed["skin_types"] == {"t_zone": "Oily"}
    assert set(parsed["concerns"]) == {"pore", "dark_circle_v2"}
    assert "amazonaws" not in json.dumps(parsed) and "mask" not in json.dumps(parsed)


def test_provider_names_for_sd_and_hd(monkeypatch):
    assert skin_photo.provider_name("oiliness", "sd") == "oiliness"
    assert skin_photo.provider_name("oiliness", "hd") == "hd_oiliness"
    assert skin_photo.provider_name("dark_circle_v2", "hd") == "hd_dark_circle"
    assert skin_photo.our_name("hd_dark_circle") == "dark_circle_v2"
    assert skin_photo.our_name("redness") == "redness"


# ── 축 변환 ─────────────────────────────────────────────────────────
def _parsed(**raw):
    base = {"oiliness": 75, "moisture": 62, "redness": 87, "age_spot": 94, "acne": 72}
    base.update(raw)
    return {"concerns": {k: {"raw": float(v), "ui": int(v)} for k, v in base.items()},
            "skin_types": {}}


def test_to_axes_inverts_problem_axes_and_keeps_moisture_direction():
    axes = skin_photo.to_axes(_parsed())
    assert axes == {"moisture": 6, "oil": 2, "sensitivity": 1, "pigmentation": 1, "trouble": 3}
    # 유분이 많은 얼굴(raw 낮음) → oil 축이 높다 / 건조한 얼굴(raw 낮음) → moisture 축이 낮다
    assert skin_photo.to_axes(_parsed(oiliness=20))["oil"] == 8
    assert skin_photo.to_axes(_parsed(moisture=20))["moisture"] == 2


def test_to_axes_stays_within_0_to_10():
    axes = skin_photo.to_axes(_parsed(oiliness=0, moisture=100, redness=0, age_spot=0, acne=0))
    assert all(0 <= v <= 10 for v in axes.values())


def test_to_axes_uses_skin_type_labels_as_small_nudges():
    p = _parsed()
    p["skin_types"] = {"whole": "Combination", "t_zone": "Oily", "u_zone": "Dry"}
    plain = skin_photo.to_axes(_parsed())
    nudged = skin_photo.to_axes(p)
    assert nudged["oil"] > plain["oil"]
    assert nudged["moisture"] < plain["moisture"]


def test_to_axes_rejects_incomplete_analysis():
    p = _parsed()
    del p["concerns"]["acne"]
    with pytest.raises(HTTPException) as exc:
        skin_photo.to_axes(p)
    assert exc.value.status_code == 502


# ── 혼합 ────────────────────────────────────────────────────────────
QNA = {"moisture": 4, "oil": 8, "sensitivity": 2, "pigmentation": 5, "trouble": 6}
PHOTO = {"moisture": 8, "oil": 2, "sensitivity": 2, "pigmentation": 5, "trouble": 0}


def test_blend_weight_zero_is_qna_only_and_one_is_photo_only():
    assert blend_scores(QNA, PHOTO, 0.0) == QNA
    assert blend_scores(QNA, PHOTO, 1.0) == PHOTO


def test_blend_mixes_by_weight_and_clamps_weight():
    mixed = blend_scores(QNA, PHOTO, 0.4)
    assert mixed == {"moisture": 6, "oil": 6, "sensitivity": 2, "pigmentation": 5, "trouble": 4}
    assert blend_scores(QNA, PHOTO, 5.0) == PHOTO       # 범위 밖 가중치는 1로
    assert blend_scores(QNA, PHOTO, -1.0) == QNA


def test_blend_keeps_qna_for_axes_missing_from_photo():
    assert blend_scores(QNA, {"oil": 0}, 0.5)["moisture"] == 4


# ── 월 경계 ─────────────────────────────────────────────────────────
def test_month_window_is_seoul_calendar_month():
    start, end = month_window(datetime(2026, 10, 20, 12, 0, tzinfo=SEOUL))
    assert start == datetime(2026, 10, 1, tzinfo=SEOUL)
    assert end == datetime(2026, 11, 1, tzinfo=SEOUL)


def test_month_window_december_rolls_to_next_year():
    _, end = month_window(datetime(2026, 12, 31, 23, 59, tzinfo=SEOUL))
    assert end == datetime(2027, 1, 1, tzinfo=SEOUL)


def test_month_window_uses_seoul_not_utc():
    # UTC로는 9월 30일 16:00이지만 서울은 10월 1일 01:00 — 이미 10월이다.
    start, _ = month_window(datetime(2026, 9, 30, 16, 0, tzinfo=timezone.utc))
    assert start == datetime(2026, 10, 1, tzinfo=SEOUL)


# ── Perfect Corp 호출 흐름 (MockTransport) ───────────────────────────
@pytest.fixture
def fast_polling(monkeypatch):
    async def _no_sleep(_):  # 폴링 대기를 없앤다
        return None

    monkeypatch.setattr(skin_photo.asyncio, "sleep", _no_sleep)
    monkeypatch.setattr(settings, "PERFECT_CORP_API_KEY", "test-key")
    monkeypatch.setattr(settings, "PERFECT_CORP_MODE", "sd")


def _api(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def _happy_handler(seen: dict, polls: list[dict]):
    def handler(req: httpx.Request) -> httpx.Response:
        path = req.url.path
        seen.setdefault("calls", []).append((req.method, path))
        if req.method == "POST" and path.endswith("/file"):
            return httpx.Response(200, json={"status": 200, "data": {"files": [{
                "file_id": "FID", "requests": [{
                    "method": "PUT", "url": "https://upload.example/x.jpg?sig=1",
                    "headers": {"Content-Type": "image/jpeg", "Content-Length": "4"}}]}]}})
        if req.method == "PUT":
            seen["uploaded"] = req.content
            seen["upload_headers"] = dict(req.headers)
            return httpx.Response(200)
        if req.method == "POST" and path.endswith("/task/skin-analysis"):
            seen["task_body"] = json.loads(req.content)
            seen["task_auth"] = req.headers.get("authorization")
            return httpx.Response(200, json={"status": 200, "data": {"task_id": "T1"}})
        if req.method == "GET":
            return httpx.Response(200, json={"status": 200, "data": polls.pop(0)})
        return httpx.Response(404)

    return handler


async def test_run_analysis_full_flow_polls_until_success(fast_polling):
    seen: dict = {}
    polls = [{"task_status": "running"},
             {"task_status": "success", "results": {"output": [{"type": "oiliness", "raw_score": 70.0}]}}]
    async with _api(_happy_handler(seen, polls)) as client:
        out = await skin_photo.run_analysis(client, b"JPEG", BASIC_CONCERNS)

    assert out == [{"type": "oiliness", "raw_score": 70.0}]
    assert [m for m, _ in seen["calls"]].count("GET") == 2          # running → success
    assert seen["uploaded"] == b"JPEG"                              # 서명 URL로 바이너리 업로드
    assert seen["task_auth"] == "Bearer test-key"
    assert seen["task_body"] == {"src_file_id": "FID", "dst_actions": list(BASIC_CONCERNS),
                                 "format": "json"}


async def test_run_analysis_uses_hd_names_in_hd_mode(fast_polling, monkeypatch):
    monkeypatch.setattr(settings, "PERFECT_CORP_MODE", "hd")
    seen: dict = {}
    polls = [{"task_status": "success", "results": {"output": []}}]
    async with _api(_happy_handler(seen, polls)) as client:
        await skin_photo.run_analysis(client, b"J", ("oiliness", "dark_circle_v2"))
    assert seen["task_body"]["dst_actions"] == ["hd_oiliness", "hd_dark_circle"]


@pytest.mark.parametrize(
    "error, status",
    [
        ("error_src_face_too_small", 422),
        ({"error": "error_lighting_dark"}, 422),
        ("error_below_min_image_size", 422),
        ("unknown_internal_error", 502),
        (None, 502),
    ],
)
async def test_task_error_maps_photo_problems_to_422_and_the_rest_to_502(
    fast_polling, error, status
):
    polls = [{"task_status": "error", "error": error}]
    async with _api(_happy_handler({}, polls)) as client:
        with pytest.raises(HTTPException) as exc:
            await skin_photo.run_analysis(client, b"J", BASIC_CONCERNS)
    assert exc.value.status_code == status


async def test_http_failure_at_any_step_is_502(fast_polling):
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom")

    async with _api(handler) as client:
        with pytest.raises(HTTPException) as exc:
            await skin_photo.run_analysis(client, b"J", BASIC_CONCERNS)
    assert exc.value.status_code == 502


async def test_upload_failure_is_502(fast_polling):
    seen: dict = {}
    base = _happy_handler(seen, [])

    def handler(req: httpx.Request) -> httpx.Response:
        if req.method == "PUT":
            return httpx.Response(403)
        return base(req)

    async with _api(handler) as client:
        with pytest.raises(HTTPException) as exc:
            await skin_photo.run_analysis(client, b"J", BASIC_CONCERNS)
    assert exc.value.status_code == 502


async def test_polling_gives_up_after_the_deadline(fast_polling, monkeypatch):
    monkeypatch.setattr(skin_photo, "POLL_TOTAL_SEC", -1.0)       # 이미 시간 초과
    polls = [{"task_status": "running"}] * 3
    async with _api(_happy_handler({}, polls)) as client:
        with pytest.raises(HTTPException) as exc:
            await skin_photo.run_analysis(client, b"J", BASIC_CONCERNS)
    assert exc.value.status_code == 502


async def test_analyze_face_without_key_is_503_and_mock_needs_no_key(monkeypatch):
    monkeypatch.setattr(settings, "PERFECT_CORP_MOCK", False)
    monkeypatch.setattr(settings, "PERFECT_CORP_API_KEY", "")
    with pytest.raises(HTTPException) as exc:
        await skin_photo.analyze_face(b"J", BASIC_CONCERNS)
    assert exc.value.status_code == 503

    monkeypatch.setattr(settings, "PERFECT_CORP_MOCK", True)
    out = await skin_photo.analyze_face(b"J", BASIC_CONCERNS)
    assert {e["type"] for e in out} == set(BASIC_CONCERNS)
