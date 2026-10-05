"""호출 제한 — 비용이 드는 API(LLM 챗봇)의 비회원 남용 방지.

앱 화면의 횟수 제한은 기기(localStorage)에서 세므로 시크릿 창이나 직접 호출로
얼마든지 넘을 수 있다. 실제 차단은 서버가 Redis로 센다.

Redis가 죽어 있으면 **통과시킨다**(fail-open). 캐시 헬퍼와 같은 원칙 — 캐시 장애가
서비스를 막으면 안 된다. 그 사이에는 제한이 풀린다는 것을 감수한다.
"""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import Request

from app.config import settings
from app.core.cache import cache_incr

SEOUL_TZ = ZoneInfo("Asia/Seoul")
DAY_SECONDS = 60 * 60 * 24


def client_ip(request: Request) -> str:
    """요청한 사람의 IP.

    프록시·로드밸런서 뒤에 두면 `request.client.host`가 전부 프록시 주소가 된다 —
    그러면 비회원 전체가 한 한도를 나눠 쓴다. 그때는 `TRUST_PROXY_HEADERS=true`로
    `X-Forwarded-For`의 첫 주소를 쓴다. 기본은 끈다: 프록시 없이 이 헤더를 믿으면
    누구나 헤더를 바꿔 제한을 피할 수 있다.
    """
    if settings.TRUST_PROXY_HEADERS:
        forwarded = request.headers.get("x-forwarded-for", "")
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    return request.client.host if request.client else "unknown"


async def allow_daily(name: str, who: str, limit: int) -> bool:
    """오늘(서울 날짜) `who`가 `name`을 `limit`번 넘게 불렀으면 False."""
    day = datetime.now(SEOUL_TZ).strftime("%Y%m%d")
    count = await cache_incr(f"rl:{name}:{who}:{day}", DAY_SECONDS)
    return count is None or count <= limit
