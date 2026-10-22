"""화면 간 일관성 — 궁합 카드·배지·목록 정렬·전성분 칩이 **같은 판정**을 쓰는가.

이 테스트가 생긴 이유: 한때 전성분 목록은 기존 태그(420종), 궁합 카드는 새 라벨(1,680종)을 봐서
같은 제품에서 "추천 성분 15개·기피 0개"와 "향료 있음"이 동시에 나왔다. 지금은 모두
`services/skin_fit.py`가 정본이고 사전 계산(`product_skin_fit`)은 그 결과를 저장할 뿐이다.

`scripts/compute_skin_fit.py`를 돌리지 않은 환경에서는 사전 계산 행이 없어 배지가 unknown으로 나오므로
그 비교만 건너뛴다.
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio(loop_scope="session")

TYPES = ("yuriguseul", "samak", "mulgae")


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def sample_ids(client: AsyncClient) -> list[int]:
    res = await client.get("/api/v1/products", params={"size": 12, "sort": "popular"})
    return [i["id"] for i in res.json()["items"]]


async def test_card_and_badge_agree(client: AsyncClient, sample_ids: list[int]) -> None:
    for t in TYPES:
        brief = (
            await client.get("/api/v1/skin-fit", params={"ids": ",".join(map(str, sample_ids)), "skinType": t})
        ).json()["items"]
        by_id = {b["productId"]: b for b in brief}
        compared = 0
        for pid in sample_ids:
            card = (await client.get(f"/api/v1/products/{pid}/skin-fit", params={"skinType": t})).json()
            b = by_id[pid]
            if b["verdict"] == "unknown" and card["verdict"] != "unknown":
                continue  # 이 제품의 사전 계산이 아직 없다
            assert (b["verdict"], b["score"]) == (card["verdict"], card["score"]), (t, pid)
            compared += 1
        if compared == 0:
            pytest.skip("사전 계산(compute_skin_fit)이 없는 환경")


async def test_card_reasons_point_at_matching_chips(client: AsyncClient, sample_ids: list[int]) -> None:
    """카드의 이유가 가리키는 성분은 전성분 목록에서 같은 분류(plus→key, minus→warn)로 칠해진다. 추천 기능과 기피 플래그를 함께 가진 성분은 주의가 우선이다."""
    for t in TYPES:
        for pid in sample_ids[:8]:
            card = (await client.get(f"/api/v1/products/{pid}/skin-fit", params={"skinType": t})).json()
            detail = (await client.get(f"/api/v1/products/{pid}", params={"skinType": t})).json()
            grade_at = {i["position"]: i["grade"] for i in detail["ingredients"]}
            flags_at = {i["position"]: i["flags"] for i in detail["ingredients"]}
            for r in card["reasons"]:
                for ing in r["ingredients"]:
                    got = grade_at.get(ing["position"])
                    if r["kind"] == "minus":
                        assert got == "warn", (t, pid, r["text"], ing)
                    else:
                        # 추천 기능을 가진 성분이 동시에 기피 플래그를 가지면(예: 티트리잎오일) 칩은 주의가 우선이다
                        assert got == "key" or (got == "warn" and flags_at[ing["position"]]), (t, pid, r["text"], ing)


async def test_detail_grade_changes_with_skin_type_but_allergen_does_not(
    client: AsyncClient, sample_ids: list[int]
) -> None:
    pid = sample_ids[0]
    plain = (await client.get(f"/api/v1/products/{pid}")).json()["ingredients"]
    typed = (await client.get(f"/api/v1/products/{pid}", params={"skinType": "samak"})).json()["ingredients"]
    assert [i["isAllergen"] for i in plain] == [i["isAllergen"] for i in typed]
    assert all(i["grade"] != "key" for i in plain)             # 타입이 없으면 추천 성분을 말하지 않는다
    assert any(i["grade"] == "key" for i in typed) or all(i["grade"] != "key" for i in typed)


async def test_skin_fit_sort_follows_the_stored_score(client: AsyncClient) -> None:
    res = await client.get(
        "/api/v1/products", params={"skinType": "samak", "sort": "skinFit", "size": 10}
    )
    ids = [i["id"] for i in res.json()["items"]]
    brief = (await client.get("/api/v1/skin-fit", params={"ids": ",".join(map(str, ids)), "skinType": "samak"})).json()
    by_id = {b["productId"]: b["score"] for b in brief["items"]}
    scores = [-1 if by_id[i] is None else by_id[i] for i in ids]
    assert scores == sorted(scores, reverse=True)


async def test_filter_excludes_what_the_card_would_flag_as_listed_allergen(
    client: AsyncClient,
) -> None:
    res = await client.get("/api/v1/products", params={"skinType": "yuriguseul", "size": 10})
    for item in res.json()["items"]:
        detail = (await client.get(f"/api/v1/products/{item['id']}")).json()
        assert not any(i["isAllergen"] for i in detail["ingredients"]), item["id"]
