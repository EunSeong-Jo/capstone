"""DB_KEEPALIVE 설정이 엔진·기동 동작을 가르는지.

킵얼라이브(30초 SELECT 1)는 Neon이 유휴로 꺼지는 것을 막아 CU-hrs를 소모한다.
기본은 꺼 두고 pool_pre_ping으로 끊긴 연결을 거른다.
"""
from __future__ import annotations

from app.config import Settings
from app.db.session import engine


def test_keepalive_is_off_by_default() -> None:
    assert Settings(_env_file=None).DB_KEEPALIVE is False


def test_pre_ping_replaces_keepalive_by_default() -> None:
    # 테스트 환경에서 DB_KEEPALIVE를 따로 켜지 않았다면 pre_ping이 켜져 있어야 한다.
    from app.config import settings

    assert engine.pool._pre_ping is (not settings.DB_KEEPALIVE)
