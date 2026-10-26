"""얼굴 사진 AI 피부 분석 API — 동의·구독·한도·분석·진단 혼합.

Perfect Corp 호출은 하지 않는다(`PERFECT_CORP_MOCK` 또는 함수 대체). 얼굴 사전 필터도
대체한다 — 합성 이미지로는 실제 얼굴 검출을 통과시킬 수 없고, 검출기 자체는
`test_skin_photo_unit.py`가 본다. 여기서는 그 앞뒤의 **계약**(상태 코드, 한도 차감
시점, 점수 혼합)을 본다.

⚠️ 쓰기 테스트다. 계정은 테스트마다 만들고 지우며, 분석·구독·동의 행은 사용자
삭제(CASCADE)로 함께 정리된다.
"""
from __future__ import annotations

import base64
import io
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from fastapi import HTTPException
from httpx import AsyncClient
from PIL import Image
from sqlalchemy import delete, func, select, update

from app.config import settings
from app.db.session import AsyncSessionLocal
from app.models.skin_photo import SkinAnalysis, SkinAnalysisImage, Subscription
from app.models.user import User

pytestmark = pytest.mark.asyncio(loop_scope="session")

AUTH = "/api/v1/auth"
ME = "/api/v1/me"
ANALYZE = "/api/v1/skin-analysis"
QUIZ = "/api/v1/profile/skin-quiz"
PASSWORD = "swappy1234"


def _photo_data_url(w: int = 600, h: int = 800) -> str:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), (210, 170, 150)).save(buf, "JPEG")
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


@pytest.fixture(autouse=True)
def mock_provider(monkeypatch):
    """모든 테스트가 실제 호출 없이 돈다. 사전 필터는 통과시킨다."""
    monkeypatch.setattr(settings, "PERFECT_CORP_MOCK", True)

    async def _pass(_photo):
        return None

    monkeypatch.setattr("app.api.skin_photo.check_face", _pass)


async def _signup(client: AsyncClient, face_consent: bool | None = None) -> dict:
    email = f"pytest-{uuid.uuid4().hex[:12]}@example.com"
    body = {"email": email, "password": PASSWORD}
    if face_consent is not None:
        body["faceConsent"] = face_consent
    res = await client.post(f"{AUTH}/signup", json=body)
    assert res.status_code == 201, res.text
    return {
        "email": email,
        "id": uuid.UUID(res.json()["user"]["id"]),
        "headers": {"Authorization": f"Bearer {res.json()['accessToken']}"},
    }


async def _cleanup(email: str) -> None:
    async with AsyncSessionLocal() as db:
        await db.execute(delete(User).where(User.email == email))
        await db.commit()


@pytest_asyncio.fixture(loop_scope="session")
async def user(client: AsyncClient):
    """동의하지 않은 일반 가입자."""
    acc = await _signup(client)
    yield acc
    await _cleanup(acc["email"])


@pytest_asyncio.fixture(loop_scope="session")
async def consented(client: AsyncClient):
    """가입할 때 얼굴 사진 수집에 동의한 사용자."""
    acc = await _signup(client, face_consent=True)
    yield acc
    await _cleanup(acc["email"])


async def _quota(client: AsyncClient, acc: dict) -> dict:
    res = await client.get(f"{ME}/skin-analysis/quota", headers=acc["headers"])
    assert res.status_code == 200, res.text
    return res.json()


async def _analyze(client: AsyncClient, acc: dict):
    return await client.post(ANALYZE, json={"image": _photo_data_url()}, headers=acc["headers"])


# ── 동의 ────────────────────────────────────────────────────────────
async def test_endpoints_require_login(client: AsyncClient) -> None:
    for method, url in [
        ("GET", f"{ME}/consents/face-photo"),
        ("PUT", f"{ME}/consents/face-photo"),
        ("GET", f"{ME}/subscription"),
        ("POST", f"{ME}/subscription"),
        ("DELETE", f"{ME}/subscription"),
        ("GET", f"{ME}/skin-analysis/quota"),
        ("GET", ANALYZE),
        ("POST", ANALYZE),
        ("GET", f"{ANALYZE}/latest"),
    ]:
        res = await client.request(method, url, json={} if method in ("PUT", "POST") else None)
        assert res.status_code == 401, (method, url, res.status_code)


