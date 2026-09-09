"""테스트 공용 설정.

**공용 Neon DB에 읽기 전용으로 붙는다.** 별도 테스트 DB를 세우는 비용이
이 프로젝트 규모에 맞지 않고, 이미 4,150건의 실데이터가 있어 그대로 쓰는
편이 낫다. 대신 행 수처럼 변하는 값에 의존하지 않고 **불변식만 검증한다**
— 정렬 순서, 필터 일관성, 응답 계약, 필수 필드 존재 여부.

쓰기 테스트를 추가할 때는 이 전제가 깨진다. 그때는 Neon 브랜치를
따로 만들어 DATABASE_DSN을 갈아끼우는 방식으로 가야 한다.

⚠️ 이벤트 루프 스코프
    app.db.session의 엔진은 import 시점에 만들어지고, asyncpg 커넥션 풀은
    처음 사용한 이벤트 루프에 묶인다. pytest-asyncio 기본값(테스트마다
    새 루프)으로 두면 두 번째 테스트부터 "Task attached to a different
    loop"로 깨진다. 그래서 픽스처와 테스트를 모두 session 루프에 태운다
    (test_products.py 상단의 pytestmark).
"""
from __future__ import annotations

import sys
from collections.abc import AsyncGenerator
from pathlib import Path

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.session import engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def client() -> AsyncGenerator[AsyncClient, None]:
    """ASGI 직통 클라이언트. 서버를 띄우지 않고 앱을 그대로 호출한다."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c
    # 풀을 정리하지 않으면 루프가 닫힐 때 미완 코루틴 경고가 남는다
    await engine.dispose()
