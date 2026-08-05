"""
RAG 챗봇용 임시 제품 데이터 (SQLite).

⚠️ 이 모듈은 PostgreSQL 스키마 확정 전까지만 사용하는 임시 저장소다.
   data_collection/db_storage.py의 products 스키마와 컬럼 구조가 다르다:
     - 이곳: name / skin_types·ingredients·efficacy (JSON TEXT)
     - PG  : product_name / 성분은 product_ingredients 별도 테이블,
             skin_types·efficacy 컬럼 자체가 없음
   따라서 전환 시 함수 내부 교체만으로는 불가능하며,
   스키마 매핑과 피부타입·효능 데이터 확보가 선행되어야 한다.

저장 위치: backend/data/products.db (.gitignore 처리됨, 최초 호출 시 생성)
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

_DB_PATH = Path(__file__).parent.parent.parent / "data" / "products.db"
_initialized = False

# ── 시드 데이터 (실제 DB 연동 전까지 사용) ──────────────────────────────────
SEED_PRODUCTS: list[dict] = [
    {
        "id": 1,
        "name": "세타필 모이스처라이징 크림",
        "brand": "세타필",
        "category": "보습 크림",
        "price": 18000,
        "rating": 4.6,
        "skin_types": ["건성", "민감성", "바스락사막", "조심조심유리구슬"],
        "ingredients": ["글리세린", "판테놀", "스위트아몬드오일", "세라마이드"],
        "efficacy": ["보습", "진정", "장벽 강화"],
    },
    {
        "id": 2,
        "name": "라운드랩 자작나무 수분 크림",
        "brand": "라운드랩",
        "category": "수분 크림",
        "price": 14000,
        "rating": 4.4,
        "skin_types": ["지성", "복합성", "겉바속촉수부지", "반질반질물개"],
        "ingredients": ["자작나무수액", "히알루론산", "나이아신아마이드"],
        "efficacy": ["수분", "모공 케어", "미백"],
    },
    {
        "id": 3,
        "name": "아벤느 클린스 모이스처라이징 크림",
        "brand": "아벤느",
        "category": "보습 크림",
        "price": 22000,
        "rating": 4.7,
        "skin_types": ["민감성", "건성", "조심조심유리구슬"],
        "ingredients": ["아벤느 온천수", "글리세린", "스쿠알란"],
        "efficacy": ["진정", "보습", "예민 피부 케어"],
    },
    {
        "id": 4,
        "name": "이니스프리 그린티 씨드 세럼",
        "brand": "이니스프리",
        "category": "세럼",
        "price": 25000,
        "rating": 4.3,
        "skin_types": ["복합성", "지성", "수분팡팡옹달샘", "반질반질물개"],
        "ingredients": ["녹차추출물", "히알루론산", "녹차씨오일"],
        "efficacy": ["수분", "항산화", "피부결 개선"],
    },
    {
        "id": 5,
        "name": "닥터자르트 시카페어 크림",
        "brand": "닥터자르트",
        "category": "진정 크림",
        "price": 32000,
        "rating": 4.5,
        "skin_types": ["민감성", "트러블성", "조심조심유리구슬", "울긋불긋화산"],
        "ingredients": ["판테놀", "센텔라아시아티카", "마데카소사이드"],
        "efficacy": ["진정", "트러블 케어", "장벽 강화"],
    },
    {
        "id": 6,
        "name": "코스알엑스 어드밴스드 달팽이 96 뮤신 파워 에센스",
        "brand": "코스알엑스",
        "category": "에센스",
        "price": 19000,
        "rating": 4.8,
        "skin_types": ["복합성", "건성", "말랑말랑인절미", "얼룩덜룩메밀묵"],
        "ingredients": ["달팽이분비물여과물", "나이아신아마이드", "소듐하이알루로네이트"],
        "efficacy": ["보습", "재생", "탄력"],
    },
    {
        "id": 7,
        "name": "클리오 킬커버 파운데이션",
        "brand": "클리오",
        "category": "파운데이션",
        "price": 28000,
        "rating": 4.2,
        "skin_types": ["지성", "복합성"],
        "ingredients": ["산화아연", "티타늄디옥사이드", "실리카"],
        "efficacy": ["커버력", "지속력", "모공 커버"],
    },
    {
        "id": 8,
        "name": "토리든 다이브인 저분자 히알루론산 세럼",
        "brand": "토리든",
        "category": "세럼",
        "price": 16000,
        "rating": 4.6,
        "skin_types": ["건성", "민감성", "복합성", "바스락사막"],
        "ingredients": ["5중 히알루론산", "판테놀", "글리세린"],
        "efficacy": ["즉각 수분", "보습 지속", "피부 장벽"],
    },
    {
        "id": 9,
        "name": "미샤 타임레볼루션 에센스",
        "brand": "미샤",
        "category": "에센스",
        "price": 13500,
        "rating": 4.4,
        "skin_types": ["건성", "노화", "말랑말랑인절미"],
        "ingredients": ["발효효모필트레이트", "나이아신아마이드", "아데노신"],
        "efficacy": ["탄력", "미백", "주름 개선"],
    },
    {
        "id": 10,
        "name": "라네즈 워터슬리핑마스크",
        "brand": "라네즈",
        "category": "수면 팩",
        "price": 24000,
        "rating": 4.5,
        "skin_types": ["건성", "복합성", "수분팡팡옹달샘", "바스락사막"],
        "ingredients": ["수련꽃추출물", "히알루론산", "애플민트추출물"],
        "efficacy": ["수분 보충", "진정", "피부결 개선"],
    },
]


def _ensure_initialized() -> None:
    global _initialized
    if _initialized:
        return
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(_DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS products (
                id          INTEGER PRIMARY KEY,
                name        TEXT NOT NULL,
                brand       TEXT NOT NULL,
                category    TEXT NOT NULL,
                price       INTEGER NOT NULL,
                rating      REAL NOT NULL,
                skin_types  TEXT NOT NULL,
                ingredients TEXT NOT NULL,
                efficacy    TEXT NOT NULL
            )
        """)
        if conn.execute("SELECT COUNT(*) FROM products").fetchone()[0] == 0:
            conn.executemany(
                "INSERT INTO products VALUES (?,?,?,?,?,?,?,?,?)",
                [
                    (
                        p["id"], p["name"], p["brand"], p["category"],
                        p["price"], p["rating"],
                        json.dumps(p["skin_types"], ensure_ascii=False),
                        json.dumps(p["ingredients"], ensure_ascii=False),
                        json.dumps(p["efficacy"], ensure_ascii=False),
                    )
                    for p in SEED_PRODUCTS
                ],
            )
        conn.commit()
    _initialized = True


def _row_to_dict(row: tuple) -> dict:
    return {
        "id": row[0],
        "name": row[1],
        "brand": row[2],
        "category": row[3],
        "price": row[4],
        "rating": row[5],
        "skin_types": json.loads(row[6]),
        "ingredients": json.loads(row[7]),
        "efficacy": json.loads(row[8]),
    }


def get_all_products() -> list[dict]:
    """전체 제품 목록 반환. (임시 시드 — 상단 모듈 docstring 참고)"""
    _ensure_initialized()
    with sqlite3.connect(_DB_PATH) as conn:
        rows = conn.execute("SELECT * FROM products ORDER BY id").fetchall()
    return [_row_to_dict(r) for r in rows]


def get_products_by_skin_type(skin_type_label: str) -> list[dict]:
    """특정 피부 타입 레이블이 포함된 제품만 반환."""
    _ensure_initialized()
    with sqlite3.connect(_DB_PATH) as conn:
        rows = conn.execute(
            "SELECT * FROM products WHERE skin_types LIKE ? ORDER BY rating DESC",
            (f"%{skin_type_label}%",),
        ).fetchall()
    return [_row_to_dict(r) for r in rows]