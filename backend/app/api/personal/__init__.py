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

모듈
----
섹션별로 나눠 두었다. 라우터 객체는 `_common`에 하나씩만 있고, 아래 import 순서가
곧 라우트 등록 순서다(분할 전 단일 파일과 같다).
"""

from app.api.personal import (  # noqa: F401 — 라우트 등록을 위한 import
    closet,
    cart,
    activity,
    orders,
    reviews,
    stats,
    gifts,
    notifications,
)
from app.api.personal._common import gifts_router, orders_router, reviews_router, router

__all__ = ["router", "orders_router", "gifts_router", "reviews_router"]
