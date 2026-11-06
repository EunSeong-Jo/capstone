#!/usr/bin/env python3
"""로컬 단독 실행용 데모 시드 — 빈 DB(기준 데이터만 있는 상태)에 시연 계정과 시연 데이터를 채운다. 여러 번 돌려도 안전하다.

하는 일
  1. 시연 계정 5개 가입(frontend/src/data/personas.json — 로그인 화면의 데모 패널과 같다). 조은성만 얼굴 사진 동의 + 구독.
  2. 조은성에게 "배송 완료된" 주문을 하나 만든다(주문 시각을 DB에서 며칠 앞당긴다 — 후기·반품은 배송 완료 주문에서만 된다).
  3. scripts/seed_demo_account.py 를 그대로 써서 화장대·찜·장바구니·주문(취소·반품)·선물·AI 기억·후기를 채운다.
  4. 얼굴 분석 기록과 진단 이력(standalone/demo_analysis.dump)을 조은성 계정으로 가져온다. 날짜는 지난달 말로 옮겨 이번 달 이용 횟수를 모두 남긴다.

사용(start.ps1 이 부른다):
    python standalone/seed_demo.py --base http://127.0.0.1:8800 --dsn postgresql://postgres@127.0.0.1:55432/swappy --pg-bin <pgsql\\bin>
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEMO_EMAIL = "eunseong@swappy.app"
PASSWORD = "swappy1234"
# 조은성의 시연 프로필(운영 시연 계정과 같은 값)
DEMO_SCORES = {"oil": 9, "trouble": 6, "moisture": 3, "sensitivity": 9, "pigmentation": 5}
DEMO_SKIN_TYPE = "hwasan"
# 배송 완료 주문으로 만들 제품(후기 3건의 대상 + 화장대에 들어갈 제품)
DELIVERED = [481, 712, 2063]


def call(base: str, method: str, path: str, body: dict | None = None, token: str = "", ok=(200, 201, 204)):
    req = urllib.request.Request(
        base + path,
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={"content-type": "application/json", **({"authorization": f"Bearer {token}"} if token else {})},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            raw, code = r.read(), r.status
    except urllib.error.HTTPError as e:
        raw, code = e.read(), e.code
    data = json.loads(raw) if raw else None
    if code not in ok:
        raise RuntimeError(f"{method} {path} → {code} {data}")
    return data


def login_or_signup(base: str, email: str, nickname: str, face_consent: bool) -> str:
    try:
        return call(base, "POST", "/api/v1/auth/login", {"email": email, "password": PASSWORD})["accessToken"]
    except RuntimeError:
        pass
    body = {"email": email, "password": PASSWORD, "nickname": nickname, "faceConsent": face_consent}
    return call(base, "POST", "/api/v1/auth/signup", body)["accessToken"]


def wait_health(base: str, seconds: int = 90) -> None:
    for _ in range(seconds):
        try:
            with urllib.request.urlopen(base + "/health", timeout=3) as r:
                if r.status == 200:
                    return
        except Exception:
            time.sleep(1)
    raise RuntimeError("백엔드가 응답하지 않습니다")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8800")
    ap.add_argument("--dsn", required=True)
    ap.add_argument("--pg-bin", required=True, help="pg_restore 가 있는 폴더")
    a = ap.parse_args()
    base = a.base.rstrip("/")
    wait_health(base)

    import psycopg2

    conn = psycopg2.connect(a.dsn)
    conn.autocommit = True
    cur = conn.cursor()

    # 1. 계정
    personas = json.loads((ROOT / "frontend/src/data/personas.json").read_text(encoding="utf-8"))
    personas = personas if isinstance(personas, list) else personas["personas"]
    tokens: dict[str, str] = {}
    for p in sorted(personas, key=lambda x: x["email"] != DEMO_EMAIL):
        tokens[p["email"]] = login_or_signup(base, p["email"], p["nickname"], face_consent=p["email"] == DEMO_EMAIL)
    # 선물 대상(seed_demo_account.py 가 닉네임으로 찾는다)
    for i in (1, 2):
        login_or_signup(base, f"test{i}@swappy.app", f"테스터{i}", False)
    tok = tokens[DEMO_EMAIL]
    for p in personas:
        call(base, "PATCH", "/api/v1/me/profile", {"skinType": DEMO_SKIN_TYPE if p["email"] == DEMO_EMAIL else p["skinType"]}, tokens[p["email"]])
    cur.execute("select id from users where email=%s", (DEMO_EMAIL,))
    uid = cur.fetchone()[0]
    cur.execute("update profiles set scores=%s::jsonb where user_id=%s", (json.dumps(DEMO_SCORES), uid))
    call(base, "PUT", "/api/v1/me/consents/face-photo", {"agreed": True}, tok, ok=(200, 201, 204))
    call(base, "POST", "/api/v1/me/subscription", None, tok)
    print("계정·프로필·구독 준비")

    # 2. 배송 완료 주문 하나(주문 시각을 앞당긴다)
    cur.execute("select count(*) from orders where user_id=%s", (uid,))
    if cur.fetchone()[0] == 0:
        for line in call(base, "GET", "/api/v1/me/cart", None, tok)["lines"]:
            call(base, "DELETE", f"/api/v1/me/cart/{line['product']['id']}", None, tok)
        for pid in DELIVERED:
            call(base, "POST", "/api/v1/me/cart", {"productId": pid, "qty": 1}, tok)
        call(base, "POST", "/api/v1/orders", None, tok)
        cur.execute("update orders set placed_at = placed_at - interval '3 days' where user_id=%s", (uid,))
        print("배송 완료 주문 1건")

    # 3. 시연 데이터(scripts/seed_demo_account.py 를 그대로 쓴다). 반품용 주문은 처음엔 배송 전이라 두 번 돌린다.
    spec = importlib.util.spec_from_file_location("seed_demo_account", ROOT / "scripts" / "seed_demo_account.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    for round_no in (1, 2):
        sys.argv = ["seed_demo_account.py", "--base", base, "--email", DEMO_EMAIL, "--password", PASSWORD]
        mod.main()
        if round_no == 1:
            cur.execute(
                "update orders set placed_at = placed_at - interval '3 days' where user_id=%s and status='placed' and placed_at > now() - interval '1 day'",
                (uid,),
            )

    # 4. 얼굴 분석 기록
    cur.execute("select count(*) from skin_analyses where user_id=%s", (uid,))
    if cur.fetchone()[0] == 0:
        dump = ROOT / "standalone" / "demo_analysis.dump"
        subprocess.run(
            [str(Path(a.pg_bin) / "pg_restore"), "--data-only", "--disable-triggers", "--no-owner", "-d", a.dsn, str(dump)],
            check=True,
        )
        cur.execute("update skin_analyses set user_id=%s where user_id <> %s", (uid, uid))
        cur.execute("update skin_analysis_images set user_id=%s where user_id <> %s", (uid, uid))
        # 진단 이력(피부타입 진단): 화면은 이력이 있으면 그 피부타입을 쓴다 — 없으면 데모 페르소나 값(옹달샘)으로 보인다
        cur.execute("update diagnoses set user_id=%s where user_id <> %s", (uid, uid))
        cur.execute("select setval(pg_get_serial_sequence('diagnoses','id'), (select max(id) from diagnoses))")
        # 가장 최근 기록이 지난달 말(3일 전)이 되도록 전체를 같은 만큼 옮긴다 — 이번 달 이용 횟수(구독 4회)를 모두 남긴다.
        cur.execute("select max(created_at) from skin_analyses where user_id=%s", (uid,))
        latest = cur.fetchone()[0]
        cur.execute("select date_trunc('month', now()) - interval '3 days' - %s::timestamptz", (latest,))
        shift = cur.fetchone()[0]
        cur.execute("update skin_analysis_images set created_at = created_at + %s where user_id=%s", (shift, uid))
        cur.execute("update skin_analyses set created_at = created_at + %s where user_id=%s", (shift, uid))
        print("얼굴 분석 기록 가져옴")
    print("시드 완료")
    return 0


if __name__ == "__main__":
    sys.exit(main())