async def test_signup_without_the_field_still_works_and_has_no_consent(
    client: AsyncClient, user
) -> None:
    """기존 클라이언트(필드 없음)와 체크하지 않은 가입은 동의가 없다."""
    res = await client.get(f"{ME}/consents/face-photo", headers=user["headers"])
    assert res.status_code == 200
    assert res.json()["granted"] is False
    assert res.json()["currentVersion"] == settings.FACE_CONSENT_VERSION


async def test_signup_with_consent_records_it(client: AsyncClient, consented) -> None:
    res = await client.get(f"{ME}/consents/face-photo", headers=consented["headers"])
    assert res.json()["granted"] is True
    assert res.json()["agreedAt"]


async def test_consent_can_be_granted_and_withdrawn(client: AsyncClient, user) -> None:
    h = user["headers"]
    on = await client.put(f"{ME}/consents/face-photo", json={"agreed": True}, headers=h)
    assert on.json()["granted"] is True
    off = await client.put(f"{ME}/consents/face-photo", json={"agreed": False}, headers=h)
    assert off.json()["granted"] is False
    again = await client.put(f"{ME}/consents/face-photo", json={"agreed": True}, headers=h)
    assert again.json()["granted"] is True


async def test_old_consent_version_no_longer_counts(
    client: AsyncClient, consented, monkeypatch
) -> None:
    """문구가 바뀌어 버전이 올라가면 옛 동의는 현재 문구에 대한 동의가 아니다."""
    monkeypatch.setattr(settings, "FACE_CONSENT_VERSION", "2099-01-01")
    res = await client.get(f"{ME}/consents/face-photo", headers=consented["headers"])
    assert res.json()["granted"] is False
    assert (await _quota(client, consented))["allowance"] == 0


# ── 구독 ────────────────────────────────────────────────────────────
async def test_subscription_lifecycle(client: AsyncClient, user) -> None:
    h = user["headers"]
    assert (await client.get(f"{ME}/subscription", headers=h)).json()["active"] is False
    assert (await client.delete(f"{ME}/subscription", headers=h)).status_code == 404

    started = await client.post(f"{ME}/subscription", headers=h)
    assert started.status_code == 201
    body = started.json()
    assert body["active"] is True and body["status"] == "active" and body["demo"] is True
    start = datetime.fromisoformat(body["currentPeriodStart"])
    end = datetime.fromisoformat(body["currentPeriodEnd"])
    assert timedelta(days=29) < end - start <= timedelta(days=31)

    # 멱등: 다시 눌러도 새 기간이 생기지 않는다.
    again = (await client.post(f"{ME}/subscription", headers=h)).json()
    assert again["currentPeriodEnd"] == body["currentPeriodEnd"]

    # 해지해도 기간 끝까지는 구독자다.
    cancelled = (await client.delete(f"{ME}/subscription", headers=h)).json()
    assert cancelled["active"] is True and cancelled["status"] == "cancelled"
    assert (await _quota(client, user))["plan"] == "subscriber"

    # 기간이 남았으면 다시 시작하면 해지가 풀린다.
    revived = (await client.post(f"{ME}/subscription", headers=h)).json()
    assert revived["status"] == "active"
    assert revived["currentPeriodEnd"] == body["currentPeriodEnd"]


