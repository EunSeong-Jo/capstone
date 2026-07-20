"""
RAG 서비스 — 현재는 mock 데이터로 동작.
다른 팀원이 올리브영/화해/식약처 DB를 연결하면 search_products()만 교체하면 됨.
"""
from __future__ import annotations

MOCK_PRODUCTS: list[dict] = [
    {
        "id": 1,
        "name": "세타필 모이스처라이징 크림",
        "brand": "세타필",
        "category": "보습 크림",
        "price": 18000,
        "skin_types": ["건성", "민감성", "바스락사막", "조심조심유리구슬"],
        "ingredients": ["글리세린", "판테놀", "스위트아몬드오일", "세라마이드"],
        "efficacy": ["보습", "진정", "장벽 강화"],
        "rating": 4.6,
    },
    {
        "id": 2,
        "name": "라운드랩 자작나무 수분 크림",
        "brand": "라운드랩",
        "category": "수분 크림",
        "price": 14000,
        "skin_types": ["지성", "복합성", "겉바속촉수부지", "반질반질물개"],
        "ingredients": ["자작나무수액", "히알루론산", "나이아신아마이드"],
        "efficacy": ["수분", "모공 케어", "미백"],
        "rating": 4.4,
    },
    {
        "id": 3,
        "name": "아벤느 클린스 모이스처라이징 크림",
        "brand": "아벤느",
        "category": "보습 크림",
        "price": 22000,
        "skin_types": ["민감성", "건성", "조심조심유리구슬"],
        "ingredients": ["아벤느 온천수", "글리세린", "스쿠알란"],
        "efficacy": ["진정", "보습", "예민 피부 케어"],
        "rating": 4.7,
    },
    {
        "id": 4,
        "name": "이니스프리 그린티 씨드 세럼",
        "brand": "이니스프리",
        "category": "세럼",
        "price": 25000,
        "skin_types": ["복합성", "지성", "수분팡팡옹달샘", "반질반질물개"],
        "ingredients": ["녹차추출물", "히알루론산", "녹차씨오일"],
        "efficacy": ["수분", "항산화", "피부결 개선"],
        "rating": 4.3,
    },
    {
        "id": 5,
        "name": "닥터자르트 시카페어 크림",
        "brand": "닥터자르트",
        "category": "진정 크림",
        "price": 32000,
        "skin_types": ["민감성", "트러블성", "조심조심유리구슬", "울긋불긋화산"],
        "ingredients": ["판테놀", "센텔라아시아티카", "마데카소사이드"],
        "efficacy": ["진정", "트러블 케어", "장벽 강화"],
        "rating": 4.5,
    },
    {
        "id": 6,
        "name": "코스알엑스 어드밴스드 달팽이 96 뮤신 파워 에센스",
        "brand": "코스알엑스",
        "category": "에센스",
        "price": 19000,
        "skin_types": ["복합성", "건성", "말랑말랑인절미", "얼룩덜룩메밀묵"],
        "ingredients": ["달팽이분비물여과물", "나이아신아마이드", "소듐하이알루로네이트"],
        "efficacy": ["보습", "재생", "탄력"],
        "rating": 4.8,
    },
    {
        "id": 7,
        "name": "클리오 킬커버 파운데이션",
        "brand": "클리오",
        "category": "파운데이션",
        "price": 28000,
        "skin_types": ["지성", "복합성"],
        "ingredients": ["산화아연", "티타늄디옥사이드", "실리카"],
        "efficacy": ["커버력", "지속력", "모공 커버"],
        "rating": 4.2,
    },
    {
        "id": 8,
        "name": "토리든 다이브인 저분자 히알루론산 세럼",
        "brand": "토리든",
        "category": "세럼",
        "price": 16000,
        "skin_types": ["건성", "민감성", "복합성", "바스락사막"],
        "ingredients": ["5중 히알루론산", "판테놀", "글리세린"],
        "efficacy": ["즉각 수분", "보습 지속", "피부 장벽"],
        "rating": 4.6,
    },
    {
        "id": 9,
        "name": "미샤 타임레볼루션 에센스",
        "brand": "미샤",
        "category": "에센스",
        "price": 13500,
        "skin_types": ["건성", "노화", "말랑말랑인절미"],
        "ingredients": ["발효효모필트레이트", "나이아신아마이드", "아데노신"],
        "efficacy": ["탄력", "미백", "주름 개선"],
        "rating": 4.4,
    },
    {
        "id": 10,
        "name": "라네즈 워터슬리핑마스크",
        "brand": "라네즈",
        "category": "수면 팩",
        "price": 24000,
        "skin_types": ["건성", "복합성", "수분팡팡옹달샘", "바스락사막"],
        "ingredients": ["수련꽃추출물", "히알루론산", "애플민트추출물"],
        "efficacy": ["수분 보충", "진정", "피부결 개선"],
        "rating": 4.5,
    },
]

