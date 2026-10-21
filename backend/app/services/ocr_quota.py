"""스캔(OCR) 호출 한도.

CLOVA OCR은 호출 수로 무료 한도가 정해진다. 스캔 API는 로그인을 요구하지만 가입이
열려 있어서, 로그인만으로는 앱을 받은 누구든 반복 호출하는 것을 막지 못한다.

정책
----
- 허용 계정(`OCR_ALLOWED_EMAILS`)은 한도에서 면제한다 — 시연 계정처럼 믿는 계정.
- 그 외는 하루(서울 날짜) 계정당 `OCR_USER_DAILY_LIMIT`회, 모든 계정을 합쳐
  `OCR_GLOBAL_DAILY_LIMIT`회까지. 가입을 여러 번 해도 전체 한도는 넘지 못한다.
- 한도를 넘으면 429. 화면(`pages/Scan`)이 제품명 검색을 안내한다.

카운터(Redis)를 읽지 못하면 **허용 계정 외에는 막는다**(`fail_open=False`). 챗봇과
반대로 잡은 이유는 `core/rate_limit.allow_daily`에 적어 두었다.
"""
from __future__ import annotations

from fastapi import HTTPException

from app.config import settings
from app.core.rate_limit import allow_daily
from app.models.user import User

QUOTA_EXCEEDED = "오늘 사진으로 찾기 횟수를 모두 썼어요. 제품명으로 찾아 주세요"


def _allowed_emails() -> set[str]:
    return {e.strip().lower() for e in settings.OCR_ALLOWED_EMAILS.split(",") if e.strip()}


async def check_scan_quota(user: User) -> None:
    """한도를 넘었으면 429. OCR을 부르기 **직전**에 호출한다.

    계정 한도를 먼저 본다 — 계정 한도를 넘은 사람의 요청이 전체 카운터를 소모하면
    다른 사람이 쓸 수 있는 횟수가 줄어든다.
    """
    if user.email.lower() in _allowed_emails():
        return
    if not await allow_daily(
        "scan_user", str(user.id), settings.OCR_USER_DAILY_LIMIT, fail_open=False
    ) or not await allow_daily(
        "scan_global", "all", settings.OCR_GLOBAL_DAILY_LIMIT, fail_open=False
    ):
        raise HTTPException(status_code=429, detail=QUOTA_EXCEEDED)