async def test_expired_subscription_falls_back_to_free(client: AsyncClient, user) -> None:
    h = user["headers"]
    await client.put(f"{ME}/consents/face-photo", json={"agreed": True}, headers=h)
    await client.post(f"{ME}/subscription", headers=h)
    assert (await _quota(client, user))["allowance"] == settings.SKIN_SUBSCRIBER_MONTHLY

    async with AsyncSessionLocal() as db:
        await db.execute(
            update(Subscription)
            .where(Subscription.user_id == user["id"])
            .values(current_period_end=datetime.now(timezone.utc) - timedelta(days=1))
        )
        await db.commit()

    q = await _quota(client, user)
    assert q["plan"] == "free" and q["allowance"] == settings.SKIN_FREE_MONTHLY
    assert (await client.get(f"{ME}/subscription", headers=h)).json()["active"] is False


# ── 한도 ────────────────────────────────────────────────────────────
async def test_quota_by_tier(client: AsyncClient, user) -> None:
    h = user["headers"]
    none = await _quota(client, user)
    assert (none["allowance"], none["remaining"], none["consentGranted"]) == (0, 0, False)

    await client.put(f"{ME}/consents/face-photo", json={"agreed": True}, headers=h)
    free = await _quota(client, user)
    assert free["plan"] == "free"
    assert free["allowance"] == settings.SKIN_FREE_MONTHLY == free["remaining"]
    assert (free["concernCount"], free["extended"]) == (8, False)

    await client.post(f"{ME}/subscription", headers=h)
    sub = await _quota(client, user)
    assert sub["plan"] == "subscriber"
    assert sub["allowance"] == settings.SKIN_SUBSCRIBER_MONTHLY
    assert (sub["concernCount"], sub["extended"]) == (16, True)
    assert sub["resetsAt"]


async def test_last_months_analyses_do_not_count(client: AsyncClient, consented) -> None:
    async with AsyncSessionLocal() as db:
        db.add(SkinAnalysis(
            user_id=consented["id"], quota_kind="free", concern_set="basic",
            provider_mode="mock", metrics={"axes": {}, "concerns": {}},
            created_at=datetime.now(timezone.utc) - timedelta(days=45),
        ))
        await db.commit()
    q = await _quota(client, consented)
    assert q["used"] == 0 and q["remaining"] == settings.SKIN_FREE_MONTHLY


# ── 분석 ────────────────────────────────────────────────────────────
async def test_analyze_requires_consent(client: AsyncClient, user) -> None:
    res = await _analyze(client, user)
    assert res.status_code == 403


async def test_analyze_success_uses_quota_and_hides_image_urls(
    client: AsyncClient, consented
) -> None:
    res = await _analyze(client, consented)
    assert res.status_code == 201, res.text
    body = res.json()

    assert set(body["axes"]) == {"moisture", "oil", "sensitivity", "pigmentation", "trouble"}
    assert all(0 <= v <= 10 for v in body["axes"].values())
    assert body["extended"] is False
    assert len(body["concerns"]) == 7          # 기본 8개 중 skin_type은 별도 필드
    assert {c["key"] for c in body["concerns"]} >= {"oiliness", "pore", "wrinkle"}
    assert body["skinTypes"]["whole"] == "Normal"
    assert body["remaining"] == settings.SKIN_FREE_MONTHLY - 1
    # 얼굴이 담긴 이미지의 주소는 응답 어디에도 없다.
    assert "http" not in res.text and "mask" not in res.text

    q = await _quota(client, consented)
    assert q["used"] == 1 and q["remaining"] == 0

    again = await _analyze(client, consented)
    assert again.status_code == 402


async def test_subscriber_gets_sixteen_concerns(client: AsyncClient, consented) -> None:
    await client.post(f"{ME}/subscription", headers=consented["headers"])
    res = await _analyze(client, consented)
    body = res.json()
    assert res.status_code == 201 and body["extended"] is True
    keys = {c["key"] for c in body["concerns"]}
    assert {
        "firmness", "radiance", "texture", "dark_circle_v2",
        "eye_bag", "droopy_upper_eyelid", "droopy_lower_eyelid", "tear_trough",
    } <= keys
    assert len(body["concerns"]) == 15         # 16개 중 skin_type은 별도 필드
    assert body["remaining"] == settings.SKIN_SUBSCRIBER_MONTHLY - 1


