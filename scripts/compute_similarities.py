#!/usr/bin/env python3
"""성분 유사도 배치 — product_ingredients → similarities (Task 3)

    python scripts/compute_similarities.py --category 선케어
    python scripts/compute_similarities.py --dry-run
    python scripts/compute_similarities.py --duplicates

멱등하다. 처리한 (카테고리 × 방식) 범위를 지우고 다시 넣으므로 여러 번
돌려도 행수가 늘지 않는다.

왜 카테고리 안에서만 비교하나
------------------------------
선케어 제품의 대체품이 클렌징이면 안 된다. 성분만 보면 둘 다 정제수·
글리세린이 앞자리라 꽤 비슷하게 나오지만 쓰임이 다르다. 카테고리로 후보를
가두면 결과가 맞아떨어지고, 계산량도 861만 쌍에서 630만 쌍으로 준다.

무엇을 빼고 계산하나
--------------------
  묶음('N종 택1')  ingredient_count_raw > 고유 성분수 × 2 인 제품.
                   호수별 전성분을 이어 붙여 어느 호수의 성분인지 알 수 없다.
  성분 5개 미만    벡터가 짧아 흔한 성분 몇 개로 점수가 1.0 가까이 튄다.

세 방식(tfidf·jaccard·rbo)을 모두 적재하는 이유는 similarities의 PK가
(product_id, similar_id, method)라 나란히 두고 비교할 수 있기 때문이다.
어느 쪽이 나은지는 눈으로 보고 정한다 — 정답 데이터가 없다.
"""
from __future__ import annotations

import argparse
import sys
import time
from collections import defaultdict
from pathlib import Path

import numpy as np
import psycopg2
from psycopg2.extras import Json, execute_values

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "backend"))

from app.config import settings  # noqa: E402
from app.services.similarity import (  # noqa: E402
    METHODS,
    build_matrix,
    build_vocab,
    compute_idf,
    is_bundle,
    jaccard,
    min_ingredients,
    rbo,
    shared_top,
    topk_cosine,
)

# rbo는 쌍마다 선형 시간이 든다. 전 쌍에 돌리면 감당이 안 되므로
# tfidf 상위 후보만 재순위한다. 100이면 상위 20을 뽑기에 넉넉하다.
RBO_CANDIDATES = 100

# 중복 제품 후보로 볼 기준. 성분 구성이 이 정도로 같으면 같은 제품이거나
# 용량만 다른 변형이다.
DUPLICATE_THRESHOLD = 0.999


def load_products(cur, category: str | None) -> tuple[list[int], list[list[int]], dict]:
    """(product_id 목록, 성분 목록, 메타) — position 오름차순.

    성분 순서를 유지해야 rbo가 의미를 갖는다.
    """
    # 단일제품만 계산한다. 증정·굿즈·묶음은 전성분이 제품 하나에 대응한다고
    # 보장할 수 없다 — 특히 묶음은 여러 제품의 전성분이 한 셀에 뭉쳐 있어
    # 무엇과도 비슷해진다. 판정은 products.composition(app/utils/composition.py).
    conds = ["p.composition = 'single'"]
    args: tuple = ()
    if category:
        conds.append("c.code = %s")
        args = (category,)
    where = "WHERE " + " AND ".join(conds)
    cur.execute(
        f"""
        SELECT p.id, p.name, p.ingredient_count_raw,
               array_agg(pi.ingredient_id ORDER BY pi.position) AS ings
          FROM products p
          JOIN product_ingredients pi ON pi.product_id = p.id
          LEFT JOIN categories c ON c.id = p.category_id
          {where}
         GROUP BY p.id, p.name, p.ingredient_count_raw
         ORDER BY p.id
        """,
        args,
    )
    rows = cur.fetchall()

    ids: list[int] = []
    docs: list[list[int]] = []
    names: dict[int, str] = {}
    dropped: list[int] = []
    skipped = {"composition": 0, "bundle": 0, "too_few": 0}

    for pid, name, raw_count, ings in rows:
        if not min_ingredients(len(ings)):
            skipped["too_few"] += 1
            dropped.append(pid)
            continue
        if is_bundle(len(ings), raw_count):
            skipped["bundle"] += 1
            dropped.append(pid)
            continue
        ids.append(pid)
        docs.append(list(ings))
        names[pid] = name

    # composition으로 걸러진 건수는 위 SQL이 애초에 안 가져오므로 따로 센다.
    # 보고에서 '전체 N건 중 M건 제외'가 말이 되게 하려는 것뿐이다.
    cur.execute(
        f"""SELECT count(*) FROM products p
              LEFT JOIN categories c ON c.id = p.category_id
             WHERE p.composition <> 'single'{' AND c.code = %s' if category else ''}""",
        (category,) if category else (),
    )
    skipped["composition"] = cur.fetchone()[0]

    return ids, docs, {
        "skipped": skipped,
        "names": names,
        "dropped": dropped,
        "total": len(rows) + skipped["composition"],
    }


