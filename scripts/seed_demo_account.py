#!/usr/bin/env python3
"""조은성 데모 계정에 "모든 기능이 보이는" 데이터를 API로 채운다 (여러 번 돌려도 안전).

API를 거치므로 서버의 검증을 그대로 지난다 — 실제 사용자가 하는 것과 같은 경로라, 화면에서 보이는 것과 어긋나지 않는다.
대상은 로컬 서버가 기본이다. 운영(AWS)은 **`--allow-prod`를 줄 때만** 쓴다. 덤프(`scripts/aws_db.sh demo --yes`)는
이미지가 커서 연결이 끊길 수 있어, 운영에는 이 스크립트로 앱과 같은 API 경로를 거쳐 채우는 쪽이 안전하다.
이 계정의 기존 데이터는 지우지 않고 모자란 것만 더한다.

    python3 scripts/seed_demo_account.py                  # 로컬 http://localhost:8000
    python3 scripts/seed_demo_account.py --base https://...amazonlightsail.com --allow-prod --password '...'

반품 주문은 배송완료 단계(주문 30분 뒤)에서만 되므로, 처음 돌리면 주문만 만들고 30분 뒤 다시 돌릴 때 반품 처리한다.
16항목 분석은 API로 만들 수 없다(사진이 필요하다) — 앱에서 구독 계정으로 한 번 촬영하면 저장된 표본으로 16항목이 나온다.

채우는 것
  화장대   무료 한도(20개) 안에서 10개 안팎, 4개 카테고리(스킨케어·선케어·마스크팩·클렌징) 모두, 대체품·더 잘 맞는 제품·액상 리필(토너·세럼)이 나오는 제품으로\n  예산     5~10만원
  찜       카테고리별로 몇 개
  장바구니 몇 개
  주문     취소된 주문 1건, 반품된 주문 1건 (나머지는 이미 배송완료)
  선물     보낸 선물 2건 (받는 사람 닉네임이 없으면 건너뛴다)
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
    # 스킨케어 5 — 토너·세럼은 리필팩이 있어 '리필·다른 용량'에 액상 리필이 나온다(팩 종류 리필은 일부러 뺐다)
    (1722, "search"),   # 라운드랩 1025 독도 토너 200ml — 리필팩(34)이 단가로 더 싸다
    (199, "search"),    # 에스네이처 아쿠아 스쿠알란 세럼 50ml — 리필팩(578)이 단가로 더 싸다
    (2305, "search"),   # 센텔리안24 마데카 데일리 리페어 에센스로션
    (712, "search"),    # 에스트라 아토베리어365 크림
    (2063, "search"),   # 닥터지 레드 블레미쉬 수딩크림
    # 선케어 2
    (1586, "search"),   # 메디힐 마데카소사이드 수분 선세럼
    (912, "search"),    # 스킨1004 센텔라 워터핏 선세럼
    # 클렌징 2
    (867, "scan"),      # 라운드랩 1025 독도 클렌저
    (1491, "scan"),     # 바닐라코 클린잇제로 클렌징밤
    # 마스크팩 1
    (3103, "scan"),     # 라운드랩 소나무 진정 시카 마스크 10매
]
FREE_CLOSET_LIMIT = 20          # 무료 화장대 한도 — 데모 화장대는 이 안에 둔다(절약 가능 금액이 비현실적으로 커 보이지 않게 10개 안팎)
BUDGET = (50_000, 100_000)      # 예산 5~10만원
LIKES = [790, 3042, 828, 953, 662, 3866]          # 마스크팩 2 · 클렌징 1 · 선케어 1 · 스킨케어 1 · 마스크팩 1
CART = [(3866, 1), (790, 2)]
CANCEL_PIDS = [3099, 844]       # 취소할 주문
RETURN_PIDS = [867, 1491]       # 반품할 주문
GIFTS = [(3103, "테스터1", "생일 축하해요! 피부에 순한 팩이에요"), (481, "테스터2", "수고 많았어요, 고마워요")]
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
        try:
            data = json.loads(raw) if raw else None
        except ValueError:
            raise RuntimeError(f"{method} {path} → {code} JSON이 아닌 응답: {raw[:120]!r}") from None
        if code not in ok:
            raise RuntimeError(f"{method} {path} → {code} {data}")
        return data


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8000")
    ap.add_argument("--email", default="eunseong@swappy.app")
    ap.add_argument("--password", default="swappy1234")
    ap.add_argument("--allow-prod", action="store_true", help="운영(amazonlightsail.com) 서버에 쓰는 것을 허용한다")
    a = ap.parse_args()
    if "amazonlightsail.com" in a.base and not a.allow_prod:
        print("운영 서버에 쓰려면 --allow-prod를 주세요.", file=sys.stderr)
        return 2

    api = Api(a.base)
    api.token = api.call("POST", "/api/v1/auth/login", {"email": a.email, "password": a.password})["accessToken"]

    closet = {i["product"]["id"]: i for i in api.call("GET", "/api/v1/me/closet")}
    assert len(CLOSET) <= FREE_CLOSET_LIMIT, "데모 화장대가 무료 한도를 넘어요"
    # 데모 화장대는 정해 둔 구성만 보유 중으로 둔다 — 그 밖의 제품은 '삭제된 제품'으로 옮긴다
    keep = {pid for pid, _ in CLOSET}
    for pid, item in list(closet.items()):
        if item["status"] == "owned" and pid not in keep:
            api.call("DELETE", f"/api/v1/me/closet/{pid}")
    added = 0
    for pid, via in CLOSET:
        if pid not in closet or closet[pid]["status"] != "owned":
            api.call("POST", "/api/v1/me/closet", {"productId": pid, "addedVia": via})
            added += 1
    print(f"화장대 +{added}")

    # 예산 5~10만원
    prof = api.call("GET", "/api/v1/me/profile")
    if (prof.get("budgetMin"), prof.get("budgetMax")) != BUDGET:
        api.call("PATCH", "/api/v1/me/profile", {"budgetMin": BUDGET[0], "budgetMax": BUDGET[1]})
        print("예산 5~10만원")

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

    # 주문 — 취소 1건·반품 1건. 장바구니를 쓰므로 장바구니는 아래에서 다시 맞춘다
    orders = api.call("GET", "/api/v1/me/orders")
    statuses = {o["status"] for o in orders}
    if "cancelled" not in statuses or "returned" not in statuses:
        def buy(pids: list[int]) -> str:
            for line in api.call("GET", "/api/v1/me/cart")["lines"]:
                api.call("DELETE", f"/api/v1/me/cart/{line['product']['id']}")
            for pid in pids:
                api.call("POST", "/api/v1/me/cart", {"productId": pid, "qty": 1})
            return api.call("POST", "/api/v1/orders")["id"]

        if "cancelled" not in statuses:
            oid = buy(CANCEL_PIDS)
            api.call("POST", f"/api/v1/me/orders/{oid}/cancel", {"reason": "단순 변심"})
            print("주문 취소 1건 만듦")
        if "returned" not in statuses:
            cand = next(
                (o for o in orders if o.get("canReturn") and {i["productId"] for i in o["items"]} == set(RETURN_PIDS)), None
            )
            if cand is not None:
                api.call("POST", f"/api/v1/me/orders/{cand['id']}/return", {"reason": "단순 변심"})
                print("주문 반품 1건 처리")
            elif not any({i["productId"] for i in o["items"]} == set(RETURN_PIDS) for o in orders):
                buy(RETURN_PIDS)
                print("반품용 주문을 만들었어요 — 30분 뒤 이 스크립트를 한 번 더 돌리면 반품 처리합니다")
            else:
                print("반품용 주문이 아직 배송완료 전이에요 — 30분 뒤 다시 돌려 주세요")

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

    # 선물 — 받는 사람 닉네임이 없으면(운영에는 다른 계정이 없을 수 있다) 건너뛴다
    if not api.call("GET", "/api/v1/me/gifts/sent"):
        sent = 0
        for pid, nick, msg in GIFTS:
            try:
                api.call("POST", "/api/v1/gifts", {"productId": pid, "recipientNickname": nick, "message": msg})
                sent += 1
            except RuntimeError as e:
                print(f"  선물 건너뜀({nick}): {str(e)[:60]}")
        print(f"선물 +{sent}")

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