async def test_requested_concerns_follow_the_tier(
    client: AsyncClient, consented, monkeypatch
) -> None:
    """무료는 기본 8개, 구독자는 확장 16개를 Perfect Corp에 요청한다."""
    from app.services.skin_photo import mock_output
    from app.services.skin_quota import BASIC_CONCERNS, EXTENDED_CONCERNS

    seen: list[tuple[str, ...]] = []

    async def spy(_jpeg: bytes, concerns: tuple[str, ...]) -> list[dict]:
        seen.append(concerns)
        return mock_output(concerns)

    monkeypatch.setattr("app.api.skin_photo.analyze_face", spy)
    h = consented["headers"]
    assert (await _analyze(client, consented)).status_code == 201
    await client.post(f"{ME}/subscription", headers=h)
    assert (await _analyze(client, consented)).status_code == 201
    assert seen == [BASIC_CONCERNS, EXTENDED_CONCERNS]


async def test_gate_rejection_does_not_use_quota(
    client: AsyncClient, consented, monkeypatch
) -> None:
    async def gate_rejects(_photo):
        raise HTTPException(status_code=422, detail="얼굴이 보이지 않아요")

    monkeypatch.setattr("app.api.skin_photo.check_face", gate_rejects)
    called = []

    async def must_not_run(*_a):
        called.append(1)
        return []

    monkeypatch.setattr("app.api.skin_photo.analyze_face", must_not_run)

    res = await _analyze(client, consented)
    assert res.status_code == 422 and "얼굴" in res.json()["detail"]
    assert called == []                           # 외부 호출이 일어나지 않았다
    q = await _quota(client, consented)
    assert q["used"] == 0 and q["remaining"] == settings.SKIN_FREE_MONTHLY


async def test_provider_error_does_not_use_quota(
    client: AsyncClient, consented, monkeypatch
) -> None:
    async def provider_down(_jpeg, _concerns):
        raise HTTPException(status_code=502, detail="분석 서비스 오류")

    monkeypatch.setattr("app.api.skin_photo.analyze_face", provider_down)
    assert (await _analyze(client, consented)).status_code == 502
    q = await _quota(client, consented)
    assert q["used"] == 0 and q["remaining"] == settings.SKIN_FREE_MONTHLY


async def test_analyze_validates_the_image_payload(client: AsyncClient, consented) -> None:
    bad = await client.post(ANALYZE, json={"image": "not-a-data-url"}, headers=consented["headers"])
    assert bad.status_code == 422
    small = await client.post(
        ANALYZE, json={"image": _photo_data_url(200, 200)}, headers=consented["headers"]
    )
    assert small.status_code == 422             # 해상도 미달 (짧은 변 480px)
    assert (await _quota(client, consented))["used"] == 0


async def test_provider_not_configured_is_503(
    client: AsyncClient, consented, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "PERFECT_CORP_MOCK", False)
    monkeypatch.setattr(settings, "PERFECT_CORP_API_KEY", "")
    res = await _analyze(client, consented)
    assert res.status_code == 503
    assert (await _quota(client, consented))["used"] == 0


# ── 사진 사전 검증 ──────────────────────────────────────────────────
CHECK = f"{ANALYZE}/check"


async def test_precheck_requires_login_and_consent(client: AsyncClient, user) -> None:
    body = {"image": _photo_data_url()}
    assert (await client.post(CHECK, json=body)).status_code == 401
    assert (await client.post(CHECK, json=body, headers=user["headers"])).status_code == 403


