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

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import delete, func, select
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
)
from app.schemas.product import ProductOut
from app.models.user import Profile
from app.services.experience import level_of, total_exp
from app.services.notifications import build_feed

router = APIRouter(prefix="/api/v1/me", tags=["personal"])
orders_router = APIRouter(prefix="/api/v1/orders", tags=["orders"])
gifts_router = APIRouter(prefix="/api/v1/gifts", tags=["gifts"])

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
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await db.execute(
        delete(ClosetItem).where(
            ClosetItem.user_id == user.id, ClosetItem.product_id == product_id
        )
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
            .limit(20)
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
    rows = await db.scalars(
        select(Review).where(Review.user_id == user.id).order_by(Review.created_at.desc())
    )
    return [
        ReviewOut(
            id=r.id,
            product_id=r.product_id,
            order_item_id=r.order_item_id,
            rating=r.rating,
            body=r.body,
            created_at=r.created_at,
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
    item = await db.scalar(
        select(OrderItem)
        .join(Order, Order.id == OrderItem.order_id)
        .where(OrderItem.id == body.order_item_id, Order.user_id == user.id)
    )
    if item is None:
        raise HTTPException(status_code=404, detail="주문 내역에서 찾을 수 없습니다")
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
    """

    async def count(model) -> int:
        return int(
            await db.scalar(
                select(func.count()).select_from(model).where(model.user_id == user.id)
            )
            or 0
        )

    spent = int(
        await db.scalar(
            select(func.coalesce(func.sum(Order.total), 0)).where(
                Order.user_id == user.id
            )
        )
        or 0
    )
    points = int(
        await db.scalar(
            select(func.coalesce(func.sum(PointTransaction.amount), 0)).where(
                PointTransaction.user_id == user.id
            )
        )
        or 0
    )
    cart_qty = int(
        await db.scalar(
            select(func.coalesce(func.sum(CartItem.qty), 0)).where(
                CartItem.user_id == user.id
            )
        )
        or 0
    )

    scans = await count(ScanResult)
    reviews = await count(Review)
    orders = await count(Order)
    gifts = int(
        await db.scalar(
            select(func.count())
            .select_from(Gift)
            .where(Gift.sender_user_id == user.id)
        )
        or 0
    )

    exp = total_exp(scans=scans, reviews=reviews, orders=orders, gifts=gifts)
    level, exp_in_level, level_span = level_of(exp)

    return StatsOut(
        closet_count=await count(ClosetItem),
        cart_count=cart_qty,
        like_count=await count(Like),
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


def _gift_out(gift: Gift) -> GiftOut:
    return GiftOut(
        id=gift.id,
        product_id=gift.product_id,
        product_name=gift.product_name,
        brand_name=gift.brand_name,
        unit_price=gift.unit_price,
        recipient_name=gift.recipient_name,
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

    gift = Gift(
        sender_user_id=user.id,
        product_id=product.id,
        product_name=product.display_name or product.name,
        brand_name=product.brand.name if product.brand else None,
        unit_price=product.price or 0,
        recipient_name=body.recipient_name.strip(),
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
