"""얼굴 사진 분석 — 허용 계정 외에는 저장된 분석 결과로 대신한다.

Perfect Corp 호출은 한 번에 유닛 12~14개가 나가서, 앱을 받은 누구나 부르게 둘 수 없다. 그래서
**허용 계정**(`SKIN_ANALYSIS_ALLOWED_EMAILS`)만 실제로 부르고, 나머지 계정은 외부 호출 없이
`SKIN_SAMPLE_EMAIL` 계정에 저장돼 있는 가장 최근 분석 결과를 자기 분석으로 받는다.

- 사진은 평소처럼 받아 정리·얼굴 검증까지 하지만(서버 안에서만 도는 검사), 외부로 보내지 않고 저장하지도 않는다.
- 점수·분류는 표본 분석에서 복사한다. 사용자의 무료/구독 항목 수(`quota.concerns`)를 넘는 항목은 뺀다.
- 구독자는 16항목을 받는다. 표본에 없는 항목은 가짜 점수·가짜 이미지로 채운다(표본의 8항목은 실제 값).
- 분석 이미지(약 2.4MB)는 복사하지 않는다. 새 행의 `metrics.sample_of`가 원본 분석을 가리키고, 이미지는 거기서 읽는다.
- 이용 한도·동의는 실호출과 똑같이 적용한다(화면 동작이 같아야 시연이 자연스럽다).
- 표본 계정에 분석이 없으면 None — 호출하는 쪽이 503을 내고, 화면은 QnA 진단으로 이어 간다.
"""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.skin_photo import SkinAnalysis
from app.models.user import User
from app.services.skin_photo import mock_masks, mock_output, parse_output
from app.services.skin_quota import BASIC_CONCERNS, EXTENDED_CONCERNS, Quota

SAMPLE_MODE = "sample"


def _emails(raw: str) -> set[str]:
    return {e.strip().lower() for e in raw.split(",") if e.strip()}


def live_analysis_allowed(user: User) -> bool:
    """이 계정이 Perfect Corp을 실제로 부를 수 있는가."""
    return user.email.lower() in _emails(settings.SKIN_ANALYSIS_ALLOWED_EMAILS)


async def find_sample(db: AsyncSession) -> SkinAnalysis | None:
    """표본 계정의 가장 최근 분석. 표본이 다시 표본인 행(sample_of)은 제외한다 — 이미지가 있는 원본만."""
    email = settings.SKIN_SAMPLE_EMAIL.strip().lower()
    if not email:
        return None
    rows = await db.scalars(
        select(SkinAnalysis)
        .join(User, User.id == SkinAnalysis.user_id)
        .where(User.email == email)
        .order_by(SkinAnalysis.created_at.desc())
        .limit(10)
    )
    for row in rows:
        if "sample_of" not in row.metrics:
            return row
    return None


def sample_metrics(source: SkinAnalysis, quota: Quota) -> tuple[dict[str, Any], str, dict[str, bytes]]:
    """표본의 점수를 이 사용자의 항목 수에 맞춰 복사한다. (metrics, concern_set, 가짜 이미지).

    구독자는 16항목을 받아야 하는데 표본이 8항목뿐일 수 있다. 표본에 있는 항목은 실제 분석값·이미지를
    그대로 쓰고, 없는 항목만 저장해 둔 가짜 응답(MOCK)의 점수와 가짜 이미지로 채운다.
    가짜 이미지는 새 분석 행에 저장된다(실제 이미지는 복사하지 않고 원본에서 읽는다).
    """
    m = source.metrics
    extended = quota.extended
    keep = set(EXTENDED_CONCERNS if extended else BASIC_CONCERNS)
    concerns = {k: v for k, v in m.get("concerns", {}).items() if k in keep}
    images = [k for k in m.get("images", []) if k in keep]
    fake: dict[str, bytes] = {}
    if extended:
        missing = tuple(k for k in EXTENDED_CONCERNS if k not in concerns and k != "skin_type")
        if missing:
            parsed = parse_output(mock_output(missing))
            for k, v in parsed["concerns"].items():
                concerns.setdefault(k, v)
            fake = mock_masks(tuple(k for k in missing if k in concerns))
            images += [k for k in fake if k not in images]
    metrics = {
        "axes": m["axes"],
        "skin_types": m.get("skin_types", {}),
        "concerns": concerns,
        "images": images,
        "sample_of": str(source.id),
    }
    return metrics, "extended" if extended else "basic", fake


def image_source_id(row: SkinAnalysis) -> uuid.UUID:
    """이 분석의 이미지가 실제로 저장된 분석 id (표본이면 원본)."""
    src = row.metrics.get("sample_of")
    if src:
        try:
            return uuid.UUID(src)
        except ValueError:
            pass
    return row.id
