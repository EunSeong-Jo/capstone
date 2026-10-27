#!/usr/bin/env python3
"""제품마다 후기를 10개 안팎 채운다 — 시연용 (QA 2)

    DATABASE_DSN=<대상 DB> python scripts/seed_sample_reviews.py --dry-run
    DATABASE_DSN=<대상 DB> python scripts/seed_sample_reviews.py
    DATABASE_DSN=<대상 DB> python scripts/seed_sample_reviews.py --recount     # 리뷰 수만 다시 맞춤

실제 후기는 "산 제품에만" 쓸 수 있어 대부분의 제품이 비어 있었다(올리브영 리뷰 수만 크롤링해 둠).
이 스크립트가 만드는 행은 `reviews.is_sample = true`이고 user_id·order_item_id가 NULL이다.
화면에는 구분 표시가 없고, DB에서만 `is_sample`로 구분해 지우거나 교체할 수 있다.

대상 단위
- 단독 제품(`composition='single'` 이고 옵션 아님)과 옵션 묶음의 **원본 행**(후기는 그룹이 함께 쓴다 — `family_ids`)
- 올리브영 `review_count > 0` 인 것. 기획·증정·세트는 목록에 안 나와서 만들지 않는다.

내용
- 건수 8~12(평균 10). 제품 id로 시드를 고정해 재실행해도 같은 결과(결정적).
- 별점 평균은 제품 `rating` ± 0.2 안으로 맞춘다.
- 문장은 scripts/sample_review_texts.py. 그 제품의 성분 기능 라벨에 있는 기능만 말한다.
- 작성자 피부타입은 그 제품의 `product_skin_fit` 판정이 좋은 타입에 가중한다(긍정 후기일수록).

멱등: 대상 제품의 기존 `is_sample` 행을 지우고 다시 만든다. 실제 후기는 건드리지 않는다.
공용 DB에 쓰므로 돌리기 전에 팀에 알린다(CLAUDE.md).
"""
from __future__ import annotations

import argparse
import os
import random
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sample_review_texts as T  # noqa: E402

SKIN_TYPES = ["mulgae", "memilmuk", "ondalsam", "samak", "subuji", "yuriguseul", "injeolmi", "hwasan"]
FUNC_NAMES = "HBSWAOPEU"


def dsn() -> str:
    d = os.environ.get("DATABASE_DSN", "")
    if not d:
        sys.exit("DATABASE_DSN이 비어 있습니다. 대상 DB의 연결 문자열을 환경 변수로 주세요.")
    return d


def rating_split(rng: random.Random, n: int, mean: float) -> list[int]:
    """평균이 mean에 가까운 1~5점 n개. 5점 쪽으로 쏠린 분포에서 뽑고 평균 오차를 줄인다."""
    mean = min(max(mean, 1.0), 5.0)
    base = [5, 5, 5, 4, 4, 3, 2, 1]
    # 평균을 맞추는 가중: 높은 평균일수록 5점 비중을 키운다
    hi = (mean - 3.0) / 2.0  # -1..1
    weights = {5: 3 + 6 * max(hi, 0), 4: 3, 3: 1.5 - 1.2 * max(hi, 0), 2: 0.7 - 0.6 * max(hi, 0) + 1.2 * max(-hi, 0), 1: 0.3 + 1.2 * max(-hi, 0)}
    ws = [max(weights[r], 0.05) for r in (5, 4, 3, 2, 1)]
    best: list[int] = []
    for _ in range(60):
        cand = rng.choices([5, 4, 3, 2, 1], weights=ws, k=n)
        if not best or abs(sum(cand) / n - mean) < abs(sum(best) / n - mean):
            best = cand
        if abs(sum(best) / n - mean) <= 0.1:
            break
    return best


def make_body(rng: random.Random, rating: int, category: str, funcs: list[str]) -> str | None:
    if rng.random() < 0.12:
        return None  # 별점만 남긴 후기
    parts = [rng.choice(T.OPENERS[rating])]
    if rating >= 4 and funcs:
        f = rng.choice(funcs)
        parts.append(rng.choice(T.FUNC_POSITIVE[f]))
    feel = T.CATEGORY_FEEL.get(category)
    if feel and rating >= 3:
        parts.append(rng.choice(feel))
    if rating <= 3:
        parts.append(rng.choice(T.NEGATIVE[rating]))
    closer = rng.choice(T.CLOSERS) if rating >= 4 else ""
    if closer:
        parts.append(closer)
    return " ".join(parts)


def pick_skin(rng: random.Random, rating: int, fit: dict[str, str]) -> str:
    good = [t for t in SKIN_TYPES if fit.get(t) == "good"]
    ok = [t for t in SKIN_TYPES if fit.get(t) == "ok"]
    bad = [t for t in SKIN_TYPES if fit.get(t) == "caution"]
    if rating >= 4 and good and rng.random() < 0.7:
        return rng.choice(good)
    if rating <= 2 and bad and rng.random() < 0.6:
        return rng.choice(bad)
    return rng.choice(ok or SKIN_TYPES)


