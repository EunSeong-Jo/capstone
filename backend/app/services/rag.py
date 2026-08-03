"""
RAG 서비스 — 제품 DB에서 검색해 LLM 컨텍스트를 구성한다.

현재: SQLite 테스트 DB (backend/data/products.db)
추후: get_all_products() / get_products_by_skin_type() 교체만으로 PostgreSQL·벡터DB 전환 가능.
"""
from __future__ import annotations

from app.db.products_db import get_all_products, get_products_by_skin_type

_KEYWORD_MAP = {
    "히알루론산": ["히알루론산", "수분", "보습"],
    "나이아신아마이드": ["나이아신아마이드", "미백", "모공"],
    "세라마이드": ["세라마이드", "장벽", "보습"],
    "판테놀": ["판테놀", "진정", "보습"],
    "센텔라": ["센텔라", "진정", "트러블"],
    "달팽이": ["달팽이", "재생", "탄력"],
    "레티놀": ["레티놀", "주름", "탄력"],
}

_SKIN_TYPE_LABEL: dict[str, str] = {
    "mulgae": "반질반질물개",
    "memilmuk": "얼룩덜룩메밀묵",
    "ongdalsaem": "수분팡팡옹달샘",
    "samak": "바스락사막",
    "subuji": "겉바속촉수부지",
    "yuriguseul": "조심조심유리구슬",
    "injeolmi": "말랑말랑인절미",
    "hwasan": "울긋불긋화산",
}


def skin_type_label(skin_type_id: str) -> str:
    """피부 타입 ID → 한국어 레이블 변환."""
    return _SKIN_TYPE_LABEL.get(skin_type_id, skin_type_id)


def search_products(query: str, skin_type_id: str | None = None, top_k: int = 5) -> list[dict]:
    """
    query: 사용자 자연어 질문
    skin_type_id: 진단된 피부 타입 ID (예: 'yuriguseul')
    top_k: 반환할 최대 제품 수

    실제 DB 전환 시 get_all_products()를 교체하면 이 함수 로직은 그대로 유지됨.
    벡터 DB 사용 시에는 이 함수 전체를 임베딩 기반 유사도 검색으로 교체.
    """
    label = skin_type_label(skin_type_id) if skin_type_id else None
    all_products = get_all_products()

    scored: list[tuple[int, dict]] = []
    for product in all_products:
        score = 0

        if label and any(label in st or (skin_type_id or "") in st for st in product["skin_types"]):
            score += 3

        for ingredient in product["ingredients"]:
            if ingredient in query:
                score += 4
        for keywords in _KEYWORD_MAP.values():
            if any(kw in query for kw in keywords):
                if any(i in " ".join(product["ingredients"]) for i in keywords):
                    score += 2

        for efficacy in product["efficacy"]:
            if efficacy in query:
                score += 3

        if product["brand"] in query or product["name"] in query:
            score += 6

        if product["category"] in query:
            score += 2

        scored.append((score, product))

    scored.sort(key=lambda x: x[0], reverse=True)

    if not scored or scored[0][0] == 0:
        return _fallback_by_skin_type(label, top_k)

    return [p for _, p in scored[:top_k]]


def _fallback_by_skin_type(label: str | None, top_k: int) -> list[dict]:
    if not label:
        return get_all_products()[:top_k]
    matched = get_products_by_skin_type(label)
    return (matched or get_all_products())[:top_k]