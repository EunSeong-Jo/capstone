"""사진으로 화장품 찾기 (`POST /api/v1/products/scan`).

실제 CLOVA OCR 호출은 외부 의존성(유료 API)이라 테스트에서 하지 않는다.
OCR 결과를 대신 넣고, 그 뒤의 계약(후보·빈 결과·오류 코드)만 본다.
OCR 정확도 자체는 `scripts/eval_real_photos.py`가 실사진으로 잰다.
"""
from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import delete

from app.db.session import AsyncSessionLocal
from app.models.user import User

pytestmark = pytest.mark.asyncio(loop_scope="session")

URL = "/api/v1/products/scan"

# 1×1 JPEG. 내용은 상관없다 — OCR을 대신 넣는다.
TINY_JPEG = (
    "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP////////////////////////////////"
    "//////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAA"
    "AAAAAP/aAAgBAQABPxA="
)


@pytest_asyncio.fixture(loop_scope="session")
async def auth(client: AsyncClient):
    """스캔은 로그인한 사용자만 쓴다. 테스트마다 계정을 만들고 지운다."""
    email = f"pytest-{uuid.uuid4().hex[:12]}@example.com"
    res = await client.post(
        "/api/v1/auth/signup", json={"email": email, "password": "pytest-pass-1234", "nickname": "테스트"}
    )
    assert res.status_code == 201, res.text
    yield {"Authorization": f"Bearer {res.json()['accessToken']}"}
    async with AsyncSessionLocal() as db:
        await db.execute(delete(User).where(User.email == email))
        await db.commit()


@pytest.fixture(autouse=True)
def counters(monkeypatch: pytest.MonkeyPatch) -> dict[str, int]:
    """호출 한도 카운터를 메모리로 대신한다.

    실제 Redis를 쓰면 하루 전체 한도(`OCR_GLOBAL_DAILY_LIMIT`)가 테스트 실행 사이에
    이어져서, 하루에 몇 번 돌리면 한도 테스트가 아닌 테스트까지 429로 깨진다.
    """
    store: dict[str, int] = {}

    async def _incr(key: str, _ttl: int) -> int:
        store[key] = store.get(key, 0) + 1
        return store[key]

    monkeypatch.setattr("app.core.rate_limit.cache_incr", _incr)
    return store


def _fake_ocr(monkeypatch: pytest.MonkeyPatch, fields: list[str]) -> None:
    async def _recognize(_image: bytes, _content_type: str) -> list[str]:
        return fields

    monkeypatch.setattr("app.api.products.recognize_text", _recognize)


async def test_scan_returns_candidates_from_recognized_text(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch, auth: dict
) -> None:
    """앞면 글자(브랜드 포함 통짜)로 그 제품이 후보 1위에 온다."""
    _fake_ocr(monkeypatch, ["ROUND LAB", "라운드랩", "소나무", "진정", "시카", "토너"])
    res = await client.post(URL, json={"image": TINY_JPEG}, headers=auth)
    assert res.status_code == 200, res.text
    body = res.json()
    assert "라운드랩" in body["text"]
    assert body["candidates"], "후보가 있어야 한다"
    assert "소나무" in body["candidates"][0]["product"]["name"]
    assert body["candidates"][0]["signals"]["text"]["score"] > 0


async def test_scan_without_text_has_no_candidates(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch, auth: dict
) -> None:
    """글자를 못 읽으면 빈 후보 — 화면이 제품명 검색으로 안내한다."""
    _fake_ocr(monkeypatch, [])
    body = (await client.post(URL, json={"image": TINY_JPEG}, headers=auth)).json()
    assert body == {"text": "", "candidates": []}


async def test_scan_limit(client: AsyncClient, monkeypatch: pytest.MonkeyPatch, auth: dict) -> None:
    _fake_ocr(monkeypatch, ["라운드랩 토너"])
    body = (await client.post(URL, json={"image": TINY_JPEG, "limit": 2}, headers=auth)).json()
    assert len(body["candidates"]) <= 2


async def test_scan_rejects_non_image(client: AsyncClient, auth: dict) -> None:
    res = await client.post(URL, json={"image": "not-an-image"}, headers=auth)
    assert res.status_code == 422


async def test_scan_without_ocr_key_is_503(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch, auth: dict
) -> None:
    """키가 없으면 500이 아니라 원인이 드러나는 503 — 화면은 제품명 검색으로 안내한다."""
    monkeypatch.setattr("app.services.ocr.settings.CLOVA_OCR_SECRET", "")
    res = await client.post(URL, json={"image": TINY_JPEG}, headers=auth)
    assert res.status_code == 503
    assert "CLOVA_OCR" in res.json()["detail"]