async def test_precheck_reports_ok_and_reasons_without_using_the_quota(
    client: AsyncClient, consented, monkeypatch
) -> None:
    from app.services.face_gate import GateResult

    h = consented["headers"]
    body = {"image": _photo_data_url()}

    async def ok(_photo):
        return GateResult(True)

    monkeypatch.setattr("app.api.skin_photo.inspect_photo", ok)
    res = await client.post(CHECK, json=body, headers=h)
    assert res.status_code == 200 and res.json()["ok"] is True and res.json()["message"] is None

    async def bad(_photo):
        return GateResult(False, "too_dark", "밝은 곳에서 다시 찍어 주세요.")

    monkeypatch.setattr("app.api.skin_photo.inspect_photo", bad)
    res = await client.post(CHECK, json=body, headers=h)
    assert res.status_code == 200
    assert (res.json()["ok"], res.json()["code"], res.json()["message"]) == (False, "too_dark", "밝은 곳에서 다시 찍어 주세요.")

    async def listed(_photo):
        from app.services.face_gate import CheckItem

        return GateResult(False, "too_dark", "밝은 곳에서 다시 찍어 주세요.", [
            CheckItem("face", "얼굴 인식", True),
            CheckItem("light", "조명", False, "밝은 곳에서 다시 찍어 주세요."),
            CheckItem("sharp", "초점", None),
        ])

    monkeypatch.setattr("app.api.skin_photo.inspect_photo", listed)
    items = (await client.post(CHECK, json=body, headers=h)).json()["items"]
    assert [(i["key"], i["ok"]) for i in items] == [("face", True), ("light", False), ("sharp", None)]
    assert items[1]["message"] == "밝은 곳에서 다시 찍어 주세요."

    assert (await _quota(client, consented))["used"] == 0     # 분석이 아니라서 한도를 쓰지 않는다


async def test_precheck_turns_an_unreadable_or_tiny_photo_into_a_reason(
    client: AsyncClient, consented
) -> None:
    h = consented["headers"]
    tiny = await client.post(CHECK, json={"image": _photo_data_url(100, 100)}, headers=h)
    assert tiny.status_code == 200
    assert tiny.json()["ok"] is False and tiny.json()["code"] == "image_unusable"
    assert "해상도" in tiny.json()["message"]

    junk = await client.post(CHECK, json={"image": "data:image/png;base64,AAAA"}, headers=h)
    assert junk.status_code == 200 and junk.json()["ok"] is False


async def test_latest_analysis(client: AsyncClient, consented) -> None:
    h = consented["headers"]
    assert (await client.get(f"{ANALYZE}/latest", headers=h)).status_code == 404
    made = (await _analyze(client, consented)).json()
    latest = await client.get(f"{ANALYZE}/latest", headers=h)
    assert latest.status_code == 200
    assert latest.json()["analysisId"] == made["analysisId"]
    assert latest.json()["remaining"] is None


async def test_concurrent_requests_cannot_exceed_the_quota(
    client: AsyncClient, consented
) -> None:
    import asyncio

    results = await asyncio.gather(*[_analyze(client, consented) for _ in range(4)])
    codes = sorted(r.status_code for r in results)
    assert codes.count(201) == settings.SKIN_FREE_MONTHLY
    assert codes.count(402) == 4 - settings.SKIN_FREE_MONTHLY


# ── 진단 혼합 ───────────────────────────────────────────────────────
async def _answers(client: AsyncClient) -> dict[str, int]:
    qs = (await client.get(f"{QUIZ}/questions")).json()["questions"]
    return {q["code"]: 0 for q in qs}


async def test_diagnosis_without_analysis_is_qna_only(client: AsyncClient, user) -> None:
    res = await client.post(QUIZ, json={"answers": await _answers(client)}, headers=user["headers"])
    assert res.status_code == 201
    assert res.json()["photoUsed"] is False


async def test_diagnosis_blends_the_stored_analysis(client: AsyncClient, consented) -> None:
    h = consented["headers"]
    answers = await _answers(client)
    plain = (await client.post(QUIZ, json={"answers": answers}, headers=h)).json()["scores"]

    analysis = (await _analyze(client, consented)).json()
    blended = await client.post(
        QUIZ, json={"answers": answers, "analysisId": analysis["analysisId"]}, headers=h
    )
    assert blended.status_code == 201, blended.text
    body = blended.json()
    assert body["photoUsed"] is True

    w = settings.PHOTO_BLEND_WEIGHT
    for axis, qna in plain.items():
        expected = max(0, min(10, round((1 - w) * qna + w * analysis["axes"][axis])))
        assert body["scores"][axis] == expected, axis

    latest = (await client.get(f"{QUIZ}/latest", headers=h)).json()
    assert latest["photoUsed"] is True


