"""개인 데이터 도메인 (Phase 2).

화장대·장바구니·찜·최근 본·주문·후기·포인트·스캔 기록. 지금까지 전부
프론트 localStorage에 있던 것들이다.

**서버로 옮기는 진짜 이유는 동기화가 아니라 무결성이다.** localStorage에는
아무 숫자나 id로 들어갈 수 있어서, 목업 시절 가짜 제품 id(102·960001 등)가
그대로 저장됐고 화면은 그걸 카탈로그 제품으로 취급했다. 여기서는 전부
`products.id` FK라 없는 제품을 넣는 것 자체가 불가능하다.

제품 정보를 복사해 두지 않는다
------------------------------
`closet_items`가 제품명·가격을 자기 컬럼으로 갖지 않고 FK만 둔다. 가격이
바뀌면 두 곳이 어긋나고, 어느 쪽이 맞는지 판단할 근거가 없기 때문이다.
예외는 `order_items`다 — 주문은 "그때 그 가격에 샀다"는 기록이라 시점의
값을 박제해야 한다.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    SmallInteger,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


def _user_fk() -> Mapped[uuid.UUID]:
    return mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )


def _product_fk() -> Mapped[int]:
    return mapped_column(
        Integer,
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
    )


class ClosetItem(Base):
    """내 화장대 — 사용자가 지금 쓰는 제품.

    (user_id, product_id) UNIQUE라 같은 제품을 두 번 담을 수 없다. 프론트가
    중복을 막고 있었지만 그건 화면의 약속일 뿐이라 DB로 옮긴다.
    """

    __tablename__ = "closet_items"
    __table_args__ = (
        UniqueConstraint("user_id", "product_id", name="uq_closet_user_product"),
        Index("idx_closet_user", "user_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[uuid.UUID] = _user_fk()
    product_id: Mapped[int] = _product_fk()

    # owned / analyzing / scanned — 프론트 ClosetStatus와 같은 집합
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="owned")
    # seed / scan / chatbot / search — 어느 경로로 들어왔는지
    added_via: Mapped[str] = mapped_column(Text, nullable=False, server_default="search")
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )


class CartItem(Base):
    """장바구니. 수량이 0이 되면 행을 지운다(0짜리 행을 남기지 않는다)."""

    __tablename__ = "cart_items"
    __table_args__ = (
        UniqueConstraint("user_id", "product_id", name="uq_cart_user_product"),
        Index("idx_cart_user", "user_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[uuid.UUID] = _user_fk()
    product_id: Mapped[int] = _product_fk()
    qty: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )


class Like(Base):
    """찜.

    프론트 LikedProductsContext는 `dcmy:likedProducts:v1` 한 키를 계정 구분
    없이 썼다 — 다른 계정으로 로그인해도 같은 찜 목록이 보였다. user_id를
    키에 넣어 그 버그를 구조적으로 없앤다.
    """

    __tablename__ = "likes"
    __table_args__ = (
        UniqueConstraint("user_id", "product_id", name="uq_like_user_product"),
        Index("idx_likes_user", "user_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[uuid.UUID] = _user_fk()
    product_id: Mapped[int] = _product_fk()
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )


class RecentlyViewed(Base):
    """최근 본 제품. 같은 제품을 다시 보면 시각만 갱신한다."""

    __tablename__ = "recently_viewed"
    __table_args__ = (
        UniqueConstraint("user_id", "product_id", name="uq_recent_user_product"),
        Index("idx_recent_user_viewed", "user_id", "viewed_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[uuid.UUID] = _user_fk()
    product_id: Mapped[int] = _product_fk()
    viewed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )


class Order(Base):
    """주문.

    실제 결제는 없다. 장바구니를 비우고 기록을 남기는 것까지가 전부이고,
    `status`도 항상 'placed'다. 그래도 진짜 테이블에 남기는 이유는
    주문내역·후기·포인트·'자주 구매'가 전부 이 기록에서 파생되기 때문이다 —
    지금까지는 그 화면들이 각자 하드코딩된 예시를 들고 있었다.
    """

    __tablename__ = "orders"
    __table_args__ = (Index("idx_orders_user_placed", "user_id", "placed_at"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = _user_fk()
    # 결제 시점의 합계. order_items에서 다시 계산할 수 있지만, 그러면 제품
    # 가격이 바뀔 때마다 과거 주문 금액이 따라 움직인다.
    total: Mapped[int] = mapped_column(Integer, nullable=False)
    # placed / cancelled / returned. 배송 단계(결제완료~배송완료)는 저장하지 않고
    # placed_at에서 계산한다 — services/order_stage.py.
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="placed")
    placed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )
    # 취소·반품한 시각과 사유. placed인 동안은 NULL이다.
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    close_reason: Mapped[str | None] = mapped_column(Text)

    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )


class OrderItem(Base):
    """주문 항목. **가격을 복사해 둔다** — 주문은 그 시점의 기록이다."""

    __tablename__ = "order_items"
    __table_args__ = (Index("idx_order_items_order", "order_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False
    )
    # 제품이 카탈로그에서 빠져도 주문 기록은 남아야 하므로 RESTRICT가 아니라
    # SET NULL이다. 이름·가격이 행에 박제돼 있어 표시에는 문제가 없다.
    product_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("products.id", ondelete="SET NULL")
    )
    product_name: Mapped[str] = mapped_column(Text, nullable=False)
    brand_name: Mapped[str | None] = mapped_column(Text)
    unit_price: Mapped[int] = mapped_column(Integer, nullable=False)
    qty: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")

    order: Mapped["Order"] = relationship(back_populates="items")


class Review(Base):
    """후기. 산 제품에만 쓸 수 있다(order_item_id로 묶는다)."""

    __tablename__ = "reviews"
    __table_args__ = (
        UniqueConstraint("order_item_id", name="uq_review_order_item"),
        Index("idx_reviews_user", "user_id"),
        Index("idx_reviews_product", "product_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[uuid.UUID] = _user_fk()
    product_id: Mapped[int] = _product_fk()
    order_item_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("order_items.id", ondelete="CASCADE"), nullable=False
    )
    rating: Mapped[int] = mapped_column(SmallInteger, nullable=False)  # 1~5
    body: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )


class PointTransaction(Base):
    """포인트 내역.

    잔액 컬럼을 따로 두지 않고 매번 SUM한다. 두 곳에 같은 사실을 적으면
    어긋날 수 있고, 한 사용자의 행이 수백 건을 넘을 일이 없다.
    """

    __tablename__ = "point_transactions"
    __table_args__ = (Index("idx_points_user_created", "user_id", "created_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[uuid.UUID] = _user_fk()
    # 적립은 양수, 사용은 음수. 부호로 구분하면 합계가 곧 잔액이 된다.
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    # order / review / order_cancel / order_return (뒤의 둘은 적립 회수, 음수)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )


class ScanResult(Base, TimestampMixin):
    """성분 스캔 기록.

    OCR이 아직 없어 지금은 검색으로 고른 제품이 들어온다(6단계). product_id를
    nullable로 두는 이유는 OCR이 붙었을 때 "인식은 했지만 카탈로그에서 못
    찾은" 경우를 남기기 위해서다 — 그게 매칭 실패율을 재는 유일한 자료다.
    """

    __tablename__ = "scan_results"
    __table_args__ = (Index("idx_scans_user_created", "user_id", "created_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[uuid.UUID] = _user_fk()
    product_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("products.id", ondelete="SET NULL")
    )
    # search / ocr — 어떻게 찾았는지
    source: Mapped[str] = mapped_column(Text, nullable=False, server_default="search")
    # OCR이 읽어낸 원문. 검색으로 등록하면 NULL이다.
    raw_text: Mapped[str | None] = mapped_column(Text)


class Gift(Base):
    """선물하기.

    주문(`orders`)과 같은 자리에 선다 — **실제 결제도 전달도 없다.** 그래도
    진짜 행을 남기는 이유는 '보낸 선물' 목록이 여기서 파생되기 때문이다.
    지금까지 그 목록은 localStorage(`swappy:sentGifts:v1`)에 쌓였고, 예시
    데이터와 합쳐서 보여줬다.

    받는 사람 연락처를 담지 않는다
    ------------------------------
    전달 경로가 없으므로 연락처는 아무 데도 쓰이지 않는다. 쓰이지도 않는
    **제3자의 개인정보를 공용 DB에 쌓을 이유가 없다.** 실제 발송(문자·카카오)을
    붙일 때 그 수단에 맞는 컬럼을 추가한다.

    가격은 order_items와 같은 이유로 그 시점 값을 박제한다.
    """

    __tablename__ = "gifts"
    __table_args__ = (
        Index("idx_gifts_sender_created", "sender_user_id", "created_at"),
        # 받은 선물 목록(GET /me/gifts/received). 마이그레이션 a9c1e2f3d4b5가 만든다.
        Index("idx_gifts_recipient_created", "recipient_user_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    sender_user_id: Mapped[uuid.UUID] = _user_fk()
    # 받는 사람 계정. 닉네임으로 찾는다. 이 컬럼이 생기기 전의 선물은 NULL이다.
    recipient_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    # 제품이 카탈로그에서 빠져도 기록은 남는다 — 이름·가격이 박제돼 있다.
    product_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("products.id", ondelete="SET NULL")
    )
    product_name: Mapped[str] = mapped_column(Text, nullable=False)
    brand_name: Mapped[str | None] = mapped_column(Text)
    unit_price: Mapped[int] = mapped_column(Integer, nullable=False)
    recipient_name: Mapped[str] = mapped_column(Text, nullable=False)
    message: Mapped[str | None] = mapped_column(Text)
    # 전달 수단이 붙기 전까지는 항상 'pending'이다. orders.status와 같은 처지다.
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="pending")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )


class ReviewPhoto(Base):
    """후기 사진.

    파일 서버가 없어 바이트를 DB에 둔다. 화면이 올리기 전에 줄여서(긴 변
    1080px JPEG) 장당 수백 KB 안쪽이고, 후기 한 건에 3장까지다.
    """

    __tablename__ = "review_photos"
    __table_args__ = (Index("idx_review_photos_review", "review_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    review_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("reviews.id", ondelete="CASCADE"), nullable=False
    )
    position: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    content_type: Mapped[str] = mapped_column(Text, nullable=False)
    data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )
