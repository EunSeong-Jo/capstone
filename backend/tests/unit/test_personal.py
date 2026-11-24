"""개인 데이터 API 계약 테스트 (Phase 2).

이 파일은 **DB·Redis 없이 도는 쪽**(tests/unit)이다. DB가 필요한 테스트는 `tests/integration/test_personal.py`에 있다.

`test_auth.py`와 같은 규칙을 따른다 — 매번 새 계정을 만들고 끝나면 지운다.
개인 데이터는 전부 `user_id` FK에 ON DELETE CASCADE라 계정 하나만 지우면
화장대·장바구니·주문·후기·포인트가 함께 사라진다.

이 테스트 모음이 지키는 가장 중요한 불변식은 **없는 제품은 들어갈 수 없다**는
것이다. 이 도메인이 localStorage에서 서버로 온 이유가 그것이기 때문이다 —
예전에는 가짜 제품 id(102·960001)가 그대로 저장돼 화면이 엉뚱한 상세를 열었다.
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio(loop_scope="session")
ME = "/api/v1/me"
ORDERS = "/api/v1/orders"


# ── 인증 ──────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "method,path",
    [
        ("get", f"{ME}/closet"),
        ("get", f"{ME}/cart"),
        ("get", f"{ME}/likes"),
        ("get", f"{ME}/orders"),
        ("get", f"{ME}/points"),
        ("get", f"{ME}/stats"),
        ("post", ORDERS),
    ],
)
async def test_personal_endpoints_require_login(
    client: AsyncClient, method: str, path: str
) -> None:
    """개인 데이터는 토큰 없이 새면 안 된다."""
    res = await getattr(client, method)(path)
    assert res.status_code == 401


# ── 알림 ──────────────────────────────────────────────────────

NOTI = f"{ME}/notifications"


async def test_notifications_require_auth(client: AsyncClient) -> None:
    assert (await client.get(NOTI)).status_code == 401
    assert (await client.post(f"{NOTI}/seen")).status_code == 401
