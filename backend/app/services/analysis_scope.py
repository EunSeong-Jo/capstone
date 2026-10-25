"""'성분 분석이 끝난 제품'의 정의 — 추천 목록이 이것만 낸다.

성분 유사도 배치(`scripts/compute_similarities.py`)는 단일제품만, 성분이 충분한 것만 계산한다. 계산 대상이 아닌
제품(기획·묶음·굿즈, 성분 5개 미만)을 추천 목록에 올리면 눌렀을 때 대체품·성분 비교가 비어 있다("분석 전" 화면).
그래서 홈 추천처럼 **우리가 먼저 골라 보여 주는 목록**은 이 조건을 건다.

반대로 사용자가 직접 찾는 경로(사진·텍스트로 찾기, 검색)에는 걸지 않는다 — 카탈로그에 기획 상품만 있는 제품도
찾을 수 있어야 한다.
"""
from __future__ import annotations

from sqlalchemy import exists
from sqlalchemy.sql.elements import ColumnElement

from app.models.product import Product
from app.models.recommendation import Similarity


def analyzed() -> ColumnElement[bool]:
    """이 제품이 성분 유사도 분석(hybrid) 결과를 갖고 있다."""
    return exists().where(Similarity.product_id == Product.id, Similarity.method == "hybrid")
