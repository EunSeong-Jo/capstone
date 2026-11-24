"""얼굴 사진 AI 피부 분석 API — 동의·구독·한도·분석·진단 혼합.

이 파일은 **DB·Redis 없이 도는 쪽**(tests/unit)이다. DB가 필요한 테스트는 `tests/integration/test_skin_photo_api.py`에 있다.

Perfect Corp 호출은 하지 않는다(`PERFECT_CORP_MOCK` 또는 함수 대체). 얼굴 사전 필터도
대체한다 — 합성 이미지로는 실제 얼굴 검출을 통과시킬 수 없고, 검출기 자체는
`test_skin_photo_unit.py`가 본다. 여기서는 그 앞뒤의 **계약**(상태 코드, 한도 차감
시점, 점수 혼합)을 본다.

⚠️ 쓰기 테스트다. 계정은 테스트마다 만들고 지우며, 분석·구독·동의 행은 사용자
삭제(CASCADE)로 함께 정리된다.
"""
from __future__ import annotations
import uuid
from datetime import datetime, timezone

import pytest
from httpx import AsyncClient

from app.config import settings

pytestmark = pytest.mark.asyncio(loop_scope="session")
ME = "/api/v1/me"
ANALYZE = "/api/v1/skin-analysis"


@pytest.fixture(autouse=True)
def mock_provider(monkeypatch):
    """모든 테스트가 실제 호출 없이 돈다. 사전 필터는 통과시킨다."""
    monkeypatch.setattr(settings, "PERFECT_CORP_MOCK", True)

    async def _pass(_photo):
        return None

    monkeypatch.setattr("app.api.skin_photo.check_face", _pass)
    # 기존 테스트는 실호출 경로(허용 계정)를 본다. 표본 경로는 아래 '허용 계정 외' 테스트가 따로 본다.
    monkeypatch.setattr("app.api.skin_photo.live_analysis_allowed", lambda _user: True)


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


def test_live_allowed_matches_email_case_insensitively(monkeypatch) -> None:
    from app.services.photo.skin_sample import live_analysis_allowed

    monkeypatch.setattr(settings, "SKIN_ANALYSIS_ALLOWED_EMAILS", " Capstone@Gmail.com , other@x.com ")
    ok = type("U", (), {"email": "capstone@gmail.com"})()
    no = type("U", (), {"email": "eunseong@swappy.app"})()
    assert live_analysis_allowed(ok) is True
    assert live_analysis_allowed(no) is False
    monkeypatch.setattr(settings, "SKIN_ANALYSIS_ALLOWED_EMAILS", "")
    assert live_analysis_allowed(ok) is False


def test_sample_metrics_trims_to_the_users_concern_set() -> None:
    from app.services.photo.skin_quota import BASIC_CONCERNS, EXTENDED_CONCERNS, Quota
    from app.services.photo.skin_sample import sample_metrics

    class Src:
        id = uuid.uuid4()
        concern_set = "extended"
        metrics = {
            "axes": {"oil": 5},
            "skin_types": {"whole": "Normal"},
            "concerns": {k: {"raw": 1.0, "ui": 50} for k in EXTENDED_CONCERNS if k != "skin_type"},
            "images": ["moisture", "firmness"],
        }

    now = datetime.now(timezone.utc)
    free = Quota(plan="free", allowance=1, used=0, resets_at=now, consent_granted=True)
    sub = Quota(plan="subscriber", allowance=4, used=0, resets_at=now, consent_granted=True)

    m, kind, fake = sample_metrics(Src, free)
    assert fake == {}
    assert kind == "basic" and set(m["concerns"]) <= set(BASIC_CONCERNS) and m["images"] == ["moisture"]
    assert m["sample_of"] == str(Src.id)
    m, kind, fake = sample_metrics(Src, sub)
    assert kind == "extended" and "firmness" in m["concerns"] and m["images"] == ["moisture", "firmness"]
    assert fake == {}

    # 표본이 8항목뿐이어도 구독자는 16항목 — 모자란 항목은 가짜 점수·가짜 이미지로 채운다
    class Basic:
        id = uuid.uuid4()
        concern_set = "basic"
        metrics = {
            "axes": {"oil": 5},
            "concerns": {k: {"raw": 1.0, "ui": 50} for k in BASIC_CONCERNS if k != "skin_type"},
            "images": ["moisture", "acne"],
        }

    m, kind, fake = sample_metrics(Basic, sub)
    assert kind == "extended" and set(EXTENDED_CONCERNS) - {"skin_type"} <= set(m["concerns"])
    assert m["concerns"]["moisture"] == {"raw": 1.0, "ui": 50}      # 실제 항목은 그대로
    assert set(fake) == set(m["images"]) - {"moisture", "acne"} and "firmness" in fake
    m, kind, fake = sample_metrics(Basic, free)
    assert kind == "basic" and fake == {} and m["images"] == ["moisture", "acne"]