async def test_photo_only_diagnosis_uses_the_photo_axes(client: AsyncClient, consented) -> None:
    h = consented["headers"]
    analysis = (await _analyze(client, consented)).json()
    res = await client.post(QUIZ, json={"analysisId": analysis["analysisId"]}, headers=h)
    assert res.status_code == 201, res.text
    body = res.json()
    assert (body["photoUsed"], body["photoOnly"], body["answeredCount"]) == (True, True, 0)
    assert body["scores"] == analysis["axes"]
    assert len(body["ranks"]) == 3

    latest = (await client.get(f"{QUIZ}/latest", headers=h)).json()
    assert latest["photoOnly"] is True


async def test_diagnosis_needs_answers_or_an_analysis(client: AsyncClient, user) -> None:
    for body in ({}, {"answers": {}}):
        res = await client.post(QUIZ, json=body, headers=user["headers"])
        assert res.status_code == 422


async def test_partial_answers_blend_only_the_touched_axes(
    client: AsyncClient, consented
) -> None:
    h = consented["headers"]
    analysis = (await _analyze(client, consented)).json()
    # q2의 0번 선택지는 민감도 축만 건드린다.
    res = await client.post(
        QUIZ, json={"answers": {"q2": 0}, "analysisId": analysis["analysisId"]}, headers=h
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert (body["photoUsed"], body["photoOnly"], body["answeredCount"]) == (True, False, 1)

    w = settings.PHOTO_PARTIAL_WEIGHT
    qna_sensitivity = 8  # BASE_SCORE 5 + 3
    expected = round((1 - w) * qna_sensitivity + w * analysis["axes"]["sensitivity"])
    assert body["scores"]["sensitivity"] == expected
    for axis in ("moisture", "oil", "pigmentation", "trouble"):
        assert body["scores"][axis] == analysis["axes"][axis], axis


async def test_analysis_history_is_newest_first_and_private(
    client: AsyncClient, consented, user
) -> None:
    h = consented["headers"]
    assert (await client.get(ANALYZE, headers=h)).json() == []

    await client.post(f"{ME}/subscription", headers=h)
    first = (await _analyze(client, consented)).json()
    second = (await _analyze(client, consented)).json()

    rows = (await client.get(ANALYZE, headers=h)).json()
    assert [r["analysisId"] for r in rows] == [second["analysisId"], first["analysisId"]]
    assert all(r["remaining"] is None for r in rows)
    assert len((await client.get(f"{ANALYZE}?limit=1", headers=h)).json()) == 1
    assert (await client.get(f"{ANALYZE}?limit=0", headers=h)).status_code == 422

    assert (await client.get(ANALYZE, headers=user["headers"])).json() == []
    assert (await client.get(ANALYZE)).status_code == 401


async def test_diagnosis_rejects_foreign_unknown_and_stale_analyses(
    client: AsyncClient, consented, user
) -> None:
    answers = await _answers(client)
    mine = (await _analyze(client, consented)).json()["analysisId"]

    # 남의 분석 / 없는 분석
    for aid in (mine, str(uuid.uuid4())):
        res = await client.post(
            QUIZ, json={"answers": answers, "analysisId": aid}, headers=user["headers"]
        )
        assert res.status_code == 422

    # 1시간이 지난 분석
    async with AsyncSessionLocal() as db:
        await db.execute(
            update(SkinAnalysis)
            .where(SkinAnalysis.id == uuid.UUID(mine))
            .values(created_at=datetime.now(timezone.utc) - timedelta(hours=2))
        )
        await db.commit()
    stale = await client.post(
        QUIZ, json={"answers": answers, "analysisId": mine}, headers=consented["headers"]
    )
    assert stale.status_code == 422
    assert "오래" in stale.json()["detail"]


async def test_analysis_images_are_saved_and_served_to_the_owner_only(
    client: AsyncClient, consented, user
) -> None:
    made = (await _analyze(client, consented)).json()
    assert {"oiliness", "moisture", "redness", "age_spot", "acne"} <= set(made["images"])
    assert "skin_type" not in made["images"]

    aid, h = made["analysisId"], consented["headers"]
    res = await client.get(f"{ANALYZE}/{aid}/images/oiliness", headers=h)
    assert res.status_code == 200
    assert res.headers["content-type"] == "image/png"
    assert res.content.startswith(b"\x89PNG")
    assert "private" in res.headers["cache-control"]

    # 이력·최근 분석에도 키가 실린다.
    assert (await client.get(f"{ANALYZE}/latest", headers=h)).json()["images"] == made["images"]
    assert (await client.get(ANALYZE, headers=h)).json()[0]["images"] == made["images"]

    # 남의 분석 / 로그인 없음 / 없는 키 / 경로 탈출 시도는 모두 막힌다.
    assert (await client.get(f"{ANALYZE}/{aid}/images/oiliness", headers=user["headers"])).status_code == 404
    assert (await client.get(f"{ANALYZE}/{aid}/images/oiliness")).status_code == 401
    assert (await client.get(f"{ANALYZE}/{aid}/images/nope", headers=h)).status_code == 404
    assert (await client.get(f"{ANALYZE}/{aid}/images/..%2F..%2Fetc", headers=h)).status_code == 404


async def test_withdrawing_consent_keeps_past_results_and_images(
    client: AsyncClient, consented
) -> None:
    h = consented["headers"]
    made = (await _analyze(client, consented)).json()
    assert made["images"]

    res = await client.put(f"{ME}/consents/face-photo", json={"agreed": False}, headers=h)
    assert res.status_code == 200
    latest = (await client.get(f"{ANALYZE}/latest", headers=h)).json()
    assert latest["images"] == made["images"]        # 지난 결과의 이미지는 그대로
    assert latest["axes"] == made["axes"] and latest["concerns"]
    kept = await client.get(f"{ANALYZE}/{made['analysisId']}/images/oiliness", headers=h)
    assert kept.status_code == 200

    # 새 분석은 막힌다.
    assert (await _analyze(client, consented)).status_code == 403


async def test_deleting_the_account_deletes_the_image_rows(client: AsyncClient) -> None:
    acc = await _signup(client, face_consent=True)
    made = (await _analyze(client, acc)).json()
    assert made["images"]
    async with AsyncSessionLocal() as db:
        n = await db.scalar(select(func.count()).select_from(SkinAnalysisImage).where(SkinAnalysisImage.user_id == acc["id"]))
    assert n == len(made["images"])

    res = await client.delete(ME, headers=acc["headers"])
    assert res.status_code == 204, res.text
    async with AsyncSessionLocal() as db:
        n = await db.scalar(select(func.count()).select_from(SkinAnalysisImage).where(SkinAnalysisImage.user_id == acc["id"]))
    assert n == 0


async def test_analysis_still_succeeds_when_no_image_can_be_downloaded(
    client: AsyncClient, consented, monkeypatch
) -> None:
    async def _none(*_a, **_k):
        return {}

    monkeypatch.setattr("app.api.skin_photo.fetch_masks", _none)
    res = await _analyze(client, consented)
    assert res.status_code == 201, res.text
    assert res.json()["images"] == []


async def test_deleting_the_user_removes_every_photo_record(client: AsyncClient) -> None:
    acc = await _signup(client, face_consent=True)
    await client.post(f"{ME}/subscription", headers=acc["headers"])
    assert (await _analyze(client, acc)).status_code == 201
    await _cleanup(acc["email"])

    async with AsyncSessionLocal() as db:
        for model in (SkinAnalysis, SkinAnalysisImage, Subscription):
            rows = await db.scalars(select(model).where(model.user_id == acc["id"]))
            assert rows.all() == []
