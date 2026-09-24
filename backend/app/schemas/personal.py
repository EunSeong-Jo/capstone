"""개인 데이터 스키마 (Phase 2).

응답에 **제품 정보를 함께 실어 보낸다.** 화장대 10개를 받은 프론트가
제품 상세를 10번 더 부르지 않도록 하기 위해서다. DB에는 FK만 두고(값을
복사하지 않고) 조인해서 내보내므로 가격이 바뀌면 다음 조회에 바로 반영된다.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import Field

from app.schemas.product import ProductOut, _CamelModel


class ClosetItemOut(_CamelModel):
    id: int
    product: ProductOut
    status: str
    added_via: str
    added_at: datetime


class ClosetItemIn(_CamelModel):
    product_id: int = Field(ge=1)
    # search / scan / chatbot / seed
    added_via: str = "search"
    status: str = "owned"


class CartLineOut(_CamelModel):
    id: int
    product: ProductOut
    qty: int


class CartOut(_CamelModel):
    lines: list[CartLineOut]
    count: int
    subtotal: int


class CartItemIn(_CamelModel):
    product_id: int = Field(ge=1)
    qty: int = Field(default=1, ge=1, le=99)


class QtyIn(_CamelModel):
    """0을 허용한다 — 0으로 바꾸는 것이 곧 삭제다(화면의 '−' 버튼)."""

    qty: int = Field(ge=0, le=99)


class ProductRefIn(_CamelModel):
    product_id: int = Field(ge=1)


class OrderItemOut(_CamelModel):
    id: int
    # 제품이 카탈로그에서 빠지면 None이다. 이름·가격은 행에 박제돼 있다.
    product_id: int | None = None
    product_name: str
    brand_name: str | None = None
    unit_price: int
    qty: int
    # 후기를 이미 썼는지. 주문내역 화면이 '후기 쓰기' 버튼을 정하는 데 쓴다.
    reviewed: bool = False


class OrderOut(_CamelModel):
    id: uuid.UUID
    total: int
    status: str
    placed_at: datetime
    items: list[OrderItemOut]


class FrequentItemOut(_CamelModel):
    """'자주 구매' 탭. 주문 기록에서 집계한다."""

    product: ProductOut
    purchase_count: int
    last_ordered_at: datetime


class ReviewIn(_CamelModel):
    order_item_id: int = Field(ge=1)
    rating: int = Field(ge=1, le=5)
    body: str | None = Field(default=None, max_length=1000)


class ReviewOut(_CamelModel):
    id: int
    product_id: int
    order_item_id: int
    rating: int
    body: str | None = None
    created_at: datetime


class PointTxOut(_CamelModel):
    id: int
    amount: int
    reason: str
    created_at: datetime


class PointsOut(_CamelModel):
    balance: int
    transactions: list[PointTxOut]


class ScanOut(_CamelModel):
    id: int
    product: ProductOut | None = None
    source: str
    created_at: datetime


class ScanIn(_CamelModel):
    product_id: int | None = Field(default=None, ge=1)
    source: str = "search"
    raw_text: str | None = None


class StatsOut(_CamelModel):
    """홈 대시보드·마이페이지 숫자.

    전부 실제 행에서 센다. 예전에는 이 자리에 `{saved: 128400, scans: 21,
    swaps: 9}` 같은 고정값이 박혀 있었다.

    **레벨·경험치도 기록에서 계산한다.** 클라이언트가 더해 나가지 않는다 —
    그러면 브라우저마다 값이 달라지고 조작도 된다. 근거가 되는 행동
    (스캔·후기·주문·선물)이 전부 테이블에 있으므로 셀 수 있다.
    """

    closet_count: int
    cart_count: int
    like_count: int
    order_count: int
    scan_count: int
    review_count: int
    gift_count: int
    # 실제로 결제한 총액. 주문 기록의 합이다.
    total_spent: int
    point_balance: int
    # 누적 경험치와 그로부터 나온 레벨. 계산식은 services/experience.py에 있다.
    exp: int
    level: int
    # 이번 레벨 안에서의 진행. 진행바가 exp_in_level / level_span을 그린다.
    exp_in_level: int
    level_span: int


class GiftIn(_CamelModel):
    """선물 보내기.

    받는 사람 연락처는 받지 않는다 — 전달 수단이 없어 쓰이지 않는데,
    쓰이지도 않는 제3자의 개인정보를 공용 DB에 쌓게 된다.
    """

    product_id: int = Field(ge=1)
    recipient_name: str = Field(min_length=1, max_length=30)
    message: str | None = Field(default=None, max_length=200)


class GiftOut(_CamelModel):
    id: uuid.UUID
    # 제품이 카탈로그에서 빠지면 None이다. 이름·가격은 행에 박제돼 있다.
    product_id: int | None = None
    product_name: str
    brand_name: str | None = None
    unit_price: int
    recipient_name: str
    message: str | None = None
    status: str
    created_at: datetime


class NotificationOut(_CamelModel):
    """알림 한 건.

    **테이블에 저장된 것이 아니라 기록에서 뽑은 것이다.** id는 출처를
    가리키는 문자열이고(`order:<uuid>` 같은), 화면은 key로만 쓴다.
    """

    id: str
    kind: str
    title: str
    body: str
    at: datetime
    link: str | None = None
    # profiles.notifications_seen_at 이후에 생긴 것.
    unread: bool


class NotificationsOut(_CamelModel):
    items: list[NotificationOut]
    unread_count: int
