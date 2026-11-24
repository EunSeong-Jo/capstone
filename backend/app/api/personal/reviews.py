"""후기 · 포인트 — /api/v1/me/reviews · points, 후기 사진 /api/v1/reviews/photos."""

from __future__ import annotations

from fastapi import Depends, HTTPException, Response
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.personal import Order, OrderItem, PointTransaction, Review, ReviewPhoto
from app.models.product import Product
from app.models.user import User
from app.schemas.personal import PointsOut, PointTxOut, ReviewIn, ReviewOut
from app.services.commerce.order_stage import CLOSED_STATUSES, order_stage
from app.services.commerce.review_photos import decode_photo, photo_url, photo_urls_of
from app.api.personal._common import router, reviews_router, REVIEW_POINT

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
    """산 제품에만, 배송이 끝난 뒤에 쓸 수 있다.

    order_item을 거치는 이유: "구매한 사람의 후기"라는 조건을 DB 구조로
    강제하기 위해서다. product_id만 받으면 사지 않은 제품에도 쓸 수 있다.
    """
    row = (
        await db.execute(
            select(OrderItem, Order.status, Order.placed_at)
            .join(Order, Order.id == OrderItem.order_id)
            .where(OrderItem.id == body.order_item_id, Order.user_id == user.id)
        )
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="주문 내역에서 찾을 수 없습니다")
    item, order_status, placed_at = row
    if order_status in CLOSED_STATUSES:
        raise HTTPException(status_code=409, detail="취소·반품한 주문에는 후기를 쓸 수 없어요")
    # 받아 보지도 않은 제품에 후기를 쓸 수 있으면 안 된다(QA 8). 예전에는 결제
    # 직후에도 '후기 작성'이 열려 있었다. 반품과 같은 기준 — 배송완료 단계부터.
    if order_stage(order_status, placed_at) != "delivered":
        raise HTTPException(status_code=409, detail="배송이 완료된 뒤에 후기를 쓸 수 있어요")
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
    # 화면의 리뷰 수(products.registered_review_count)를 같은 트랜잭션에서 맞춘다
    await db.execute(
        update(Product)
        .where(Product.id == item.product_id)
        .values(registered_review_count=Product.registered_review_count + 1)
    )
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
