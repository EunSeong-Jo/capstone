"""얼굴 사진 AI 피부 분석 스키마."""
from __future__ import annotations

import uuid
from datetime import datetime

from app.schemas.product import _CamelModel


class ConsentIn(_CamelModel):
    agreed: bool


class ConsentOut(_CamelModel):
    # 지금 문구(version) 기준으로 유효한 동의가 있는가. 문구 버전이 바뀌었으면
    # 옛 동의는 False로 본다.
    granted: bool
    # 서버가 현재 받고 있는 문구 버전. 화면이 같은 버전의 문구를 보여 준다.
    current_version: str
    agreed_at: datetime | None = None


class SubscriptionOut(_CamelModel):
    # 지금 구독자로 대우받는가(해지했어도 기간이 남았으면 True).
    active: bool
    plan: str | None = None
    status: str | None = None          # active / cancelled
    current_period_start: datetime | None = None
    current_period_end: datetime | None = None
    # 결제가 붙어 있지 않다는 사실을 화면이 숨기지 않도록 응답에 싣는다.
    demo: bool = True


class QuotaOut(_CamelModel):
    plan: str                          # free / subscriber
    allowance: int                     # 이번 달 허용 횟수 (동의가 없으면 0)
    used: int
    remaining: int
    resets_at: datetime                # 다음 달 1일 0시(서울)
    consent_granted: bool
    # 이 등급이 받는 분석 항목 수. 구독자는 확장 12개.
    concern_count: int
    extended: bool


class AxesOut(_CamelModel):
    moisture: int
    oil: int
    sensitivity: int
    pigmentation: int
    trouble: int


class ConcernOut(_CamelModel):
    """결과 화면에 그리는 항목 하나. score는 **높을수록 좋다**(Perfect Corp 기준 0~100)."""

    key: str                           # oiliness / moisture / ... (SD 이름)
    score: int


class SkinTypesOut(_CamelModel):
    whole: str | None = None
    t_zone: str | None = None
    u_zone: str | None = None


class AnalysisOut(_CamelModel):
    analysis_id: uuid.UUID
    created_at: datetime
    # 진단에 섞이는 5축 점수(0~10, 높을수록 그 성향이 강함)
    axes: AxesOut
    skin_types: SkinTypesOut
    # 표시용 항목 전체(5축 재료 + 모공·주름 + 구독자 확장 4개)
    concerns: list[ConcernOut]
    extended: bool
    # 이번 분석 뒤 남은 횟수. 조회(GET latest)에서는 None.
    remaining: int | None = None


class AnalysisIn(_CamelModel):
    # data URL — 후기 사진·스캔과 같은 방식(services/review_photos.decode_photo).
    image: str
