"""생성 후기 — 목록 API가 작성자 표시를 `author_*`로 채우고, 리뷰 수·실제 후기 집계에 새지 않는다 (공용 DB 읽기 전용)."""
from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select

from app.db.session import AsyncSessionLocal
from app.models.personal import Review
from app.models.product import Product

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _sample_product() -> tuple[int, int]:
    """생성 후기가 있는 단독 제품 id와 그 후기 수."""
    async with AsyncSessionLocal() as db:
        row = (
            await db.execute(
                select(Review.product_id, func.count())
                .where(Review.is_sample)
                .group_by(Review.product_id)
                .order_by(Review.product_id)
                .limit(1)
            )
        ).first()
    if row is None:
        pytest.skip("생성 후기가 적재되지 않은 DB (scripts/seed_sample_reviews.py)")
    return row[0], row[1]


async def test_list_uses_author_fields_and_total_matches_registered_count(client: AsyncClient) -> None:
    pid, n = await _sample_product()
    res = await client.get(f"/api/v1/products/{pid}/reviews?limit=100")
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == n and len(body["items"]) == n
    assert all(r["nickname"] != "익명" for r in body["items"])
    assert all(1 <= r["rating"] <= 5 for r in body["items"])

    async with AsyncSessionLocal() as db:
        registered = await db.scalar(select(Product.registered_review_count).where(Product.id == pid))
    assert registered == n


async def test_sample_rows_have_no_user_so_personal_counts_skip_them() -> None:
    async with AsyncSessionLocal() as db:
        leaked = await db.scalar(
            select(func.count()).select_from(Review).where(Review.is_sample, Review.user_id.is_not(None))
        )
        real_without_owner = await db.scalar(
            select(func.count()).select_from(Review).where(~Review.is_sample, Review.user_id.is_(None))
        )
    assert leaked == 0 and real_without_owner == 0


async def test_product_response_review_count_is_registered_count(client: AsyncClient) -> None:
    pid, n = await _sample_product()
    res = await client.get(f"/api/v1/products/{pid}")
    assert res.status_code == 200
    assert res.json()["reviewCount"] == n