def build(conn, only: list[int] | None):
    cur = conn.cursor()
    cur.execute(
        """
        SELECT p.id, COALESCE(c.code, ''), p.rating, p.review_count
        FROM products p LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.status = 'active' AND p.review_count > 0 AND p.rating IS NOT NULL
          AND ((p.composition = 'single' AND p.option_parent_id IS NULL) OR p.composition = 'optgroup')
        """
        + (" AND p.id = ANY(%s)" if only else "")
        + " ORDER BY p.id",
        (only,) if only else None,
    )
    units = cur.fetchall()

    cur.execute(
        """
        SELECT pi.product_id, f.functions
        FROM product_ingredients pi JOIN ingredient_functions f ON f.ingredient_id = pi.ingredient_id
        WHERE f.confidence >= 2 AND pi.position <= 12
        """
    )
    func_count: dict[int, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for pid, fs in cur.fetchall():
        for ch in "".join(fs or []):
            if ch in FUNC_NAMES:
                func_count[pid][ch] += 1

    cur.execute("SELECT product_id, skin_type, verdict FROM product_skin_fit")
    fits: dict[int, dict[str, str]] = defaultdict(dict)
    for pid, st, verdict in cur.fetchall():
        fits[pid][st] = verdict

    # 옵션 그룹은 원본 행의 기능·궁합이 비어 있을 수 있어 첫 옵션 것을 빌린다
    cur.execute("SELECT option_parent_id, min(id) FROM products WHERE option_parent_id IS NOT NULL GROUP BY 1")
    first_option = dict(cur.fetchall())

    now = datetime.now(timezone.utc)
    rows, stats = [], []
    for pid, category, rating, _rc in units:
        rng = random.Random(pid)
        src = first_option.get(pid, pid)
        funcs = [f for f, _ in sorted(func_count[src].items(), key=lambda kv: -kv[1])[:3]]
        n = rng.randint(8, 12)
        ratings = rating_split(rng, n, float(rating))
        stats.append((float(rating), sum(ratings) / n, n))
        for r in ratings:
            nick = f"{rng.choice(T.NICK_ADJ)}{rng.choice(T.NICK_NOUN)}{rng.randint(10, 99)}"
            rows.append(
                (
                    pid, r, make_body(rng, r, category, funcs), nick, pick_skin(rng, r, fits.get(src, {})),
                    now - timedelta(days=rng.randint(2, 360), hours=rng.randint(0, 23), minutes=rng.randint(0, 59)),
                )
            )
    return units, rows, stats


def recount(cur) -> None:
    """products.registered_review_count = 그 제품이 속한 그룹의 후기 수(옵션 그룹은 원본에 달린 후기를 공유)."""
    cur.execute(
        """
        UPDATE products p SET registered_review_count = COALESCE(r.n, 0)
        FROM (
            SELECT p2.id, (SELECT count(*) FROM reviews rv
                           WHERE rv.product_id = COALESCE(p2.option_parent_id, p2.id)
                              OR rv.product_id = p2.id) AS n
            FROM products p2
        ) r
        WHERE r.id = p.id AND p.registered_review_count IS DISTINCT FROM COALESCE(r.n, 0)
        """
    )
    print(f"  리뷰 수 보정: {cur.rowcount}개 제품")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="쓰지 않고 통계만")
    ap.add_argument("--recount", action="store_true", help="후기는 그대로, 리뷰 수만 다시 맞춤")
    ap.add_argument("--only", type=int, nargs="*", help="이 제품 id만")
    args = ap.parse_args()

    import psycopg2
    from psycopg2.extras import execute_values

    with psycopg2.connect(dsn()) as conn, conn.cursor() as cur:
        if args.recount:
            recount(cur)
            conn.commit()
            return

        units, rows, stats = build(conn, args.only)
        errs = [abs(a - b) for a, b, _ in stats]
        print(f"대상 {len(units)}개 · 후기 {len(rows)}건 (제품당 평균 {len(rows) / max(len(units), 1):.1f})")
        print(f"평균 별점 오차: 평균 {sum(errs) / max(len(errs), 1):.3f} · 최대 {max(errs, default=0):.2f} · 0.2 초과 {sum(e > 0.2 for e in errs)}개")
        for r in rows[:6]:
            print("  예)", r[1], "★", r[3], r[4], "|", r[2])
        if args.dry_run:
            print("\n--dry-run: DB에 쓰지 않고 종료")
            return

        ids = [u[0] for u in units]
        cur.execute("DELETE FROM reviews WHERE is_sample AND product_id = ANY(%s)", (ids,))
        execute_values(
            cur,
            "INSERT INTO reviews (product_id, rating, body, author_nickname, author_skin_type, created_at, is_sample) VALUES %s",
            rows,
            template="(%s, %s, %s, %s, %s, %s, true)",
            page_size=2000,
        )
        recount(cur)
        conn.commit()
        print(f"✓ 후기 {len(rows)}건 적재")


if __name__ == "__main__":
    main()
