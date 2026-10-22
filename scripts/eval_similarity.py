#!/usr/bin/env python3
"""유사도 방식 평가 — 정답 데이터가 없어서 직접 만든다 (Task 3).

    python scripts/eval_similarity.py pool  --seeds 30      # 판정할 후보 풀 생성
    python scripts/eval_similarity.py score                 # 판정 결과로 지표 계산

pool   카테고리를 고르게 돌며 시드 제품을 뽑고, 방식별 상위 5개를 합친 후보 풀을
       `data/eval/similarity_pool.csv`로 쓴다. 각 행에 시드·후보의 핵심 성분
       요약이 붙어 있어 사람이(또는 성분 전문가 역할의 AI가) 읽고 `grade`를 채운다.
       0 = 대체 불가, 1 = 부분 대체(핵심 기능 일부만 같음), 2 = 대체 가능.
       판정은 `data/eval/similarity_gold.csv`에 (seed_id, cand_id, grade)로 둔다.
score  gold를 읽어 방식별 nDCG@10·정밀도@5(grade=2 비율)·점수 분포를 낸다.
       후보가 gold에 없으면 0으로 센다(풀에 든 적 없는 후보는 판정되지 않았다는 뜻이라
       보수적으로 깎는다). 방식 간 비교용이지 절대 정확도가 아니다.

DB는 읽기만 한다. 제품 id는 환경마다 같지 않으므로 gold에 제품명도 함께 적는다.
"""
from __future__ import annotations

import argparse
import csv
import math
import random
import sys
from pathlib import Path

import numpy as np
import psycopg2

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "backend"))
sys.path.insert(0, str(REPO / "scripts"))

from app.config import settings  # noqa: E402
from app.services.similarity import (  # noqa: E402
    FUNC_NAMES,
    build_matrix,
    build_vocab,
    compute_idf,
    detect_form,
    hybrid_topk,
    topk_cosine,
)
from compute_similarities import (
    load_inorganic_uv,
    load_labels,
    load_products,
)  # noqa: E402

EVAL_DIR = REPO / "data" / "eval"
POOL = EVAL_DIR / "similarity_pool.csv"
GOLD = EVAL_DIR / "similarity_gold.csv"
# 조회가 많은 제품의 상위 후보를 따로 판정한 것. 후보가 기본 설정에서만 나와 설정 비교에는 쓰지 않는다.
CURATED_GOLD = EVAL_DIR / "curated_gold.csv"
CURATED_SEED = REPO / "data" / "seed" / "similarity_curated.csv"
TOP_POOL = 5


# 비교할 설정. hybrid 계열은 (alpha, beta, gamma, dedupe).
CONFIGS: dict[str, tuple[float, float, float, bool]] = {
    "hybrid_v1": (0.65, 0.35, 0.0, False),   # 변형 접기·제형 없음 (이전 기본값)
    "hybrid_dd": (0.65, 0.35, 0.0, True),
    "hf10": (0.65, 0.35, 0.10, True),
    "hf20": (0.65, 0.35, 0.20, True),
    "hf35": (0.65, 0.35, 0.35, True),
    "hf20_b50": (0.5, 0.5, 0.20, True),
    "hf20_a80": (0.8, 0.2, 0.20, True),
}


def method_tops(docs, names, labels, inorganic, k=10) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    vocab = build_vocab(docs)
    idf = compute_idf(docs, vocab)
    out = {"tfidf": topk_cosine(build_matrix(docs, vocab, idf), k)}
    for name, (a, b, g, dd) in CONFIGS.items():
        out[name] = hybrid_topk(docs, names, vocab, idf, labels, k, a, b, g, inorganic, dd)
    # 선케어 유형(무기/유기) 축의 기여를 보려는 대조군
    out["hf20_nouv"] = hybrid_topk(docs, names, vocab, idf, labels, k, 0.65, 0.35, 0.20, frozenset(), True)
    return out


def summarize(doc, labels, ing_names, limit=7) -> str:
    """앞쪽 활성·에몰리언트 성분을 '이름(기능)'으로."""
    out = []
    for ing in doc:
        lab = labels.get(ing)
        if lab is None or lab[1] not in "ae" or lab[3] < 2:
            continue
        fn = "".join(f for f in lab[0] if f in FUNC_NAMES)
        out.append(f"{ing_names.get(ing, '?')}[{fn}]" if fn else ing_names.get(ing, "?"))
        if len(out) >= limit:
            break
    return " · ".join(out)


def load_gold() -> dict[tuple[int, int], int]:
    if not GOLD.exists():
        return {}
    with GOLD.open(encoding="utf-8") as fh:
        return {(int(r["seed_id"]), int(r["cand_id"])): int(r["grade"]) for r in csv.DictReader(fh)}


