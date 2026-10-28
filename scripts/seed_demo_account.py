#!/usr/bin/env python3
"""조은성 데모 계정에 "모든 기능이 보이는" 데이터를 API로 채운다 (여러 번 돌려도 안전).

API를 거치므로 서버의 검증을 그대로 지난다 — 실제 사용자가 하는 것과 같은 경로라, 화면에서 보이는 것과 어긋나지 않는다.
대상은 로컬 서버가 기본이다. 운영(AWS)에는 직접 쓰지 않는다 — 로컬에서 채운 뒤
`scripts/aws_db.sh dump` → `scripts/aws_db.sh demo --yes`로 올린다(docs/aws-db-migration.md).

    python3 scripts/seed_demo_account.py                  # 로컬 http://localhost:8000
    python3 scripts/seed_demo_account.py --base URL --email ... --password ...

채우는 것
  화장대   4개 카테고리(스킨케어·선케어·마스크팩·클렌징)를 모두, 그리고 대체품·더 잘 맞는 제품·리필이 실제로 나오는 제품으로
  찜       카테고리별로 몇 개
  장바구니 몇 개
  주문     취소된 주문 1건, 반품된 주문 1건 (나머지는 이미 배송완료)
  후기     배송완료된 주문 제품에 3건
  스캔 기록
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request

# (제품 id, 담은 경로) — 고른 이유는 docs/demo-scenario.md '데모 화장대'
CLOSET: list[tuple[int, str]] = [
    # 마스크팩
    (3103, "scan"),     # 라운드랩 소나무 진정 시카 마스크 10매
    (3099, "search"),   # 로벡틴 닥터마스크 시카 5매
    (3092, "search"),   # 라운드랩 1025 독도 수분 워터겔 마스크 10매
    # 클렌징
    (867, "search"),    # 라운드랩 1025 독도 클렌저
    (1491, "scan"),     # 바닐라코 클린잇제로 클렌징밤
    (827, "search"),    # 아누아 어성초 포어 컨트롤 클렌징오일 350ml
    (844, "search"),    # 바이오더마 센시비오 H2O 클렌징워터
    (881, "search"),    # 제로이드 포밍 클렌저 240ml 기획
    # 스킨케어
    (1439, "search"),   # 디오디너리 나이아신아마이드 10% + 징크 1%
    (2765, "search"),   # 에스네이처 아쿠아 스쿠알란 수분크림
    (738, "search"),    # 라운드랩 1025 독도 로션
    (199, "search"),    # 에스네이처 아쿠아 스쿠알란 세럼 50ml — 리필팩(578)이 단가로 더 싸다
    # 선케어
    (912, "search"),    # 스킨1004 센텔라 워터핏 선세럼
    (1579, "scan"),     # AHC 마스터즈 아이시 젤리 선스틱
]
LIKES = [790, 3042, 828, 953, 662, 3866]          # 마스크팩 2 · 클렌징 1 · 선케어 1 · 스킨케어 1 · 마스크팩 1
CART = [(3866, 1), (790, 2)]
SCANS = [(867, "scan"), (1491, "scan")]
# 후기: (주문 제품 id, 별점, 내용)
REVIEWS = [
    (481, 5, "수분감이 오래가요. 흡수도 빠르고 끈적임이 없어서 아침저녁으로 잘 쓰고 있어요."),
    (712, 4, "순해서 민감한 날에도 부담 없이 발라요. 용량이 넉넉한 게 좋아요."),
    (2063, 4, "붉은기가 있을 때 진정되는 느낌이에요. 향이 거의 없어서 좋아요."),
]


class Api:
    def __init__(self, base: str) -> None:
        self.base, self.token = base.rstrip("/"), ""

    def call(self, method: str, path: str, body: dict | None = None, ok: tuple[int, ...] = (200, 201, 204)):
        req = urllib.request.Request(
            self.base + path,
            data=json.dumps(body).encode() if body is not None else None,
            method=method,
            headers={"content-type": "application/json", **({"authorization": f"Bearer {self.token}"} if self.token else {})},
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                raw, code = r.read(), r.status
        except urllib.error.HTTPError as e:
            raw, code = e.read(), e.code
        data = json.loads(raw) if raw else None
        if code not in ok:
            raise RuntimeError(f"{method} {path} → {code} {data}")
        return data


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8000")
    ap.add_argument("--email", default="eunseong@swappy.app")
    ap.add_argument("--password", default="swappy1234")
    a = ap.parse_args()
    if "amazonlightsail.com" in a.base:
        print("운영 서버에는 직접 쓰지 않습니다. 로컬에서 채운 뒤 scripts/aws_db.sh dump → demo --yes 로 올리세요.", file=sys.stderr)
        return 2

    api = Api(a.base)
    api.token = api.call("POST", "/api/v1/auth/login", {"email": a.email, "password": a.password})["accessToken"]

    closet = {i["product"]["id"]: i for i in api.call("GET", "/api/v1/me/closet")}
    added = 0
    for pid, via in CLOSET:
        if pid not in closet:
            api.call("POST", "/api/v1/me/closet", {"productId": pid, "addedVia": via})
            added += 1
    print(f"화장대 +{added}")

    liked = {p["id"] for p in api.call("GET", "/api/v1/me/likes")}
    n = 0
    for pid in LIKES:
        if pid not in liked:
            api.call("POST", "/api/v1/me/likes", {"productId": pid}); n += 1
    print(f"찜 +{n}")

    scans = api.call("GET", "/api/v1/me/scans")
    if len(scans) < 5:
        for pid, via in SCANS:
            api.call("POST", "/api/v1/me/scans", {"productId": pid, "source": via})
        print(f"스캔 +{len(SCANS)}")

    # 장바구니 — 수량이 6처럼 부풀어 있던 예전 시험 흔적은 1로 되돌리고, 데모용 제품을 정해 둔 수량으로 맞춘다
    cart = api.call("GET", "/api/v1/me/cart")
    qty = {l["product"]["id"]: l["qty"] for l in cart["lines"]}
    want = {662: 1, **{pid: n for pid, n in CART}}
    for pid, n in want.items():
        if qty.get(pid) != n:
            if pid in qty:
                api.call("PATCH", f"/api/v1/me/cart/{pid}", {"qty": n})
            else:
                api.call("POST", "/api/v1/me/cart", {"productId": pid, "qty": n})
    print("장바구니 맞춤")

    # 후기 — 배송완료된 주문의 제품에. 이미 쓴 제품은 건너뛴다
    orders = api.call("GET", "/api/v1/me/orders")
    mine = {r["productId"] for r in api.call("GET", "/api/v1/me/reviews")}
    wrote = 0
    for pid, rating, text in REVIEWS:
        if pid in mine:
            continue
        item = next(
            (it for o in orders if o.get("stage") == "delivered" for it in o["items"] if it["productId"] == pid), None
        )
        if item is None:
            print(f"  후기 건너뜀: 배송완료 주문에 {pid}가 없어요")
            continue
        api.call("POST", "/api/v1/me/reviews", {"orderItemId": item["id"], "rating": rating, "body": text})
        wrote += 1
    print(f"후기 +{wrote}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
