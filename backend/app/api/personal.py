"""개인 데이터 API (Phase 2).

    /api/v1/me/closet          화장대
    /api/v1/me/cart            장바구니
    /api/v1/me/likes           찜
    /api/v1/me/recently-viewed 최근 본
    /api/v1/me/scans           스캔 기록
    /api/v1/me/orders          주문내역 · 자주 구매
    /api/v1/me/reviews         후기
    /api/v1/me/points          포인트
    /api/v1/me/stats           대시보드 숫자
    /api/v1/orders             주문 생성 (장바구니 결제)

전부 로그인이 필요하다. 비회원 데이터는 프론트 localStorage에 남고,
로그인 시 한 번 서버로 옮긴다.

제품 조인
---------
응답에 제품 정보를 함께 싣는다. 화장대 10개를 받은 프론트가 상세를 10번 더
부르지 않도록 하기 위해서다. 매 목록마다 같은 조인이 필요해 `_products_of`로
묶었다.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.api.products import _to_out
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.personal import (
    CartItem,
    ClosetItem,
    Gift,
    Like,
    Order,
    OrderItem,
    PointTransaction,
    RecentlyViewed,
    Review,
    ReviewPhoto,
    ScanResult,
)
from app.models.product import Product
from app.models.user import User
from app.schemas.personal import (
    CartItemIn,
    CartLineOut,
    CartOut,
    ClosetItemIn,
    ClosetItemOut,
    FrequentItemOut,
    GiftIn,
    GiftOut,
    NotificationOut,
    NotificationsOut,
    OrderCloseIn,
    OrderItemOut,
    OrderOut,
    PointsOut,
    PointTxOut,
    ProductRefIn,
    QtyIn,
    ReviewIn,
    ReviewOut,
    ScanIn,
    ScanOut,
    StatsOut,
    TrackingStepOut,
)
from app.schemas.product import ProductOut
from app.models.user import Profile
from app.services.experience import level_of, total_exp
from app.services.notifications import build_feed
from app.services.order_stage import (
    CANCELLED,
    CLOSED_STATUSES,
    RETURNED,
    can_cancel,
    can_return,
    order_stage,
    tracking,
)
from app.services.review_photos import decode_photo, photo_url, photo_urls_of

router = APIRouter(prefix="/api/v1/me", tags=["personal"])
orders_router = APIRouter(prefix="/api/v1/orders", tags=["orders"])
gifts_router = APIRouter(prefix="/api/v1/gifts", tags=["gifts"])
reviews_router = APIRouter(prefix="/api/v1/reviews", tags=["reviews"])

# 최근 본 상품 보관 개수. 넘으면 오래된 것부터 지운다.
RECENT_LIMIT = 30

# 주문 1원당 적립 포인트 비율(1%). 결제가 흉내라 포인트도 상징적이지만,
# **계산식이 한 곳에 있다**는 점이 중요하다 — 화면마다 다른 숫자를 쓰지 않는다.
POINT_RATE = 0.01
# 후기 작성 적립. 고정액이다.
REVIEW_POINT = 100


async def _products_of(db: AsyncSession, ids: list[int]) -> dict[int, ProductOut]:
    """제품 id 목록 → 응답 DTO. 없는 id는 결과에서 빠진다."""
    if not ids:
        return {}
    rows = await db.scalars(
        select(Product)
        .where(Product.id.in_(ids))
        .options(joinedload(Product.brand), joinedload(Product.category))
    )
    return {p.id: _to_out(p) for p in rows}


async def _require_product(db: AsyncSession, product_id: int) -> None:
    """없는 제품을 담으려 하면 404.

    FK가 이미 막지만, 그대로 두면 IntegrityError가 500으로 올라간다.
    카탈로그에 없는 id는 클라이언트의 실수이므로 404로 알린다.
    """
    exists = await db.scalar(select(Product.id).where(Product.id == product_id))
    if exists is None:
        raise HTTPException(status_code=404, detail="제품을 찾을 수 없습니다")


# ── 화장대 ────────────────────────────────────────────────────


# 화장대에서 뺀 제품. 행을 지우지 않고 이 상태로 두면 '삭제된 제품'에서
# 다시 보고 복원할 수 있다. 영구 삭제만 행을 지운다.
CLOSET_REMOVED = "removed"
# 주문으로 화장대에 담긴 제품의 경로. 취소·반품하면 이 경로로 담긴 것만 되돌린다.
ORDER_VIA = "order"


async def _closet_add_ordered(db: AsyncSession, user_id: uuid.UUID, product_ids: list[int]) -> None:
    """주문한 제품을 화장대에 담는다 — 산 제품은 쓰는 제품이다.

    - 화장대에 없으면 '보유 중'으로 새로 담는다(경로: order)
    - '삭제된 제품'이면 보유 중으로 복원한다. 경로도 order로 바꿔, 이 주문을
      취소하면 다시 삭제된 제품으로 돌아가게 한다
    - 이미 보유 중이면 건드리지 않는다(원래 경로를 지킨다 — 취소해도 남는다)
    """
    if not product_ids:
        return
    existing = {
        c.product_id: c
        for c in await db.scalars(
            select(ClosetItem).where(
                ClosetItem.user_id == user_id, ClosetItem.product_id.in_(product_ids)
            )
        )
    }
    for pid in dict.fromkeys(product_ids):
        item = existing.get(pid)
        if item is None:
            db.add(ClosetItem(user_id=user_id, product_id=pid, status="owned", added_via=ORDER_VIA))
        elif item.status == CLOSET_REMOVED:
            item.status = "owned"
            item.added_via = ORDER_VIA
            item.added_at = datetime.now(timezone.utc)


async def _closet_release_ordered(db: AsyncSession, user_id: uuid.UUID, order_id: uuid.UUID) -> None:
    """취소·반품한 주문으로 담긴 제품을 '삭제된 제품'으로 옮긴다(복원할 수 있다).

    주문으로 담긴 것(경로 order)만 옮긴다. 원래 화장대에 있던 제품은 그대로다.
    같은 제품이 아직 살아 있는 다른 주문에도 있으면 그 주문 때문에 쓰는 제품이므로 남긴다.
    """
    ordered = select(OrderItem.product_id).where(
        OrderItem.order_id == order_id, OrderItem.product_id.is_not(None)
    )
    still_ordered = (
        select(OrderItem.product_id)
        .join(Order, Order.id == OrderItem.order_id)
        .where(
            Order.user_id == user_id,
            Order.id != order_id,
            Order.status.not_in(CLOSED_STATUSES),
            OrderItem.product_id.is_not(None),
        )
    )
    await db.execute(
        update(ClosetItem)
        .where(
            ClosetItem.user_id == user_id,
            ClosetItem.product_id.in_(ordered),
            ClosetItem.product_id.not_in(still_ordered),
            ClosetItem.added_via == ORDER_VIA,
            ClosetItem.status != CLOSET_REMOVED,
        )
        .values(status=CLOSET_REMOVED)
    )


@router.get("/closet", response_model=list[ClosetItemOut], summary="내 화장대")
async def list_closet(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ClosetItemOut]:
    rows = list(
        await db.scalars(
            select(ClosetItem)
            .where(ClosetItem.user_id == user.id)
            .order_by(ClosetItem.added_at.desc())
        )
    )
    products = await _products_of(db, [r.product_id for r in rows])
    return [
        ClosetItemOut(
            id=r.id,
            product=products[r.product_id],
            status=r.status,
            added_via=r.added_via,
            added_at=r.added_at,
        )
        for r in rows
        if r.product_id in products
    ]


@router.post("/closet", response_model=ClosetItemOut, status_code=201, summary="화장대에 담기")
async def add_closet(
    body: ClosetItemIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ClosetItemOut:
    await _require_product(db, body.product_id)

    # 이미 있으면 새로 만들지 않고 그대로 돌려준다. 화면이 중복 담기를
    # 막고 있지만 그건 약속일 뿐이고, 409를 내면 "이미 있음"을 화면이
    # 다시 다뤄야 한다.
    existing = await db.scalar(
        select(ClosetItem).where(
            ClosetItem.user_id == user.id, ClosetItem.product_id == body.product_id
        )
    )
    if existing is None:
        existing = ClosetItem(
            user_id=user.id,
            product_id=body.product_id,
            status=body.status,
            added_via=body.added_via,
        )
        db.add(existing)
        await db.commit()
        await db.refresh(existing)
    elif existing.status == CLOSET_REMOVED:
        # 삭제된 제품을 다시 담으면 복원이다. 담은 경로·시각은 처음 것을 둔다.
        existing.status = "owned"
        await db.commit()
        await db.refresh(existing)

    products = await _products_of(db, [existing.product_id])
    return ClosetItemOut(
        id=existing.id,
        product=products[existing.product_id],
        status=existing.status,
        added_via=existing.added_via,
        added_at=existing.added_at,
    )


@router.delete("/closet/{product_id}", status_code=204, response_class=Response,
               summary="화장대에서 빼기")
async def remove_closet(
    product_id: int,
    permanent: bool = Query(False, description="true면 '삭제된 제품'에서도 지운다"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """기본은 '삭제된 제품'으로 옮기기다. 다시 담으면(POST) 복원된다."""
    owned_by = (ClosetItem.user_id == user.id, ClosetItem.product_id == product_id)
    if permanent:
        await db.execute(delete(ClosetItem).where(*owned_by))
    else:
        await db.execute(
            update(ClosetItem).where(*owned_by).values(status=CLOSET_REMOVED)
        )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── 장바구니 ──────────────────────────────────────────────────


async def _cart_out(db: AsyncSession, user_id: uuid.UUID) -> CartOut:
    rows = list(
        await db.scalars(
            select(CartItem)
            .where(CartItem.user_id == user_id)
            .order_by(CartItem.added_at.desc())
        )
    )
    products = await _products_of(db, [r.product_id for r in rows])
    lines = [
        CartLineOut(id=r.id, product=products[r.product_id], qty=r.qty)
        for r in rows
        if r.product_id in products
    ]
    return CartOut(
        lines=lines,
        count=sum(line.qty for line in lines),
        subtotal=sum(line.product.price * line.qty for line in lines),
    )


@router.get("/cart", response_model=CartOut, summary="장바구니")
async def read_cart(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CartOut:
    return await _cart_out(db, user.id)


@router.post("/cart", response_model=CartOut, summary="장바구니에 담기")
async def add_cart(
    body: CartItemIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CartOut:
    await _require_product(db, body.product_id)

    # 같은 제품을 다시 담으면 수량이 더해진다. UPSERT로 한 번에 처리해
    # 조회-후-삽입 사이의 경합(같은 계정 두 탭)을 없앤다.
    stmt = (
        pg_insert(CartItem)
        .values(user_id=user.id, product_id=body.product_id, qty=body.qty)
        .on_conflict_do_update(
            constraint="uq_cart_user_product",
            set_={"qty": CartItem.qty + body.qty},
        )
    )
    await db.execute(stmt)
    await db.commit()
    return await _cart_out(db, user.id)


@router.patch("/cart/{product_id}", response_model=CartOut, summary="수량 변경")
async def set_cart_qty(
    product_id: int,
    body: QtyIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CartOut:
    if body.qty == 0:
        # 0은 삭제다. 수량 0짜리 행을 남기면 목록·합계가 그걸 세어야 한다.
        await db.execute(
            delete(CartItem).where(
                CartItem.user_id == user.id, CartItem.product_id == product_id
            )
        )
    else:
        row = await db.scalar(
            select(CartItem).where(
                CartItem.user_id == user.id, CartItem.product_id == product_id
            )
        )
        if row is None:
            raise HTTPException(status_code=404, detail="장바구니에 없는 제품입니다")
        row.qty = body.qty
    await db.commit()
    return await _cart_out(db, user.id)


@router.delete("/cart/{product_id}", response_model=CartOut, summary="장바구니에서 빼기")
async def remove_cart(
    product_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CartOut:
    await db.execute(
        delete(CartItem).where(
            CartItem.user_id == user.id, CartItem.product_id == product_id
        )
    )
    await db.commit()
    return await _cart_out(db, user.id)


# ── 찜 ────────────────────────────────────────────────────────


@router.get("/likes", response_model=list[ProductOut], summary="찜한 제품")
async def list_likes(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ProductOut]:
    rows = list(
        await db.scalars(
            select(Like).where(Like.user_id == user.id).order_by(Like.created_at.desc())
        )
    )
    products = await _products_of(db, [r.product_id for r in rows])
    return [products[r.product_id] for r in rows if r.product_id in products]


@router.post("/likes", status_code=204, response_class=Response, summary="찜하기")
async def add_like(
    body: ProductRefIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await _require_product(db, body.product_id)
    # 두 번 눌러도 조용히 통과한다 — 찜은 멱등한 동작이다.
    await db.execute(
        pg_insert(Like)
        .values(user_id=user.id, product_id=body.product_id)
        .on_conflict_do_nothing(constraint="uq_like_user_product")
    )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/likes/{product_id}", status_code=204, response_class=Response,
               summary="찜 해제")
async def remove_like(
    product_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await db.execute(
        delete(Like).where(Like.user_id == user.id, Like.product_id == product_id)
    )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── 최근 본 ───────────────────────────────────────────────────


@router.get("/recently-viewed", response_model=list[ProductOut], summary="최근 본 제품")
async def list_recent(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ProductOut]:
    rows = list(
        await db.scalars(
            select(RecentlyViewed)
            .where(RecentlyViewed.user_id == user.id)
            .order_by(RecentlyViewed.viewed_at.desc())
            .limit(RECENT_LIMIT)
        )
    )
    products = await _products_of(db, [r.product_id for r in rows])
    return [products[r.product_id] for r in rows if r.product_id in products]


@router.post("/recently-viewed", status_code=204, response_class=Response,
             summary="본 제품 기록")
async def touch_recent(
    body: ProductRefIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await _require_product(db, body.product_id)

    now = datetime.now(tz=None).astimezone()
    await db.execute(
        pg_insert(RecentlyViewed)
        .values(user_id=user.id, product_id=body.product_id, viewed_at=now)
        .on_conflict_do_update(
            constraint="uq_recent_user_product", set_={"viewed_at": now}
        )
    )

    # 목록이 무한히 자라지 않도록 오래된 것을 지운다. LIMIT/OFFSET을 서브쿼리로
    # 쓰는 이유는 "최신 N개를 제외한 나머지"를 한 문장으로 표현하기 위해서다.
    keep = (
        select(RecentlyViewed.id)
        .where(RecentlyViewed.user_id == user.id)
        .order_by(RecentlyViewed.viewed_at.desc())
        .limit(RECENT_LIMIT)
        .scalar_subquery()
    )
    await db.execute(
        delete(RecentlyViewed).where(
            RecentlyViewed.user_id == user.id, RecentlyViewed.id.not_in(keep)
        )
    )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/recently-viewed", status_code=204, response_class=Response,
               summary="최근 본 전체 삭제")
async def clear_recent(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await db.execute(delete(RecentlyViewed).where(RecentlyViewed.user_id == user.id))
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── 스캔 기록 ─────────────────────────────────────────────────


@router.get("/scans", response_model=list[ScanOut], summary="스캔 기록")
async def list_scans(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ScanOut]:
    rows = list(
        await db.scalars(
            select(ScanResult)
            .where(ScanResult.user_id == user.id)
            .order_by(ScanResult.created_at.desc())
            .limit(100)
        )
    )
    products = await _products_of(db, [r.product_id for r in rows if r.product_id])
    return [
        ScanOut(
            id=r.id,
            product=products.get(r.product_id) if r.product_id else None,
            source=r.source,
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.post("/scans", response_model=ScanOut, status_code=201, summary="스캔 기록 남기기")
async def add_scan(
    body: ScanIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ScanOut:
    if body.product_id is not None:
        await _require_product(db, body.product_id)

    row = ScanResult(
        user_id=user.id,
        product_id=body.product_id,
        source=body.source,
        raw_text=body.raw_text,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)

    products = await _products_of(db, [row.product_id] if row.product_id else [])
    return ScanOut(
        id=row.id,
        product=products.get(row.product_id) if row.product_id else None,
        source=row.source,
        created_at=row.created_at,
    )


# ── 주문 ──────────────────────────────────────────────────────


async def _order_out(db: AsyncSession, order: Order) -> OrderOut:
    items = list(
        await db.scalars(
            select(OrderItem).where(OrderItem.order_id == order.id).order_by(OrderItem.id)
        )
    )
    reviewed = set(
        await db.scalars(
            select(Review.order_item_id).where(
                Review.order_item_id.in_([i.id for i in items] or [0])
            )
        )
    )
    return OrderOut(
        id=order.id,
        total=order.total,
        status=order.status,
        placed_at=order.placed_at,
        stage=order_stage(order.status, order.placed_at),
        tracking=[
            TrackingStepOut(stage=name, at=at)
            for name, at in tracking(order.status, order.placed_at, order.closed_at)
        ],
        can_cancel=can_cancel(order.status, order.placed_at),
        can_return=can_return(order.status, order.placed_at),
        closed_at=order.closed_at,
        close_reason=order.close_reason,
        items=[
            OrderItemOut(
                id=i.id,
                product_id=i.product_id,
                product_name=i.product_name,
                brand_name=i.brand_name,
                unit_price=i.unit_price,
                qty=i.qty,
                reviewed=i.id in reviewed,
            )
            for i in items
        ],
    )


@orders_router.post("", response_model=OrderOut, status_code=201, summary="주문(장바구니 결제)")
async def place_order(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrderOut:
    """장바구니를 주문으로 바꾼다.

    **실제 결제는 없다.** 그래도 진짜 행을 남기는 이유는 주문내역·후기·
    포인트·'자주 구매'가 전부 여기서 파생되기 때문이다 — 지금까지 그
    화면들은 각자 하드코딩된 예시를 들고 있었다.

    가격은 결제 시점의 값을 order_items에 박제한다. 제품 가격이 나중에
    바뀌어도 과거 주문 금액이 따라 움직이면 안 된다.
    """
    rows = list(await db.scalars(select(CartItem).where(CartItem.user_id == user.id)))
    if not rows:
        raise HTTPException(status_code=422, detail="장바구니가 비어 있습니다")

    catalog = list(
        await db.scalars(
            select(Product)
            .where(Product.id.in_([r.product_id for r in rows]))
            .options(joinedload(Product.brand))
        )
    )
    by_id = {p.id: p for p in catalog}

    order = Order(user_id=user.id, total=0)
    db.add(order)
    await db.flush()

    total = 0
    for row in rows:
        product = by_id.get(row.product_id)
        if product is None:
            continue
        unit_price = product.price or 0
        total += unit_price * row.qty
        db.add(
            OrderItem(
                order_id=order.id,
                product_id=product.id,
                product_name=product.display_name or product.name,
                brand_name=product.brand.name if product.brand else None,
                unit_price=unit_price,
                qty=row.qty,
            )
        )

    order.total = total
    if total > 0:
        db.add(
            PointTransaction(
                user_id=user.id,
                amount=int(total * POINT_RATE),
                reason="order",
                order_id=order.id,
            )
        )

    # 산 제품은 화장대에 담는다(같은 트랜잭션 — 주문이 실패하면 담기지도 않는다).
    await _closet_add_ordered(db, user.id, [r.product_id for r in rows if r.product_id in by_id])

    await db.execute(delete(CartItem).where(CartItem.user_id == user.id))
    await db.commit()
    await db.refresh(order)
    return await _order_out(db, order)


@router.get("/orders", response_model=list[OrderOut], summary="주문내역")
async def list_orders(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[OrderOut]:
    orders = list(
        await db.scalars(
            select(Order)
            .where(Order.user_id == user.id)
            .order_by(Order.placed_at.desc())
        )
    )
    return [await _order_out(db, o) for o in orders]


async def _close_order(
    db: AsyncSession, user: User, order_id: uuid.UUID, new_status: str,
    reason: str | None,
) -> OrderOut:
    """취소·반품 공통. 적립했던 주문 포인트도 회수한다."""
    order = await db.scalar(
        select(Order).where(Order.id == order_id, Order.user_id == user.id)
    )
    if order is None:
        raise HTTPException(status_code=404, detail="주문을 찾을 수 없습니다")

    allowed = (
        can_cancel(order.status, order.placed_at)
        if new_status == CANCELLED
        else can_return(order.status, order.placed_at)
    )
    if not allowed:
        detail = (
            "결제완료 단계에서만 취소할 수 있어요"
            if new_status == CANCELLED
            else "배송완료된 주문만 반품할 수 있어요"
        )
        raise HTTPException(status_code=409, detail=detail)

    order.status = new_status
    order.closed_at = datetime.now(timezone.utc)
    order.close_reason = (reason or "").strip() or None

    earned = await db.scalar(
        select(func.coalesce(func.sum(PointTransaction.amount), 0)).where(
            PointTransaction.order_id == order.id, PointTransaction.reason == "order"
        )
    )
    if earned:
        db.add(
            PointTransaction(
                user_id=user.id,
                amount=-int(earned),
                reason="order_cancel" if new_status == CANCELLED else "order_return",
                order_id=order.id,
            )
        )
    # 취소·반품했으니 이 주문으로 담긴 제품은 화장대에서 뺀다.
    await _closet_release_ordered(db, user.id, order.id)
    await db.commit()
    await db.refresh(order)
    return await _order_out(db, order)


@router.post("/orders/{order_id}/cancel", response_model=OrderOut, summary="주문 취소")
async def cancel_order(
    order_id: uuid.UUID,
    body: OrderCloseIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrderOut:
    """결제완료 단계(배송 준비 전)에서만 된다. 실제 결제가 없어 환불은 기록뿐이다."""
    return await _close_order(db, user, order_id, CANCELLED, body.reason)


@router.post("/orders/{order_id}/return", response_model=OrderOut, summary="반품 신청")
async def return_order(
    order_id: uuid.UUID,
    body: OrderCloseIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrderOut:
    """배송완료된 주문만. 회수·검수 과정이 없어 신청 즉시 반품 완료로 기록한다."""
    return await _close_order(db, user, order_id, RETURNED, body.reason)


@router.get("/orders/frequent", response_model=list[FrequentItemOut], summary="자주 구매")
async def list_frequent(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[FrequentItemOut]:
    """구매 횟수 내림차순. 주문 기록이 없으면 빈 목록이다.

    빈 목록을 목업으로 채우지 않는다 — 예전에는 그 자리에 가짜 '3회 구매'
    카드가 있었고, id가 실재 제품과 겹쳐 엉뚱한 상세가 열렸다.
    """
    rows = list(
        await db.execute(
            select(
                OrderItem.product_id,
                func.sum(OrderItem.qty).label("cnt"),
                func.max(Order.placed_at).label("last"),
            )
            .join(Order, Order.id == OrderItem.order_id)
            .where(Order.user_id == user.id, OrderItem.product_id.is_not(None))
            # 취소·반품한 주문은 산 것이 아니다.
            .where(Order.status.not_in(CLOSED_STATUSES))
            .group_by(OrderItem.product_id)
            .order_by(func.sum(OrderItem.qty).desc())
            .limit(20)
        )
    )
    products = await _products_of(db, [r.product_id for r in rows])
    return [
        FrequentItemOut(
            product=products[r.product_id],
            purchase_count=int(r.cnt),
            last_ordered_at=r.last,
        )
        for r in rows
        if r.product_id in products
    ]


# ── 후기 · 포인트 ─────────────────────────────────────────────


@router.get("/reviews", response_model=list[ReviewOut], summary="내 후기")
async def list_reviews(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ReviewOut]:
    rows = list(
        await db.scalars(
            select(Review).where(Review.user_id == user.id).order_by(Review.created_at.desc())
        )
    )
    photos = await photo_urls_of(db, [r.id for r in rows])
    return [
        ReviewOut(
            id=r.id,
            product_id=r.product_id,
            order_item_id=r.order_item_id,
            rating=r.rating,
            body=r.body,
            created_at=r.created_at,
            photo_urls=photos.get(r.id, []),
        )
        for r in rows
    ]


@router.post("/reviews", response_model=ReviewOut, status_code=201, summary="후기 작성")
async def write_review(
    body: ReviewIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReviewOut:
    """산 제품에만 쓸 수 있다.

    order_item을 거치는 이유: "구매한 사람의 후기"라는 조건을 DB 구조로
    강제하기 위해서다. product_id만 받으면 사지 않은 제품에도 쓸 수 있다.
    """
    row = (
        await db.execute(
            select(OrderItem, Order.status)
            .join(Order, Order.id == OrderItem.order_id)
            .where(OrderItem.id == body.order_item_id, Order.user_id == user.id)
        )
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="주문 내역에서 찾을 수 없습니다")
    item, order_status = row
    if order_status in CLOSED_STATUSES:
        raise HTTPException(status_code=409, detail="취소·반품한 주문에는 후기를 쓸 수 없어요")
    # 사진은 저장 전에 전부 검사한다. 한 장이 잘못돼 후기만 남으면 안 된다.
    decoded = [decode_photo(p) for p in body.photos]
    if item.product_id is None:
        raise HTTPException(status_code=422, detail="카탈로그에서 내려간 제품입니다")

    existing = await db.scalar(
        select(Review).where(Review.order_item_id == item.id)
    )
    if existing is not None:
        raise HTTPException(status_code=409, detail="이미 후기를 작성했습니다")

    review = Review(
        user_id=user.id,
        product_id=item.product_id,
        order_item_id=item.id,
        rating=body.rating,
        body=body.body,
    )
    db.add(review)
    await db.flush()
    photo_rows = [
        ReviewPhoto(review_id=review.id, position=i, content_type=ctype, data=data)
        for i, (ctype, data) in enumerate(decoded)
    ]
    db.add_all(photo_rows)
    db.add(PointTransaction(user_id=user.id, amount=REVIEW_POINT, reason="review"))
    await db.commit()
    await db.refresh(review)

    return ReviewOut(
        id=review.id,
        product_id=review.product_id,
        order_item_id=review.order_item_id,
        rating=review.rating,
        body=review.body,
        created_at=review.created_at,
        photo_urls=[photo_url(p.id) for p in photo_rows],
    )


@reviews_router.get("/photos/{photo_id}", summary="후기 사진")
async def get_review_photo(
    photo_id: int,
    db: AsyncSession = Depends(get_db),
) -> Response:
    """후기 사진 원본. 후기는 공개(제품 상세)라 로그인 없이 받는다.

    한 번 올린 사진은 바뀌지 않으므로 오래 캐시한다.
    """
    photo = await db.get(ReviewPhoto, photo_id)
    if photo is None:
        raise HTTPException(status_code=404, detail="사진을 찾을 수 없습니다")
    return Response(
        content=photo.data,
        media_type=photo.content_type,
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


@router.get("/points", response_model=PointsOut, summary="포인트")
async def read_points(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PointsOut:
    rows = list(
        await db.scalars(
            select(PointTransaction)
            .where(PointTransaction.user_id == user.id)
            .order_by(PointTransaction.created_at.desc())
        )
    )
    return PointsOut(
        balance=sum(r.amount for r in rows),
        transactions=[
            PointTxOut(id=r.id, amount=r.amount, reason=r.reason, created_at=r.created_at)
            for r in rows
        ],
    )


# ── 통계 ──────────────────────────────────────────────────────


@router.get("/stats", response_model=StatsOut, summary="대시보드 숫자")
async def read_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StatsOut:
    """전부 실제 행에서 센다.

    예전에는 홈과 마이페이지에 `{saved: 128400, scans: 21, swaps: 9}` 같은
    고정값이 박혀 있었다.

    **레벨·경험치도 여기서 계산한다.** 클라이언트가 행동할 때마다 더해
    나가면 값이 그 브라우저에만 쌓여 기기를 바꾸면 0부터 다시 시작하고,
    콘솔에서 고쳐도 서버는 모른다. 계산식은 services/experience.py에 있다.

    한 쿼리로 모으는 이유
    ---------------------
    세는 대상이 9가지인데, 예전에는 그만큼 쿼리를 **순차로** 날렸다. DB가
    Neon(원격)이라 쿼리 한 번 왕복이 실측 212ms여서 그것만으로 2초가 넘었고,
    홈에서 레벨이 한참 뒤에 튀어나왔다. 스칼라 서브쿼리로 합치면 왕복이
    한 번이다 — 실측 3,663ms → 410ms.

    `asyncio.gather`로 병렬화할 수는 없다. 하나의 AsyncSession은 동시에
    두 쿼리를 보낼 수 없다.
    """

    def rows_of(model) -> Any:
        """이 사용자의 행 수. 선물만 컬럼 이름이 다르다(보낸 사람).
        주문은 취소·반품을 빼고 센다 — 산 것이 아니다. 화장대는 삭제된 제품을 뺀다."""
        owner = Gift.sender_user_id if model is Gift else model.user_id
        stmt = select(func.count()).select_from(model).where(owner == user.id)
        if model is Order:
            stmt = stmt.where(Order.status.not_in(CLOSED_STATUSES))
        if model is ClosetItem:
            stmt = stmt.where(ClosetItem.status != CLOSET_REMOVED)
        return stmt.scalar_subquery()

    def sum_of(column, owner) -> Any:
        stmt = select(func.coalesce(func.sum(column), 0)).where(owner == user.id)
        if column is Order.total:
            stmt = stmt.where(Order.status.not_in(CLOSED_STATUSES))
        return stmt.scalar_subquery()

    (
        closet,
        likes,
        orders,
        scans,
        reviews,
        gifts,
        spent,
        points,
        cart_qty,
    ) = (
        await db.execute(
            select(
                rows_of(ClosetItem),
                rows_of(Like),
                rows_of(Order),
                rows_of(ScanResult),
                rows_of(Review),
                rows_of(Gift),
                sum_of(Order.total, Order.user_id),
                sum_of(PointTransaction.amount, PointTransaction.user_id),
                sum_of(CartItem.qty, CartItem.user_id),
            )
        )
    ).one()

    exp = total_exp(scans=scans, reviews=reviews, orders=orders, gifts=gifts)
    level, exp_in_level, level_span = level_of(exp)

    return StatsOut(
        closet_count=closet,
        cart_count=cart_qty,
        like_count=likes,
        order_count=orders,
        scan_count=scans,
        review_count=reviews,
        gift_count=gifts,
        total_spent=spent,
        point_balance=points,
        exp=exp,
        level=level,
        exp_in_level=exp_in_level,
        level_span=level_span,
    )


# ---------------------------------------------------------------------- 선물하기


def _gift_out(gift: Gift, sender_nickname: str | None = None) -> GiftOut:
    return GiftOut(
        id=gift.id,
        product_id=gift.product_id,
        product_name=gift.product_name,
        brand_name=gift.brand_name,
        unit_price=gift.unit_price,
        recipient_name=gift.recipient_name,
        sender_nickname=sender_nickname,
        message=gift.message,
        status=gift.status,
        created_at=gift.created_at,
    )


@gifts_router.post("", response_model=GiftOut, status_code=201, summary="선물 보내기")
async def send_gift(
    body: GiftIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GiftOut:
    """선물 기록을 남긴다.

    **결제도 전달도 없다.** `orders`와 같은 처지이고, 이유도 같다 — '보낸
    선물' 목록이 이 기록에서 파생되기 때문이다. 지금까지 그 목록은
    localStorage에 쌓이고 예시 데이터와 합쳐져 있었다.

    `status`는 항상 'pending'이다. 실제 발송 수단이 붙기 전까지 바뀌지 않고,
    화면도 그렇게 안내한다.
    """
    product = await db.scalar(
        select(Product).where(Product.id == body.product_id).options(joinedload(Product.brand))
    )
    if product is None:
        raise HTTPException(status_code=404, detail="제품을 찾을 수 없습니다")

    # 받는 사람은 닉네임으로 찾는다. 닉네임은 유일하지 않으므로 여럿이면
    # 누구에게 보낼지 정할 수 없다 — 아무에게나 보내지 않고 알린다.
    nickname = body.recipient_nickname.strip()
    recipients = list(
        await db.scalars(
            select(User.id).where(User.nickname == nickname, User.is_active.is_(True)).limit(2)
        )
    )
    if not recipients:
        raise HTTPException(status_code=404, detail=f"'{nickname}' 닉네임의 회원을 찾을 수 없어요")
    if len(recipients) > 1:
        raise HTTPException(
            status_code=409, detail=f"'{nickname}' 닉네임을 쓰는 회원이 여러 명이에요"
        )
    if recipients[0] == user.id:
        raise HTTPException(status_code=422, detail="나에게는 선물할 수 없어요")

    gift = Gift(
        sender_user_id=user.id,
        recipient_user_id=recipients[0],
        product_id=product.id,
        product_name=product.display_name or product.name,
        brand_name=product.brand.name if product.brand else None,
        unit_price=product.price or 0,
        recipient_name=nickname,
        message=(body.message or "").strip() or None,
    )
    db.add(gift)
    await db.commit()
    await db.refresh(gift)
    return _gift_out(gift)


@router.get("/gifts/sent", response_model=list[GiftOut], summary="보낸 선물")
async def list_sent_gifts(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[GiftOut]:
    gifts = list(
        await db.scalars(
            select(Gift)
            .where(Gift.sender_user_id == user.id)
            .order_by(Gift.created_at.desc())
        )
    )
    return [_gift_out(g) for g in gifts]


@router.get("/gifts/received", response_model=list[GiftOut], summary="받은 선물")
async def list_received_gifts(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[GiftOut]:
    rows = await db.execute(
        select(Gift, User.nickname)
        .join(User, User.id == Gift.sender_user_id)
        .where(Gift.recipient_user_id == user.id)
        .order_by(Gift.created_at.desc())
    )
    return [_gift_out(g, nickname or "익명") for g, nickname in rows]


# ------------------------------------------------------------------------ 알림


@router.get("/notifications", response_model=NotificationsOut, summary="알림")
async def list_notifications(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NotificationsOut:
    """주문·포인트·후기·선물·진단 기록에서 만든 알림 피드.

    **알림을 저장하지 않는다.** 행동할 때마다 알림 행을 심는 대신 매번
    기록을 훑는다 — 심는 코드를 빠뜨릴 일이 없고, 과거에 한 일도 소급해서
    보인다. 자세한 배경은 services/notifications.py에 있다.

    가격 인하·재입고 알림은 만들지 않는다. 가격 이력 테이블이 없고 재입고
    신청 기능 자체가 없어서, 지금 내보내면 지어낸 알림이 된다.
    """
    profile = await db.scalar(select(Profile).where(Profile.user_id == user.id))
    seen_at = profile.notifications_seen_at if profile else None

    feed = await build_feed(db, user)
    items = [
        NotificationOut(
            id=n.id,
            kind=n.kind,
            title=n.title,
            body=n.body,
            at=n.at,
            link=n.link,
            unread=seen_at is None or n.at > seen_at,
        )
        for n in feed
    ]
    return NotificationsOut(
        items=items,
        unread_count=sum(1 for i in items if i.unread),
    )


@router.post(
    "/notifications/seen",
    status_code=204,
    response_class=Response,
    summary="알림 읽음 표시",
)
async def mark_notifications_seen(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """지금까지의 알림을 읽은 것으로 표시한다.

    건별이 아니라 시각 하나로 끊는다. 알림이 저장돼 있지 않아 건별 상태를
    둘 데가 없고, 알림함은 열면 전부 보는 화면이라 그걸로 충분하다.
    """
    profile = await db.scalar(select(Profile).where(Profile.user_id == user.id))
    if profile is None:
        profile = Profile(user_id=user.id)
        db.add(profile)
    profile.notifications_seen_at = datetime.now(timezone.utc)
    await db.commit()
    return Response(status_code=204)
