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
