"""인증 API 계약 테스트 (Task 12).

이 파일은 **DB·Redis 없이 도는 쪽**(tests/unit)이다. DB가 필요한 테스트는 `tests/integration/test_auth.py`에 있다.

**저장소에서 DB에 쓰는 첫 테스트다.** conftest.py가 적어 둔 대로 이 테스트
모음은 공용 Neon에 읽기 전용으로 붙는다는 전제를 깬다. 그래서 두 가지를
지킨다.

  1. 매번 새 이메일(`pytest-<uuid>@example.com`)로만 계정을 만든다.
     example.com은 RFC 2606이 문서·예제용으로 예약한 도메인이라 실재 주소와
     겹치지 않는다. `.invalid`가 더 분명하지만 email-validator가 특수용도
     TLD라며 거부해서 쓸 수 없다.
  2. 만든 계정은 픽스처가 끝날 때 반드시 지운다. refresh_tokens·profiles는
     FK가 ON DELETE CASCADE라 함께 사라진다.

시드 계정(eunseong@swappy.app 등)은 **읽기만 한다.** 그쪽 비밀번호를 바꾸는
테스트를 넣으면 다른 팀원의 로컬 로그인이 깨진다.
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio(loop_scope="session")

AUTH = "/api/v1/auth"
ME = "/api/v1/me"
PASSWORD = "swappy1234"


@pytest.mark.parametrize(
    "payload",
    [
        {"email": "not-an-email", "password": PASSWORD},
        {"email": "ok@example.com", "password": "1234"},          # 8자 미만
        {"email": "ok@example.com", "password": "a" * 73},        # bcrypt 상한 초과
    ],
)
async def test_signup_validates_input(client: AsyncClient, payload: dict) -> None:
    """bcrypt 상한(72바이트)을 422로 막는다. 안 막으면 해싱이 500으로 터진다."""
    assert (await client.post(f"{AUTH}/signup", json=payload)).status_code == 422


async def test_me_requires_token(client: AsyncClient) -> None:
    res = await client.get(ME)
    assert res.status_code == 401
    assert res.headers.get("WWW-Authenticate") == "Bearer"


async def test_password_change_requires_token(client: AsyncClient) -> None:
    res = await client.post(
        f"{AUTH}/password",
        json={"currentPassword": PASSWORD, "newPassword": "brandnew1234"},
    )
    assert res.status_code == 401