_KEYWORD_MAP = {
    "히알루론산": ["히알루론산", "수분", "보습"],
    "나이아신아마이드": ["나이아신아마이드", "미백", "모공"],
    "세라마이드": ["세라마이드", "장벽", "보습"],
    "판테놀": ["판테놀", "진정", "보습"],
    "센텔라": ["센텔라", "진정", "트러블"],
    "달팽이": ["달팽이", "재생", "탄력"],
    "레티놀": ["레티놀", "주름", "탄력"],
}


def search_products(query: str, skin_type: str | None = None, top_k: int = 5) -> list[dict]:
    """
    query: 사용자 자연어 질문
    skin_type: 진단된 피부 타입 id (예: 'yuriguseul')
    top_k: 반환할 최대 제품 수

    실제 DB 연결 시 이 함수만 벡터 검색으로 교체.
    """
    scored: list[tuple[int, dict]] = []

    for product in MOCK_PRODUCTS:
        score = 0

        # 피부 타입 매칭
        if skin_type:
            skin_label = _skin_type_id_to_label(skin_type)
            if any(skin_type in st or skin_label in st for st in product["skin_types"]):
                score += 3

        # 성분 키워드 매칭
        for ingredient in product["ingredients"]:
            if ingredient in query:
                score += 4
        for keywords in _KEYWORD_MAP.values():
            if any(kw in query for kw in keywords):
                if any(i in " ".join(product["ingredients"]) for i in keywords):
                    score += 2

        # 효능 키워드 매칭
        for efficacy in product["efficacy"]:
            if efficacy in query:
                score += 3

        # 브랜드/제품명 직접 언급
        if product["brand"] in query or product["name"] in query:
            score += 6

        # 카테고리 매칭
        if product["category"] in query:
            score += 2

        scored.append((score, product))

    scored.sort(key=lambda x: x[0], reverse=True)
    top = [p for _, p in scored[:top_k]]

    # 관련 제품이 없으면 피부 타입 기준 상위 제품 반환
    if not top or scored[0][0] == 0:
        return _fallback_by_skin_type(skin_type, top_k)

    return top


def _skin_type_id_to_label(skin_type_id: str) -> str:
    mapping = {
        "mulgae": "반질반질물개",
        "memilmuk": "얼룩덜룩메밀묵",
        "ongdalsaem": "수분팡팡옹달샘",
        "samak": "바스락사막",
        "subuji": "겉바속촉수부지",
        "yuriguseul": "조심조심유리구슬",
        "injeolmi": "말랑말랑인절미",
        "hwasan": "울긋불긋화산",
    }
    return mapping.get(skin_type_id, skin_type_id)


def _fallback_by_skin_type(skin_type: str | None, top_k: int) -> list[dict]:
    if not skin_type:
        return MOCK_PRODUCTS[:top_k]
    label = _skin_type_id_to_label(skin_type)
    matched = [p for p in MOCK_PRODUCTS if any(label in st or skin_type in st for st in p["skin_types"])]
    return (matched or MOCK_PRODUCTS)[:top_k]
