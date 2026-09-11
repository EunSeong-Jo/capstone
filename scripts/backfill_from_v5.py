#!/usr/bin/env python3
"""v5 정제본 백필 — products.composition · display_name · 총 내용량 (Task 3)

    python scripts/backfill_from_v5.py --dry-run   # 분포만 출력
    python scripts/backfill_from_v5.py            # 실제 갱신

멱등하다. 같은 CSV로 여러 번 돌려도 결과가 같다.

세 값을 함께 채우는 이유는 출처가 같기 때문이다 — 전부 v5에만 있는 컬럼에서
나오고, goods_no 매칭도 한 번이면 된다.

    composition            처리메모·증정기획_정리·상품명_원본으로 판정
    display_name           v5의 `상품명`(정제명). 화면 표시용이다
    volume_ml / volume_g   v5의 `내용량_정리`에서 파싱한 총 내용량

왜 별도 스크립트인가
--------------------
필요한 `처리메모`·`증정기획_정리`·`상품명_원본`·`내용량_정리`는 v5(PR #37)에만
있는 컬럼이고, 현재 DB는 그 이전 CSV로 적재돼 있다. v5 자체의 적재는 goodsNo 중복
(305그룹 524행) 처리 방식이 정해지지 않아 보류 상태라, 구성 값만 먼저 옮긴다.

두 CSV는 goods_no로 100% 겹친다(DB 4,144건 전부 매칭).

앞으로 적재하는 제품은 load_products.py가 같은 판정 함수로 값을 채우므로
이 스크립트는 일회성이다. 다만 v5를 다시 뽑거나 분류 규칙을 고쳤을 때
되돌리기 쉽도록 멱등하게 둔다.
"""
from __future__ import annotations

import argparse
import collections
import csv
import re
import sys
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_values

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "backend"))

from app.config import settings  # noqa: E402
from app.utils.composition import VALUES, classify  # noqa: E402

DEFAULT_CSV = REPO / "data/raw/oliveyoung_products_v5.csv"

_GOODS_NO = re.compile(r"goodsNo=([A-Za-z0-9]+)")

# 오염이 심한 쪽이 이긴다. 묶음분리된 행들은 원본과 goods_no를 공유하므로
# (예: A000000191214가 향수 4종으로 쪼개져 4행) 한 goods_no에 여러 판정이
# 나온다. 그중 하나라도 묶음이면 그 제품은 묶음으로 본다.
_RANK = {v: i for i, v in enumerate(VALUES)}


def bump_cache_version() -> None:
    """products:cache_version INCR — best-effort.

    조회 API가 이 값을 캐시 키에 넣는다. 올리지 않으면 TTL 1시간 동안
    필터 적용 전 응답이 그대로 나간다.
    """
    try:
        import redis
        r = redis.Redis.from_url(
            settings.REDIS_URL, socket_connect_timeout=0.5, socket_timeout=0.5,
        )
        print(f"캐시 버전 갱신 → v{r.incr('products:cache_version')}")
    except Exception as exc:  # noqa: BLE001
        print(f"캐시 버전 갱신 실패(무시): {exc}")


# `내용량_정리`는 '+'로 구성품을 잇고, 각 조각의 머리 수량이 그 구성품의 총량이다.
# 뒤에 붙는 '(N개)'는 낱개 수라 이미 반영돼 있고, '매'는 동봉 시트라 총량과 무관하다.
#     '300ml + 300ml' 기획  →  '600ml (2개)'   → ml 600
#     니베아 7종 8개입       →  '1320ml (8개)'  → ml 1320  (8×165)
#     앰플+모델링팩 세트     →  '2ml + 28g'     → ml 2 · g 28
_AMOUNT_HEAD = re.compile(r"^\s*([\d,]+(?:\.\d+)?)\s*(ml|kg|l|g)\b", re.I)


def _head_amount(text: str) -> tuple[float | None, float | None]:
    m = _AMOUNT_HEAD.match(text)
    if not m:
        return None, None
    n = float(m.group(1).replace(",", ""))
    unit = m.group(2).lower()
    if unit == "ml":
        return n, None
    if unit == "l":
        return n * 1000, None
    if unit == "g":
        return None, n
    return None, n * 1000  # kg


def parse_volume(text: str | None) -> tuple[float | None, float | None]:
    """(volume_ml, volume_g). 부피와 무게는 섞지 않고 각각 합산한다.

    '10매'짜리 시트마스크처럼 ml·g가 없는 제품은 (None, None)이다.
    머리가 수량이 아닌 표기('[기획세트 : 500ml+100ml]' 1건)는 앞 구성품을
    통째로 놓치므로 부분 합계를 쓰느니 비워 둔다.
    """
    text = (text or "").strip()
    if not _AMOUNT_HEAD.match(text):
        return None, None
    ml = g = None
    for seg in text.split("+"):
        a, b = _head_amount(seg.strip())
        if a is not None:
            ml = (ml or 0) + a
        if b is not None:
            g = (g or 0) + b
    return ml, g


