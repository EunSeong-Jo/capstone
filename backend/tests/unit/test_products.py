"""제품 API 계약 테스트.

이 파일은 **DB·Redis 없이 도는 쪽**(tests/unit)이다. DB가 필요한 테스트는 `tests/integration/test_products.py`에 있다.

가장 중요한 것은 **프론트가 죽지 않는 조건**을 지키는지다.
ProductCardV는 `product.price.toLocaleString()`을 가드 없이 호출하므로
price가 하나라도 null이면 홈 화면이 통째로 죽는다.
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient

# 엔진의 커넥션 풀이 첫 루프에 묶이므로 전 테스트를 하나의 루프에서 돌린다.
# 자세한 이유는 conftest.py 참고.
pytestmark = pytest.mark.asyncio(loop_scope="session")

LIST = "/api/v1/products"
SEARCH = "/api/v1/products/search"
MATCH = "/api/v1/products/match"


async def test_size_limit_enforced(client: AsyncClient) -> None:
    assert (await client.get(LIST, params={"size": 101})).status_code == 422
    assert (await client.get(LIST, params={"page": 0})).status_code == 422


async def test_search_requires_two_chars(client: AsyncClient) -> None:
    assert (await client.get(SEARCH, params={"q": "토"})).status_code == 422
    assert (await client.get(SEARCH)).status_code == 422


async def test_search_whitespace_only_or_too_short_is_rejected(client: AsyncClient) -> None:
    assert (await client.get(SEARCH, params={"q": "  "})).status_code == 422
    assert (await client.get(SEARCH, params={"q": " 토"})).status_code == 422


# ── OCR 텍스트 매칭 ───────────────────────────────────────────


async def test_match_requires_two_chars(client: AsyncClient) -> None:
    assert (await client.get(MATCH, params={"q": "a"})).status_code == 422
