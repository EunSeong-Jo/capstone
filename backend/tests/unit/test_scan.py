"""사진으로 화장품 찾기 (`POST /api/v1/products/scan`).

이 파일은 **DB·Redis 없이 도는 쪽**(tests/unit)이다. DB가 필요한 테스트는 `tests/integration/test_scan.py`에 있다.

실제 CLOVA OCR 호출은 외부 의존성(유료 API)이라 테스트에서 하지 않는다.
OCR 결과를 대신 넣고, 그 뒤의 계약(후보·빈 결과·오류 코드)만 본다.
OCR 정확도 자체는 `research/image-match/eval_real_photos.py`가 실사진으로 잰다.
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio(loop_scope="session")

URL = "/api/v1/products/scan"

# 1×1 JPEG. 내용은 상관없다 — OCR을 대신 넣는다.
TINY_JPEG = (
    "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP////////////////////////////////"
    "//////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAA"
    "AAAAAP/aAAgBAQABPxA="
)


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


async def test_scan_requires_login(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """비회원은 쓸 수 없다 — OCR은 호출 수로 과금·한도가 정해진다."""
    _fake_ocr(monkeypatch, ["라운드랩 토너"])
    res = await client.post(URL, json={"image": TINY_JPEG})
    assert res.status_code == 401