def read_csv(path: Path) -> dict[str, tuple]:
    """goods_no → (composition, display_name, volume_ml, volume_g).

    composition은 같은 goods_no 중 더 오염된 판정을 채택한다(묶음분리로 쪼개진
    행들이 식별자를 공유하므로). 나머지는 첫 행 것을 쓴다 — 쪼개진 행들의
    이름이 옵션명만 다르고, 어차피 한 제품으로 접힌다.
    """
    best: dict[str, tuple] = {}
    with open(path, newline="", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            m = _GOODS_NO.search(r.get("상품URL") or "")
            if not m:
                continue
            gno = m.group(1)
            c = classify(
                r.get("상품명_원본"),
                r.get("처리메모"),
                r.get("증정기획_정리"),
                r.get("내용량_원본"),
            )
            name = (r.get("상품명") or "").strip() or None
            vml, vg = parse_volume(r.get("내용량_정리"))
            if gno not in best:
                best[gno] = (c, name, vml, vg)
            elif _RANK[c] > _RANK[best[gno][0]]:
                best[gno] = (c, *best[gno][1:])
    return best


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", type=Path, default=DEFAULT_CSV)
    ap.add_argument("--dry-run", action="store_true", help="갱신 없이 분포만 출력")
    args = ap.parse_args()

    if not args.csv.exists():
        sys.exit(f"CSV가 없습니다: {args.csv}")

    by_goods = read_csv(args.csv)
    print(f"CSV 판정 {len(by_goods):,}건")

    conn = psycopg2.connect(settings.DATABASE_DSN)
    cur = conn.cursor()
    cur.execute(
        "SELECT goods_no, name, composition, display_name, volume_ml, volume_g FROM products"
    )
    rows = cur.fetchall()

    # CSV에 없는 제품은 이름만으로 판정한다. 구 CSV의 상품명은 정제 전
    # 원본이라 '기획'·'N종' 같은 문구가 살아 있어 이름 규칙이 통한다.
    updates: list[tuple] = []
    dist = collections.Counter()
    changed = collections.Counter()
    fallback = named = n_ml = n_g = 0
    for gno, name, current, cur_display, cur_ml, cur_g in rows:
        hit = by_goods.get(gno)
        if hit is None:
            new, display, vml, vg = classify(name), cur_display, cur_ml, cur_g
            fallback += 1
        else:
            new, display, vml, vg = hit
        dist[new] += 1
        if display:
            named += 1
        if vml is not None:
            n_ml += 1
        if vg is not None:
            n_g += 1
        # Decimal과 float을 직접 비교하면 매번 다르다고 나온다.
        same_vol = (
            (cur_ml is None) == (vml is None)
            and (cur_g is None) == (vg is None)
            and (cur_ml is None or float(cur_ml) == float(vml))
            and (cur_g is None or float(cur_g) == float(vg))
        )
        if new != current or display != cur_display or not same_vol:
            updates.append((gno, new, display, vml, vg))
            if new != current:
                changed[f"composition {current} → {new}"] += 1
            if display != cur_display:
                changed["display_name 채움"] += 1
            if not same_vol:
                changed["내용량 채움"] += 1

    print(f"DB 제품 {len(rows):,}건 (CSV 미매칭 {fallback:,}건은 이름으로 판정)")
    print(f"정제명이 있는 제품 {named:,}건 · 총 내용량 ml {n_ml:,} / g {n_g:,}")
    print("\n분류 결과")
    for v in VALUES:
        print(f"  {v:<8}{dist[v]:>6,}  {dist[v] / len(rows) * 100:>5.1f}%")

    if not updates:
        print("\n변경 없음 — 이미 최신입니다")
        conn.close()
        return

    print(f"\n갱신 대상 {len(updates):,}건")
    for k, n in changed.most_common():
        print(f"  {k:<22}{n:>6,}")

    if args.dry_run:
        print("\n--dry-run — 갱신하지 않았습니다")
        conn.close()
        return

    execute_values(
        cur,
        """UPDATE products
              SET composition  = v.composition,
                  display_name = v.display_name,
                  volume_ml    = v.volume_ml,
                  volume_g     = v.volume_g,
                  updated_at   = now()
             FROM (VALUES %s) AS v(goods_no, composition, display_name, volume_ml, volume_g)
            WHERE products.goods_no = v.goods_no""",
        updates,
        page_size=500,
    )
    conn.commit()
    # cur.rowcount는 execute_values가 나눠 보낸 마지막 묶음만 센다(page_size 단위).
    # 전체 건수는 우리가 만든 목록 길이가 정확하다.
    print(f"\n갱신 완료 {len(updates):,}행")
    conn.close()
    bump_cache_version()


if __name__ == "__main__":
    main()
