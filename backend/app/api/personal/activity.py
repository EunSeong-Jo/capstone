"""찜 · 최근 본 · 스캔 기록 — /api/v1/me/likes · recently-viewed · scans."""

from __future__ import annotations

from datetime import datetime

from fastapi import Depends, Response, status
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.personal import Like, RecentlyViewed, ScanResult
from app.models.product import Product
from app.models.user import User
from app.schemas.personal import ProductRefIn, ScanIn, ScanOut
from app.schemas.product import ProductOut
from app.api.personal._common import router, RECENT_LIMIT, _products_of, _require_product

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

    # 옵션형 묶음의 옵션들은 id가 다른 별개 제품 행이지만 화면에서는 이름이 같은 한 제품이다.
    # 옵션을 바꿔 보면 같은 제품이 연달아 쌓이므로, 옵션 그룹당 가장 최근 것 하나만 남긴다.
    group_of = dict(
        (await db.execute(
            select(Product.id, Product.option_parent_id).where(
                Product.id.in_([r.product_id for r in rows]), Product.option_parent_id.is_not(None)
            )
        )).all()
    )
    seen: set[int] = set()
    out: list[ProductOut] = []
    for r in rows:  # viewed_at 내림차순이라 먼저 만나는 것이 가장 최근이다
        if r.product_id not in products:
            continue
        group = group_of.get(r.product_id)
        if group is not None:
            if group in seen:
                continue
            seen.add(group)
        out.append(products[r.product_id])
    return out


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

    # 같은 옵션 그룹의 다른 옵션을 본 기록은 지운다 — 한 제품이 옵션 수만큼 쌓이지 않게(목록 조회도 같은 기준으로 접는다).
    group = await db.scalar(select(Product.option_parent_id).where(Product.id == body.product_id))
    if group is not None:
        await db.execute(
            delete(RecentlyViewed).where(
                RecentlyViewed.user_id == user.id,
                RecentlyViewed.product_id != body.product_id,
                RecentlyViewed.product_id.in_(select(Product.id).where(Product.option_parent_id == group)),
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
