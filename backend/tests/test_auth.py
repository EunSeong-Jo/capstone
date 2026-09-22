"""인증 API 계약 테스트 (Task 12).

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

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import delete

from app.db.session import AsyncSessionLocal
from app.models.user import User

pytestmark = pytest.mark.asyncio(loop_scope="session")

AUTH = "/api/v1/auth"
ME = "/api/v1/me"
PASSWORD = "swappy1234"


@pytest_asyncio.fixture(loop_scope="session")
async def fresh_account(client: AsyncClient):
    """가입까지 끝낸 계정 하나. 끝나면 DB에서 지운다."""
    email = f"pytest-{uuid.uuid4().hex[:12]}@example.com"
    res = await client.post(
        f"{AUTH}/signup",
        json={"email": email, "password": PASSWORD, "nickname": "테스트"},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    yield body

    # id로 지운다. 이메일 변경 테스트가 있어서 email로 찾으면 못 찾고
    # 공용 DB에 고아 계정이 남는다.
    async with AsyncSessionLocal() as db:
        await db.execute(delete(User).where(User.id == uuid.UUID(body["user"]["id"])))
        await db.commit()


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def test_signup_returns_tokens_and_user(fresh_account) -> None:
    body = fresh_account
    assert body["accessToken"] and body["refreshToken"]
    # 프론트가 만료 시각을 직접 계산하지 않도록 남은 초로 준다.
    assert body["accessExpiresIn"] > 0
    assert body["user"]["provider"] == "local"
    # 진단 전이므로 피부타입은 아직 없다. 여기에 기본값을 채우면 화면이
    # 진단하지 않은 사용자에게 "당신은 옹달샘"이라고 말하게 된다.
    assert body["user"]["skinType"] is None


async def test_signup_never_leaks_password(fresh_account) -> None:
    assert "password" not in fresh_account["user"]
    assert "passwordHash" not in fresh_account["user"]
    assert "password_hash" not in fresh_account["user"]


async def test_signup_rejects_duplicate_email(client: AsyncClient, fresh_account) -> None:
    res = await client.post(
        f"{AUTH}/signup",
        json={"email": fresh_account["user"]["email"], "password": PASSWORD},
    )
    assert res.status_code == 409


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


async def test_login_succeeds(client: AsyncClient, fresh_account) -> None:
    res = await client.post(
        f"{AUTH}/login",
        json={"email": fresh_account["user"]["email"], "password": PASSWORD},
    )
    assert res.status_code == 200
    assert res.json()["user"]["id"] == fresh_account["user"]["id"]


async def test_login_hides_whether_account_exists(
    client: AsyncClient, fresh_account
) -> None:
    """없는 계정과 틀린 비밀번호가 구분되면 가입 여부를 알아낼 수 있다."""
    wrong_password = await client.post(
        f"{AUTH}/login",
        json={"email": fresh_account["user"]["email"], "password": "wrong-password"},
    )
    no_such_user = await client.post(
        f"{AUTH}/login",
        json={"email": f"nobody-{uuid.uuid4().hex}@example.com", "password": PASSWORD},
    )
    assert wrong_password.status_code == no_such_user.status_code == 401
    assert wrong_password.json()["detail"] == no_such_user.json()["detail"]


async def test_me_requires_token(client: AsyncClient) -> None:
    res = await client.get(ME)
    assert res.status_code == 401
    assert res.headers.get("WWW-Authenticate") == "Bearer"


async def test_me_rejects_garbage_and_refresh_tokens(
    client: AsyncClient, fresh_account
) -> None:
    """리프레시 토큰을 Authorization에 넣어도 통과하면 안 된다(typ 검사)."""
    for token in ("garbage", fresh_account["refreshToken"]):
        assert (await client.get(ME, headers=_auth(token))).status_code == 401


async def test_me_returns_account(client: AsyncClient, fresh_account) -> None:
    res = await client.get(ME, headers=_auth(fresh_account["accessToken"]))
    assert res.status_code == 200
    assert res.json()["email"] == fresh_account["user"]["email"]


async def test_refresh_rotates_and_kills_old_token(
    client: AsyncClient, fresh_account
) -> None:
    """회전 — 한 번 쓴 리프레시 토큰은 즉시 죽는다.

    회전하지 않으면 유출된 토큰이 14일 내내 유효하다.
    """
    old = fresh_account["refreshToken"]
    first = await client.post(f"{AUTH}/refresh", json={"refreshToken": old})
    assert first.status_code == 200
    assert first.json()["refreshToken"] != old

    replay = await client.post(f"{AUTH}/refresh", json={"refreshToken": old})
    assert replay.status_code == 401


async def test_logout_revokes_refresh_token(client: AsyncClient, fresh_account) -> None:
    token = fresh_account["refreshToken"]
    assert (await client.post(f"{AUTH}/logout", json={"refreshToken": token})).status_code == 204
    assert (await client.post(f"{AUTH}/refresh", json={"refreshToken": token})).status_code == 401


async def test_logout_is_quiet_about_unknown_tokens(client: AsyncClient) -> None:
    """있는 토큰인지 알려주지 않는다 — 존재 여부가 정보가 된다."""
    res = await client.post(f"{AUTH}/logout", json={"refreshToken": "never-existed"})
    assert res.status_code == 204


async def test_profile_roundtrip(client: AsyncClient, fresh_account) -> None:
    headers = _auth(fresh_account["accessToken"])

    empty = await client.get(f"{ME}/profile", headers=headers)
    assert empty.status_code == 200
    assert empty.json()["skinType"] is None

    updated = await client.patch(
        f"{ME}/profile",
        json={"skinType": "samak", "budgetMin": 10000, "budgetMax": 50000},
        headers=headers,
    )
    assert updated.status_code == 200
    assert updated.json()["skinType"] == "samak"

    # 부분 수정 — 보내지 않은 필드는 그대로 남는다.
    partial = await client.patch(f"{ME}/profile", json={"budgetMax": 60000}, headers=headers)
    assert partial.json()["skinType"] == "samak"
    assert partial.json()["budgetMax"] == 60000


async def test_profile_rejects_unknown_skin_type(client: AsyncClient, fresh_account) -> None:
    """8타입 밖의 코드가 들어가면 화면이 캐릭터를 못 찾아 깨진다."""
    res = await client.patch(
        f"{ME}/profile",
        json={"skinType": "not-a-type"},
        headers=_auth(fresh_account["accessToken"]),
    )
    assert res.status_code == 422


async def test_profile_rejects_inverted_budget(client: AsyncClient, fresh_account) -> None:
    """최소 > 최대면 구매 가이드(Task 15)가 영원히 빈 결과를 낸다."""
    headers = _auth(fresh_account["accessToken"])
    await client.patch(f"{ME}/profile", json={"budgetMax": 30000}, headers=headers)
    res = await client.patch(f"{ME}/profile", json={"budgetMin": 90000}, headers=headers)
    assert res.status_code == 422


async def test_nickname_update(client: AsyncClient, fresh_account) -> None:
    headers = _auth(fresh_account["accessToken"])
    res = await client.patch(ME, json={"nickname": "바뀐이름"}, headers=headers)
    assert res.status_code == 200
    assert res.json()["nickname"] == "바뀐이름"

    blank = await client.patch(ME, json={"nickname": "   "}, headers=headers)
    assert blank.status_code == 422


async def test_seeded_persona_can_log_in(client: AsyncClient) -> None:
    """scripts/seed_test_users.py가 넣은 계정으로 실제 로그인이 되는지.

    이 테스트가 깨지면 시드를 다시 돌려야 한다는 뜻이다. 프론트 데모 로그인이
    이 계정들에 걸려 있다.
    """
    res = await client.post(
        f"{AUTH}/login", json={"email": "eunseong@swappy.app", "password": PASSWORD}
    )
    assert res.status_code == 200, "seed_test_users.py를 실행했는지 확인하세요"
    assert res.json()["user"]["skinType"] == "ondalsam"


# ---------------------------------------------------------------- 비밀번호 변경


async def test_password_change_rejects_wrong_current(
    client: AsyncClient, fresh_account
) -> None:
    res = await client.post(
        f"{AUTH}/password",
        headers=_auth(fresh_account["accessToken"]),
        json={"currentPassword": "not-the-password", "newPassword": "brandnew1234"},
    )
    assert res.status_code == 401


async def test_password_change_rejects_same_password(
    client: AsyncClient, fresh_account
) -> None:
    res = await client.post(
        f"{AUTH}/password",
        headers=_auth(fresh_account["accessToken"]),
        json={"currentPassword": PASSWORD, "newPassword": PASSWORD},
    )
    assert res.status_code == 422


async def test_password_change_rejects_short_password(
    client: AsyncClient, fresh_account
) -> None:
    res = await client.post(
        f"{AUTH}/password",
        headers=_auth(fresh_account["accessToken"]),
        json={"currentPassword": PASSWORD, "newPassword": "short"},
    )
    assert res.status_code == 422


async def test_password_change_requires_token(client: AsyncClient) -> None:
    res = await client.post(
        f"{AUTH}/password",
        json={"currentPassword": PASSWORD, "newPassword": "brandnew1234"},
    )
    assert res.status_code == 401


async def test_password_change_swaps_credentials(
    client: AsyncClient, fresh_account
) -> None:
    email = fresh_account["user"]["email"]
    new_password = "brandnew1234"

    res = await client.post(
        f"{AUTH}/password",
        headers=_auth(fresh_account["accessToken"]),
        json={"currentPassword": PASSWORD, "newPassword": new_password},
    )
    assert res.status_code == 200, res.text

    old = await client.post(f"{AUTH}/login", json={"email": email, "password": PASSWORD})
    assert old.status_code == 401

    new = await client.post(
        f"{AUTH}/login", json={"email": email, "password": new_password}
    )
    assert new.status_code == 200


async def test_password_change_kills_other_sessions(
    client: AsyncClient, fresh_account
) -> None:
    """변경 전 리프레시 토큰은 죽고, 변경이 내준 것만 산다.

    이게 이 엔드포인트의 존재 이유다. 비밀번호를 바꾸는 이유는 대개 남이
    알고 있다고 의심해서인데, 그쪽이 받아 간 토큰이 14일 더 살아 있으면
    바꾼 의미가 없다.
    """
    stale_refresh = fresh_account["refreshToken"]

    res = await client.post(
        f"{AUTH}/password",
        headers=_auth(fresh_account["accessToken"]),
        json={"currentPassword": PASSWORD, "newPassword": "brandnew1234"},
    )
    assert res.status_code == 200
    issued = res.json()

    dead = await client.post(f"{AUTH}/refresh", json={"refreshToken": stale_refresh})
    assert dead.status_code == 401

    alive = await client.post(
        f"{AUTH}/refresh", json={"refreshToken": issued["refreshToken"]}
    )
    assert alive.status_code == 200


# ------------------------------------------------------------------ 이메일 변경


async def test_email_change_requires_current_password(
    client: AsyncClient, fresh_account
) -> None:
    res = await client.patch(
        ME,
        headers=_auth(fresh_account["accessToken"]),
        json={"email": f"moved-{uuid.uuid4().hex[:8]}@example.com"},
    )
    assert res.status_code == 401


async def test_email_change_rejects_wrong_password(
    client: AsyncClient, fresh_account
) -> None:
    res = await client.patch(
        ME,
        headers=_auth(fresh_account["accessToken"]),
        json={
            "email": f"moved-{uuid.uuid4().hex[:8]}@example.com",
            "currentPassword": "not-the-password",
        },
    )
    assert res.status_code == 401


async def test_email_change_moves_the_login_id(
    client: AsyncClient, fresh_account
) -> None:
    old_email = fresh_account["user"]["email"]
    new_email = f"moved-{uuid.uuid4().hex[:8]}@example.com"

    res = await client.patch(
        ME,
        headers=_auth(fresh_account["accessToken"]),
        json={"email": new_email, "currentPassword": PASSWORD},
    )
    assert res.status_code == 200, res.text
    assert res.json()["email"] == new_email

    moved = await client.post(
        f"{AUTH}/login", json={"email": new_email, "password": PASSWORD}
    )
    assert moved.status_code == 200

    gone = await client.post(
        f"{AUTH}/login", json={"email": old_email, "password": PASSWORD}
    )
    assert gone.status_code == 401


async def test_email_change_normalises_case(client: AsyncClient, fresh_account) -> None:
    new_email = f"Mixed-{uuid.uuid4().hex[:8]}@Example.COM"
    res = await client.patch(
        ME,
        headers=_auth(fresh_account["accessToken"]),
        json={"email": new_email, "currentPassword": PASSWORD},
    )
    assert res.status_code == 200
    assert res.json()["email"] == new_email.lower()


async def test_email_change_rejects_taken_address(
    client: AsyncClient, fresh_account
) -> None:
    res = await client.patch(
        ME,
        headers=_auth(fresh_account["accessToken"]),
        json={"email": "eunseong@swappy.app", "currentPassword": PASSWORD},
    )
    assert res.status_code == 409


async def test_nickname_update_needs_no_password(
    client: AsyncClient, fresh_account
) -> None:
    """이메일을 건드리지 않으면 비밀번호를 묻지 않는다."""
    res = await client.patch(
        ME,
        headers=_auth(fresh_account["accessToken"]),
        json={"nickname": "비번없이"},
    )
    assert res.status_code == 200
    assert res.json()["nickname"] == "비번없이"