async def test_scan_requires_login(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """비회원은 쓸 수 없다 — OCR은 호출 수로 과금·한도가 정해진다."""
    _fake_ocr(monkeypatch, ["라운드랩 토너"])
    res = await client.post(URL, json={"image": TINY_JPEG})
    assert res.status_code == 401


# ── 호출 한도 (services/ocr_quota.py) ─────────────────────────


async def _scan(client: AsyncClient, headers: dict) -> int:
    return (await client.post(URL, json={"image": TINY_JPEG}, headers=headers)).status_code


async def test_scan_over_user_limit_is_429(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch, auth: dict
) -> None:
    """계정당 하루 한도를 넘으면 429 — 화면이 제품명 검색을 안내한다."""
    _fake_ocr(monkeypatch, ["라운드랩 토너"])
    monkeypatch.setattr("app.services.ocr_quota.settings.OCR_USER_DAILY_LIMIT", 2)
    monkeypatch.setattr("app.services.ocr_quota.settings.OCR_GLOBAL_DAILY_LIMIT", 100)
    assert [await _scan(client, auth) for _ in range(2)] == [200, 200]
    res = await client.post(URL, json={"image": TINY_JPEG}, headers=auth)
    assert res.status_code == 429
    assert "제품명" in res.json()["detail"]


async def test_scan_over_global_limit_is_429(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch, auth: dict
) -> None:
    """가입을 여러 번 해도 전체 한도는 못 넘는다 — 무료 한도를 지키는 게 이 장치의 목적."""
    _fake_ocr(monkeypatch, ["라운드랩 토너"])
    monkeypatch.setattr("app.services.ocr_quota.settings.OCR_USER_DAILY_LIMIT", 10)
    monkeypatch.setattr("app.services.ocr_quota.settings.OCR_GLOBAL_DAILY_LIMIT", 1)
    assert await _scan(client, auth) == 200
    assert await _scan(client, auth) == 429


async def test_allowed_account_is_exempt(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch, auth: dict, counters: dict
) -> None:
    """허용 계정은 한도에서 면제 — 대소문자·공백이 달라도 같은 계정으로 본다."""
    _fake_ocr(monkeypatch, ["라운드랩 토너"])
    me = (await client.get("/api/v1/me", headers=auth)).json()
    monkeypatch.setattr(
        "app.services.ocr_quota.settings.OCR_ALLOWED_EMAILS",
        f" other@example.com , {me['email'].upper()} ",
    )
    monkeypatch.setattr("app.services.ocr_quota.settings.OCR_USER_DAILY_LIMIT", 1)
    monkeypatch.setattr("app.services.ocr_quota.settings.OCR_GLOBAL_DAILY_LIMIT", 1)
    assert [await _scan(client, auth) for _ in range(3)] == [200, 200, 200]
    assert not counters, "면제 계정은 카운터를 소모하지 않아야 한다"


async def test_over_user_limit_does_not_use_global_counter(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch, auth: dict, counters: dict
) -> None:
    """계정 한도를 넘은 요청이 전체 카운터를 소모하면 다른 사람의 횟수가 줄어든다."""
    _fake_ocr(monkeypatch, ["라운드랩 토너"])
    monkeypatch.setattr("app.services.ocr_quota.settings.OCR_USER_DAILY_LIMIT", 1)
    monkeypatch.setattr("app.services.ocr_quota.settings.OCR_GLOBAL_DAILY_LIMIT", 100)
    await _scan(client, auth)
    await _scan(client, auth)  # 429
    await _scan(client, auth)  # 429
    glob = next(v for k, v in counters.items() if k.startswith("rl:scan_global:"))
    assert glob == 1


async def test_counter_down_blocks_non_allowed_account(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch, auth: dict
) -> None:
    """Redis를 못 읽으면 막는다(fail-closed) — 풀어 두면 무료 한도를 한꺼번에 쓴다."""
    _fake_ocr(monkeypatch, ["라운드랩 토너"])

    async def _down(_key: str, _ttl: int) -> None:
        return None

    monkeypatch.setattr("app.core.rate_limit.cache_incr", _down)
    assert await _scan(client, auth) == 429


async def test_invalid_image_does_not_use_quota(
    client: AsyncClient, auth: dict, counters: dict
) -> None:
    """422는 OCR을 부르지 않았으니 한도를 쓰지 않는다."""
    res = await client.post(URL, json={"image": "not-an-image"}, headers=auth)
    assert res.status_code == 422
    assert not counters