def ingredient_names(cur, docs: list[list[int]]) -> dict[int, str]:
    """shared_ingredients에 넣을 성분명. 등장한 것만 조회한다."""
    used = {i for doc in docs for i in doc}
    if not used:
        return {}
    cur.execute(
        "SELECT id, name_ko FROM ingredients WHERE id = ANY(%s)", (list(used),)
    )
    return dict(cur.fetchall())


def rows_tfidf(ids, docs, vocab, idf, matrix, ing_names, topk):
    idx, score = topk_cosine(matrix, k=topk)
    out = []
    for i, pid in enumerate(ids):
        for j, s in zip(idx[i], score[i]):
            if j < 0:
                continue
            out.append((
                pid, ids[j], "tfidf", float(s),
                Json(shared_top(docs[i], docs[j], vocab, idf, ing_names)),
            ))
    return out, (idx, score)


def rows_jaccard(ids, docs, vocab, idf, ing_names, topk):
    """전 쌍을 도는 대신 성분 → 제품 역색인으로 후보를 좁힌다.

    교집합이 0인 쌍은 애초에 점수가 0이라 볼 필요가 없다. 흔한 성분 때문에
    후보가 크게 줄지는 않지만, 그래도 파이썬 루프를 절반 이하로 줄인다.
    """
    sets = [set(d) for d in docs]
    inverted: dict[int, list[int]] = defaultdict(list)
    for i, s in enumerate(sets):
        for ing in s:
            inverted[ing].append(i)

    out = []
    for i, pid in enumerate(ids):
        candidates: set[int] = set()
        for ing in sets[i]:
            candidates.update(inverted[ing])
        candidates.discard(i)

        scored = [(jaccard(sets[i], sets[j]), j) for j in candidates]
        scored = [x for x in scored if x[0] > 0]
        scored.sort(key=lambda x: (-x[0], ids[x[1]]))
        for s, j in scored[:topk]:
            out.append((
                pid, ids[j], "jaccard", float(s),
                Json(shared_top(docs[i], docs[j], vocab, idf, ing_names)),
            ))
    return out


def rows_rbo(ids, docs, vocab, idf, ing_names, topk, tfidf_pool):
    """tfidf 상위 RBO_CANDIDATES건을 순서까지 보고 다시 세운다."""
    idx, _ = tfidf_pool
    out = []
    for i, pid in enumerate(ids):
        pool = [j for j in idx[i][:RBO_CANDIDATES] if j >= 0]
        scored = [(rbo(docs[i], docs[j]), j) for j in pool]
        scored = [x for x in scored if x[0] > 0]
        scored.sort(key=lambda x: (-x[0], ids[x[1]]))
        for s, j in scored[:topk]:
            out.append((
                pid, ids[j], "rbo", float(s),
                Json(shared_top(docs[i], docs[j], vocab, idf, ing_names)),
            ))
    return out


def write(cur, product_ids: list[int], method: str, rows: list[tuple]) -> None:
    """해당 제품 × 방식의 기존 행을 지우고 새로 넣는다.

    DELETE 범위를 product_id로 잡는 이유: 카테고리 단위로 부분 실행할 때
    다른 카테고리의 결과를 건드리면 안 된다.
    """
    cur.execute(
        "DELETE FROM similarities WHERE method = %s AND product_id = ANY(%s)",
        (method, product_ids),
    )
    # 성분 집합이 완전히 같으면 점수가 1.0인데 부동소수점 반올림으로
    # 1.0000000000000004가 나온다. 저장 계약이 0~1이라 여기서 자른다 —
    # 세 방식이 각자 점수를 만들므로 쓰기 직전 한 곳에서 막는 편이 확실하다.
    rows = [(a, b, m, min(1.0, max(0.0, s)), j) for a, b, m, s, j in rows]
    if rows:
        execute_values(
            cur,
            """INSERT INTO similarities
                   (product_id, similar_id, method, score, shared_ingredients)
               VALUES %s
               ON CONFLICT (product_id, similar_id, method) DO UPDATE
                  SET score = EXCLUDED.score,
                      shared_ingredients = EXCLUDED.shared_ingredients,
                      computed_at = now()""",
            rows,
            page_size=1000,
        )


def report_duplicates(ids, names, rows) -> None:
    """유사도가 사실상 1.0인 쌍 — 같은 제품이 두 번 들어갔을 가능성.

    팀원1의 '이미 동일한 단일제품이 있으면 표시' 요구사항이 이 문제다.
    쌍을 한 방향으로만 출력한다.
    """
    seen: set[tuple[int, int]] = set()
    found = []
    for pid, sid, _method, score, _shared in rows:
        if score < DUPLICATE_THRESHOLD:
            continue
        key = (min(pid, sid), max(pid, sid))
        if key in seen:
            continue
        seen.add(key)
        found.append((score, pid, sid))

    print(f"\n중복 후보 {len(found)}쌍 (유사도 ≥ {DUPLICATE_THRESHOLD})")
    for score, pid, sid in sorted(found, reverse=True)[:40]:
        print(f"  {score:.4f}  [{pid}] {names.get(pid, '?')[:44]}")
        print(f"          [{sid}] {names.get(sid, '?')[:44]}")


