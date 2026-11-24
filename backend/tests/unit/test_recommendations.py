"""대체품 API 계약 테스트.

이 파일은 **DB·Redis 없이 도는 쪽**(tests/unit)이다. DB가 필요한 테스트는 `tests/integration/test_recommendations.py`에 있다.

계산 로직은 test_similarity.py가 DB 없이 검증한다. 여기서는 **엔드포인트가
지켜야 할 약속**만 본다.

similarities는 단일제품(composition='single')에만 적재된다. 기획세트·굿즈
동봉 제품에는 영영 대체품이 없다. 그래서 이 파일은 "결과가 몇 개 나온다"에
기대지 않는다 — 대신 **비어 있어도 200이고 모양이 같다**는 쪽을 못박는다.
프론트가 그 계약에 기대어 '준비 중' 자리표시자를 띄우기 때문이다.
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio(loop_scope="session")

LIST = "/api/v1/products"


def _url(product_id: int) -> str:
    return f"{LIST}/{product_id}/similar"


async def test_limit_above_max_is_422(client: AsyncClient) -> None:
    """배치가 제품당 20개만 적재한다. 더 달라는 요청은 막는다."""
    assert (await client.get(_url(1), params={"limit": 21})).status_code == 422
    assert (await client.get(_url(1), params={"limit": 0})).status_code == 422


async def test_unknown_method_is_422(client: AsyncClient) -> None:
    res = await client.get(_url(1), params={"method": "cosine"})
    assert res.status_code == 422