def cmd_pool(args) -> None:
    conn = psycopg2.connect(settings.DATABASE_DSN)
    cur = conn.cursor()
    labels = load_labels(cur)
    inorganic = load_inorganic_uv(cur)
    gold = load_gold()
    old_seeds = {s for s, _ in gold}
    cur.execute("SELECT code FROM categories ORDER BY code")
    cats = [r[0] for r in cur.fetchall()]
    rng = random.Random(args.rng)
    per_cat = []
    for cat in cats:
        ids, docs, meta = load_products(cur, cat)
        if len(ids) >= 40:
            per_cat.append((cat, ids, docs, meta))
    if not per_cat:
        raise SystemExit("제품 40건 이상인 카테고리가 없습니다.")
    # 이미 판정한 시드는 항상 다시 포함한다(새 설정이 만든 후보만 추가로 판정하면 된다).
    # --seeds는 거기에 더할 새 시드 수다.
    quota = max(0, args.seeds // len(per_cat))
    extra = args.seeds - quota * len(per_cat)
    rows = []
    for n, (cat, ids, docs, meta) in enumerate(per_cat):
        used = {i for d in docs for i in d}
        cur.execute("SELECT id, name_ko FROM ingredients WHERE id = ANY(%s)", (list(used),))
        ing_names = dict(cur.fetchall())
        names = [meta["names"][i] for i in ids]
        tops = method_tops(docs, names, labels, inorganic)
        take = quota + (1 if n < extra else 0)
        fresh = [i for i in range(len(ids)) if ids[i] not in old_seeds]
        chosen = [i for i in range(len(ids)) if ids[i] in old_seeds]
        chosen += rng.sample(fresh, min(take, len(fresh)))
        for s in chosen:
            pool: dict[int, list[str]] = {}
            for m, (idx, _sc) in tops.items():
                for j in idx[s][:TOP_POOL]:
                    if j >= 0:
                        pool.setdefault(int(j), []).append(m)
            seed_sum = summarize(docs[s], labels, ing_names)
            for j, ms in sorted(pool.items()):
                rows.append({
                    "category": cat, "seed_id": ids[s], "seed_name": meta["names"][ids[s]],
                    "seed_actives": seed_sum, "cand_id": ids[j],
                    "cand_name": meta["names"][ids[j]],
                    "cand_actives": summarize(docs[j], labels, ing_names),
                    "seed_form": detect_form(meta["names"][ids[s]]) or "",
                    "cand_form": detect_form(meta["names"][ids[j]]) or "",
                    "methods": "+".join(ms),
                    "grade": gold.get((ids[s], ids[j]), ""),
                })
    EVAL_DIR.mkdir(parents=True, exist_ok=True)
    with POOL.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    seeds = len({(r["category"], r["seed_id"]) for r in rows})
    pending = sum(1 for r in rows if r["grade"] == "")
    print(f"시드 {seeds}개 · 후보 {len(rows)}행(판정 대기 {pending}) → {POOL}")
    cur.close()
    conn.close()


def cmd_curate_pool(args) -> None:
    """리뷰가 많은 제품(= 많이 보이는 제품) 상위 N개의 기본 설정 상위 후보를 판정 대기로 낸다."""
    conn = psycopg2.connect(settings.DATABASE_DSN)
    cur = conn.cursor()
    labels = load_labels(cur)
    inorganic = load_inorganic_uv(cur)
    done = set(load_gold())
    if CURATED_GOLD.exists():
        with CURATED_GOLD.open(encoding="utf-8") as fh:
            done |= {(int(r["seed_id"]), int(r["cand_id"])) for r in csv.DictReader(fh)}
    judged_seeds = {s for s, _ in done}
    cur.execute("SELECT code FROM categories ORDER BY code")
    rows = []
    for (cat,) in cur.fetchall():
        ids, docs, meta = load_products(cur, cat)
        if len(ids) < 40:
            continue
        names = [meta["names"][i] for i in ids]
        cur.execute(
            "SELECT id, coalesce(review_count,0) FROM products WHERE id = ANY(%s)", (ids,)
        )
        rc = dict(cur.fetchall())
        order = sorted(range(len(ids)), key=lambda i: -rc.get(ids[i], 0))
        quota = max(1, args.top // 4)
        seeds = [i for i in order if ids[i] not in judged_seeds][:quota]
        used = {i for d in docs for i in d}
        cur.execute("SELECT id, name_ko FROM ingredients WHERE id = ANY(%s)", (list(used),))
        ing_names = dict(cur.fetchall())
        vocab = build_vocab(docs)
        idf = compute_idf(docs, vocab)
        idx, _ = hybrid_topk(docs, names, vocab, idf, labels, args.k, inorganic_uv=inorganic)
        for s in seeds:
            seed_sum = summarize(docs[s], labels, ing_names)
            for j in idx[s]:
                if j < 0 or (ids[s], ids[j]) in done:
                    continue
                rows.append({
                    "category": cat, "seed_id": ids[s], "seed_name": names[s],
                    "seed_actives": seed_sum, "seed_form": detect_form(names[s]) or "",
                    "cand_id": ids[j], "cand_name": names[j],
                    "cand_actives": summarize(docs[j], labels, ing_names),
                    "cand_form": detect_form(names[j]) or "", "methods": "default", "grade": "",
                })
    with POOL.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    print(f"시드 {len({r['seed_id'] for r in rows})}개 · 판정 대기 {len(rows)}행 → {POOL}")
    cur.close()
    conn.close()


def cmd_export(_args) -> None:
    """판정 결과를 환경에 무관한 키(goods_no)로 data/seed/similarity_curated.csv에 쓴다."""
    grades: dict[tuple[int, int], int] = dict(load_gold())
    if CURATED_GOLD.exists():
        with CURATED_GOLD.open(encoding="utf-8") as fh:
            for r in csv.DictReader(fh):
                grades[(int(r["seed_id"]), int(r["cand_id"]))] = int(r["grade"])
    conn = psycopg2.connect(settings.DATABASE_DSN)
    cur = conn.cursor()
    pids = list({p for pair in grades for p in pair})
    cur.execute("SELECT id, goods_no FROM products WHERE id = ANY(%s)", (pids,))
    gn = dict(cur.fetchall())
    out = [
        (gn[a], gn[b], g) for (a, b), g in sorted(grades.items())
        if gn.get(a) and gn.get(b)
    ]
    CURATED_SEED.parent.mkdir(parents=True, exist_ok=True)
    with CURATED_SEED.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["seed_goods_no", "cand_goods_no", "grade"])
        w.writerows(out)
    print(f"{len(out)}쌍 → {CURATED_SEED}")
    cur.close()
    conn.close()


def ndcg(grades: list[int], ideal: list[int], k: int) -> float:
    def dcg(g):
        return sum((2**x - 1) / math.log2(i + 2) for i, x in enumerate(g[:k]))
    d = dcg(sorted(ideal, reverse=True))
    return dcg(grades) / d if d > 0 else 0.0


def cmd_score(_args) -> None:
    gold: dict[tuple[int, int], int] = {}
    with GOLD.open(encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            gold[(int(r["seed_id"]), int(r["cand_id"]))] = int(r["grade"])
    seeds = sorted({s for s, _ in gold})
    seed_cat: dict[int, str] = {}
    with POOL.open(encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            seed_cat[int(r["seed_id"])] = r["category"]

    conn = psycopg2.connect(settings.DATABASE_DSN)
    cur = conn.cursor()
    labels = load_labels(cur)
    inorganic = load_inorganic_uv(cur)
    res: dict[str, dict[str, list[float]]] = {}
    bycat: dict[tuple[str, str], list[float]] = {}
    for cat in sorted(set(seed_cat.values())):
        ids, docs, meta = load_products(cur, cat)
        meta_names = meta["names"]
        pos = {pid: i for i, pid in enumerate(ids)}
        names = [meta_names[i] for i in ids]
        tops = method_tops(docs, names, labels, inorganic)
        for sid in (s for s in seeds if seed_cat.get(s) == cat):
            if sid not in pos:
                continue
            judged = [g for (s, _c), g in gold.items() if s == sid]
            for m, (idx, sc) in tops.items():
                got = [gold.get((sid, ids[j]), 0) for j in idx[pos[sid]] if j >= 0]
                r = res.setdefault(m, {"ndcg10": [], "p5": [], "top1": [], "s1": [], "s5": []})
                r["ndcg10"].append(ndcg(got, judged, 10))
                r["p5"].append(sum(1 for g in got[:5] if g == 2) / 5)
                r["top1"].append(got[0] if got else 0)
                r["s1"].append(float(sc[pos[sid]][0]))
                r["s5"].append(float(sc[pos[sid]][4]) if sc.shape[1] > 4 else 0.0)
                bycat.setdefault((cat, m), []).append(ndcg(got, judged, 10))
    print(f"시드 {len(seeds)}개 · 판정 {len(gold)}건\n")
    print(f"{'방식':<12}{'nDCG@10':>9}{'P@5(=2)':>9}{'top1 등급':>10}{'1위점수':>9}{'5위점수':>9}")
    for m, r in res.items():
        print(f"{m:<12}{np.mean(r['ndcg10']):>9.3f}{np.mean(r['p5']):>9.3f}"
              f"{np.mean(r['top1']):>10.2f}{np.mean(r['s1']):>9.3f}{np.mean(r['s5']):>9.3f}")
    print("\n카테고리별 nDCG@10")
    cats = sorted({c for c, _ in bycat})
    print(f"{'방식':<12}" + "".join(f"{c:>10}" for c in cats))
    for m in res:
        print(f"{m:<12}" + "".join(f"{np.mean(bycat[(c, m)]):>10.3f}" for c in cats))
    cur.close()
    conn.close()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("pool")
    p.add_argument("--seeds", type=int, default=30)
    p.add_argument("--rng", type=int, default=11)
    sub.add_parser("score")
    c = sub.add_parser("curate-pool")
    c.add_argument("--top", type=int, default=60)
    c.add_argument("--k", type=int, default=10)
    sub.add_parser("export")
    args = ap.parse_args()
    {"pool": cmd_pool, "score": cmd_score, "curate-pool": cmd_curate_pool, "export": cmd_export}[args.cmd](args)


if __name__ == "__main__":
    main()