def run_category(cur, category: str, methods, args) -> dict[str, list]:
    """카테고리 하나를 처리한다. 반환은 방식별 적재 행.

    IDF를 카테고리 안에서 계산한다. 선케어에서는 자외선차단제 성분이 흔해
    변별력이 낮게 잡히는 게 맞고, 그래야 같은 유기자차끼리도 미세한 차이가
    드러난다. 전체 카탈로그로 IDF를 잡으면 '선케어냐 아니냐'만 보게 된다.
    """
    t0 = time.perf_counter()
    ids, docs, meta = load_products(cur, category)
    sk = meta["skipped"]
    print(
        f"\n[{category}] 제품 {len(ids):,}건 (전체 {meta['total']:,} — "
        f"단일제품 아님 {sk['composition']} / 묶음 제외 {sk['bundle']} / "
        f"성분부족 제외 {sk['too_few']})"
    )
    if len(ids) < 2:
        print("  비교할 제품이 2건 미만이라 건너뜁니다.")
        return {}

    ing_names = ingredient_names(cur, docs)
    vocab = build_vocab(docs)
    idf = compute_idf(docs, vocab)
    matrix = build_matrix(docs, vocab, idf)
    print(f"  성분 {len(vocab):,}종 · 비영요소 {matrix.nnz:,}")

    # rbo 재순위에 쓰려고 넉넉히 뽑는다.
    tfidf_rows, tfidf_pool = rows_tfidf(
        ids, docs, vocab, idf, matrix, ing_names, max(args.topk, RBO_CANDIDATES)
    )
    trimmed: dict[int, list] = defaultdict(list)
    for row in tfidf_rows:
        if len(trimmed[row[0]]) < args.topk:
            trimmed[row[0]].append(row)
    tfidf_rows = [r for rows in trimmed.values() for r in rows]

    produced: dict[str, list] = {}
    for method in methods:
        t = time.perf_counter()
        if method == "tfidf":
            rows = tfidf_rows
        elif method == "jaccard":
            rows = rows_jaccard(ids, docs, vocab, idf, ing_names, args.topk)
        else:
            rows = rows_rbo(ids, docs, vocab, idf, ing_names, args.topk, tfidf_pool)
        produced[method] = rows

        scores = np.array([r[3] for r in rows]) if rows else np.array([0.0])
        print(
            f"  {method:<8} {len(rows):>7,}행 · "
            f"평균 {scores.mean():.3f} 중앙 {np.median(scores):.3f} "
            f"최대 {scores.max():.3f} · {time.perf_counter() - t:.1f}초"
        )

    if not args.dry_run:
        # 이번 실행에서 제외된 제품의 옛 결과를 먼저 지운다. write()의 DELETE는
        # 계산 대상(ids)만 훑기 때문에, 기준이 바뀌어 빠진 제품의 행이 그대로
        # 남는다. 실제로 성분 재파싱 뒤 묶음 판정이 바뀐 제품 1건에서
        # 3.7시간 전 점수 60행이 살아남아 있었다.
        if meta["dropped"]:
            cur.execute(
                """DELETE FROM similarities
                    WHERE product_id = ANY(%s) OR similar_id = ANY(%s)""",
                (meta["dropped"], meta["dropped"]),
            )
            if cur.rowcount:
                print(f"  제외된 제품의 옛 결과 {cur.rowcount:,}행 정리")
        for method, rows in produced.items():
            write(cur, ids, method, rows)

    if args.duplicates:
        report_duplicates(ids, meta["names"], produced.get("tfidf", []))

    print(f"  소계 {time.perf_counter() - t0:.1f}초")
    return produced


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--method", choices=(*METHODS, "all"), default="all")
    ap.add_argument("--category", help="카테고리 코드 하나만 처리 (기본: 전부)")
    ap.add_argument("--topk", type=int, default=20)
    ap.add_argument("--dry-run", action="store_true", help="적재 없이 통계만")
    ap.add_argument("--duplicates", action="store_true", help="중복 후보 목록 출력")
    args = ap.parse_args()

    methods = METHODS if args.method == "all" else (args.method,)

    conn = psycopg2.connect(settings.DATABASE_DSN)
    conn.autocommit = False
    cur = conn.cursor()

    if args.category:
        categories = [args.category]
    else:
        cur.execute("SELECT code FROM categories ORDER BY code")
        categories = [r[0] for r in cur.fetchall()]

    print(f"대상 {len(categories)}개 카테고리 · 방식 {'·'.join(methods)} · 상위 {args.topk}개")

    t0 = time.perf_counter()
    total = 0
    for category in categories:
        produced = run_category(cur, category, methods, args)
        total += sum(len(r) for r in produced.values())

    if args.dry_run:
        print(f"\n--dry-run — {total:,}행을 계산했으나 적재하지 않았습니다.")
    else:
        conn.commit()
        print(f"\n적재 완료 — {total:,}행")
    print(f"총 {time.perf_counter() - t0:.1f}초")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
