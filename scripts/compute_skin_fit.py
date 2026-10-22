#!/usr/bin/env python3
"""제품 × 피부타입 궁합 배치 — ingredient_functions → product_skin_fit (Task 14)

    python scripts/compute_skin_fit.py            # 전체 계산·적재
    python scripts/compute_skin_fit.py --dry-run  # 분포만 출력

`services/skin_fit.evaluate` 하나가 계산하고, 목록 정렬·피부타입 필터·홈 추천 점수·예산 가이드가 이 결과를
읽는다. 라벨(`labels.csv`)이나 규칙(`PREFER`/`AVOID`/`REF`/하드 제외 기준)을 바꾸면 **다시 돌려야** 한다.

멱등하다: 전부 지우고 다시 넣는다(한 트랜잭션). 단일제품뿐 아니라 모든 제품을 계산한다 — 피부타입 필터는
세트·기획 제품에도 걸리고, 이전의 태그 기반 제외도 그랬다.
"""
from __future__ import annotations

import argparse
import sys
import time
from collections import Counter
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_values

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "backend"))
sys.path.insert(0, str(REPO / "scripts"))

from app.config import settings  # noqa: E402
from app.services.skin_fit import PREFER, build_flags, evaluate  # noqa: E402
from compute_similarities import bump_cache_version  # noqa: E402


def load_labels(cur) -> dict[int, tuple]:
    """{ingredient_id: (functions, role, flags+내부 마커, confidence)}"""
    cur.execute(
        """SELECT f.ingredient_id, array_to_string(f.functions, ''), f.role,
                  array_to_string(f.flags, ''), f.confidence, f.allergen_listed, i.norm_name
             FROM ingredient_functions f JOIN ingredients i ON i.id = f.ingredient_id"""
    )
    return {
        i: (fn or "", role, build_flags(fl or "", listed, norm), conf)
        for i, fn, role, fl, conf, listed, norm in cur.fetchall()
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="계산하고 분포만 출력, 적재하지 않는다")
    args = ap.parse_args()

    t0 = time.perf_counter()
    conn = psycopg2.connect(settings.DATABASE_DSN)
    cur = conn.cursor()
    labels = load_labels(cur)
    if not labels:
        sys.exit("ingredient_functions가 비어 있습니다 — scripts/seed_ingredient_functions.py를 먼저 돌리세요.")

    # 라벨이 있는 성분만, 실제 표기 순서(position)와 함께 — 카드 API(load_labeled_docs)와 같은 입력이다
    cur.execute(
        """SELECT pi.product_id, array_agg(pi.ingredient_id ORDER BY pi.position),
                  array_agg(pi.position ORDER BY pi.position)
             FROM product_ingredients pi
             JOIN ingredient_functions f ON f.ingredient_id = pi.ingredient_id
            GROUP BY pi.product_id"""
    )
    docs, poss = {}, {}
    for pid, ings, ps in cur.fetchall():
        docs[pid], poss[pid] = list(ings), list(ps)
    cur.execute("SELECT id FROM products")
    product_ids = [r[0] for r in cur.fetchall()]
    print(f"제품 {len(product_ids):,}건 · 라벨 {len(labels):,}종 · 타입 {len(PREFER)}개")

    rows = []
    dist: dict[str, Counter] = {t: Counter() for t in PREFER}
    excluded: Counter = Counter()
    for pid in product_ids:
        doc = docs.get(pid, [])
        for t in PREFER:
            fit = evaluate(doc, labels, {}, t, None, poss.get(pid))
            dist[t][fit.verdict] += 1
            excluded[t] += fit.excluded
            rows.append((pid, t, fit.score, fit.verdict, fit.matched, fit.excluded,
                         fit.has_fragrance, fit.has_drying_alcohol))

    for t in PREFER:
        print(f"  {t:<11} {dict(dist[t])} · 제외 {excluded[t]:,}")

    if args.dry_run:
        print("--dry-run: 적재하지 않았습니다.")
        return

    cur.execute("DELETE FROM product_skin_fit")
    execute_values(
        cur,
        """INSERT INTO product_skin_fit
               (product_id, skin_type, score, verdict, matched, excluded, has_fragrance, has_drying_alcohol)
           VALUES %s""",
        rows,
        page_size=2000,
    )
    conn.commit()
    print(f"적재 {len(rows):,}행 · {time.perf_counter() - t0:.1f}초")
    bump_cache_version()
    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
