#!/usr/bin/env python3
"""A. 성분 유사도·대체품 평가 (PROTOCOL.md A절).

    DATABASE_DSN=<로컬 DSN> python3 scripts/eval/similarity.py pool [--per-cat 10]
    DATABASE_DSN=<로컬 DSN> python3 scripts/eval/similarity.py score

pool   test 시드를 고정 seed 로 뽑고 판정 대기 파일을 만든다. 사람용 파일에는 어느 방식이 낸 후보인지
       적지 않고 행 순서를 섞는다(blind). 방식 대응표는 별도 파일.
score  dev(기존 80 시드)와 test(사람이 grade 를 채운 파일)의 지표·신뢰구간·쌍체 비교를 낸다.
"""
from __future__ import annotations

import argparse
import csv
import random
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import common  # noqa: E402
from common import EVAL_DIR, REPO, SEED  # noqa: E402
import stats  # noqa: E402

from app.services.similarity import (  # noqa: E402
    build_matrix, build_vocab, compute_idf, detect_form, hybrid_topk, topk_cosine,
)
from compute_similarities import load_inorganic_uv, load_labels, load_products  # noqa: E402
from eval_similarity import summarize  # noqa: E402

DEV_GOLD = EVAL_DIR / "similarity_gold.csv"
CURATED_GOLD = EVAL_DIR / "curated_gold.csv"
CURATED_SEED = REPO / "data" / "seed" / "similarity_curated.csv"
TEST_POOL = EVAL_DIR / "similarity_test_pool.csv"        # 사람이 grade 를 채우는 파일(방식 정보 없음)
TEST_METHODS = EVAL_DIR / "similarity_test_methods.csv"  # 방식 대응표 — 판정이 끝날 때까지 열어 보지 않는다
POOL_K = 5
METHODS = ["hybrid", "served", "tfidf", "rating", "random"]


def tuning_product_ids(cur) -> set[int]:
    """튜닝·보정에 쓰인 모든 제품 id(시드·후보 양쪽) — test 시드에서 제외한다."""
    ids: set[int] = set()
    for f in (DEV_GOLD, CURATED_GOLD):
        if f.exists():
            for r in csv.DictReader(f.open(encoding="utf-8")):
                ids |= {int(r["seed_id"]), int(r["cand_id"])}
    goods = set()
    for r in csv.DictReader(CURATED_SEED.open(encoding="utf-8")):
        goods |= {r["seed_goods_no"], r["cand_goods_no"]}
    cur.execute("select id from products where goods_no = any(%s)", (list(goods),))
    ids |= {i for (i,) in cur.fetchall()}
    return ids


def rankings(cur, cat: str, labels, inorganic, k: int = 10):
    """카테고리 하나의 방식별 상위 k. {방식: (ids, idx[n,k], score[n,k])} 와 ids/docs/meta."""
    ids, docs, meta = load_products(cur, cat)
    names = [meta["names"][i] for i in ids]
    fam = [meta["families"][i] for i in ids]
    vocab = build_vocab(docs)
    idf = compute_idf(docs, vocab)
    out = {"tfidf": topk_cosine(build_matrix(docs, vocab, idf), k)}
    # 서비스 배치와 같은 경로: 기본 α/β/γ, 형제 제외(families), 무기 자외선 차단제 축
    out["hybrid"] = hybrid_topk(docs, names, vocab, idf, labels, k, inorganic_uv=inorganic, families=fam)

    pos = {p: i for i, p in enumerate(ids)}
    # 서비스가 실제로 내는 값(DB similarities, curated 보정 포함). 후보가 평가 대상 집합 밖이면 건너뛴다.
    cur.execute("select product_id, similar_id, score from similarities where method='hybrid' and product_id = any(%s) order by product_id, score desc", (ids,))
    served: dict[int, list[tuple[int, float]]] = {}
    for p, s, sc in cur.fetchall():
        served.setdefault(p, []).append((s, sc))
    n = len(ids)
    sidx = -np.ones((n, k), dtype=int)
    ssc = np.zeros((n, k))
    for p, lst in served.items():
        for r, (s, sc) in enumerate([x for x in lst if x[0] in pos][:k]):
            sidx[pos[p], r] = pos[s]
            ssc[pos[p], r] = sc
    out["served"] = (sidx, ssc)

    cur.execute("select id, coalesce(rating,0), coalesce(review_count,0) from products where id = any(%s)", (ids,))
    rv = {i: (r, c) for i, r, c in cur.fetchall()}
    by_rating = sorted(range(n), key=lambda i: (-rv[ids[i]][0], -rv[ids[i]][1], ids[i]))
    ridx = -np.ones((n, k), dtype=int)
    rsc = np.zeros((n, k))
    didx = -np.ones((n, k), dtype=int)
    for s in range(n):
        cand = [j for j in by_rating if j != s and fam[j] != fam[s] or (fam[s] == 0 and j != s)]
        cand = [j for j in cand if ids[j] != ids[s]][:k]
        ridx[s, : len(cand)] = cand
        rng = random.Random(f"{SEED}-{ids[s]}")
        others = [j for j in range(n) if j != s and (fam[s] == 0 or fam[j] != fam[s])]
        didx[s] = rng.sample(others, k)
    out["rating"] = (ridx, rsc)
    out["random"] = (didx, np.zeros((n, k)))
    return ids, docs, meta, out


def cmd_pool(args) -> None:
    conn = common.connect()
    cur = conn.cursor()
    labels = load_labels(cur)
    inorganic = load_inorganic_uv(cur)
    banned = tuning_product_ids(cur)
    cur.execute("select code from categories order by code")
    cats = [c for (c,) in cur.fetchall()]
    rng = random.Random(SEED)
    rows, mrows = [], []
    for cat in cats:
        ids, docs, meta, rk = rankings(cur, cat, labels, inorganic)
        if len(ids) < 40:
            continue
        used = {i for d in docs for i in d}
        cur.execute("select id, name_ko from ingredients where id = any(%s)", (list(used),))
        ing = dict(cur.fetchall())
        elig = [i for i in range(len(ids)) if ids[i] not in banned and (rk["served"][0][i] >= 0).any()]
        seeds = sorted(rng.sample(elig, min(args.per_cat, len(elig))))
        for s in seeds:
            cand: dict[int, list[str]] = {}
            for m in METHODS:
                for j in rk[m][0][s][:POOL_K]:
                    if j >= 0:
                        cand.setdefault(int(j), []).append(m)
            ssum = summarize(docs[s], labels, ing)
            block = []
            for j, ms in cand.items():
                block.append({"category": cat, "seed_id": ids[s], "seed_name": meta["names"][ids[s]],
                              "seed_actives": ssum, "seed_form": detect_form(meta["names"][ids[s]]) or "",
                              "cand_id": ids[j], "cand_name": meta["names"][ids[j]],
                              "cand_actives": summarize(docs[j], labels, ing),
                              "cand_form": detect_form(meta["names"][ids[j]]) or "", "grade": ""})
                mrows.append({"seed_id": ids[s], "cand_id": ids[j], "methods": "+".join(ms)})
            rng.shuffle(block)
            rows += block
    for p, data in ((TEST_POOL, rows), (TEST_METHODS, mrows)):
        with p.open("w", newline="", encoding="utf-8-sig") as fh:
            w = csv.DictWriter(fh, fieldnames=list(data[0]))
            w.writeheader()
            w.writerows(data)
    print(f"test 시드 {len({r['seed_id'] for r in rows})}개 · 판정할 쌍 {len(rows)}개 → {TEST_POOL}")
    print("grade: 0=대체 불가, 1=부분 대체(핵심 기능 일부만 같음), 2=대체 가능")
    cur.close(); conn.close()


def load_grades(path: Path) -> dict[tuple[int, int], int]:
    g = {}
    for r in csv.DictReader(path.open(encoding="utf-8-sig")):
        if str(r.get("grade", "")).strip() != "":
            g[(int(r["seed_id"]), int(r["cand_id"]))] = int(r["grade"])
    return g


def metrics_for(seed_ids, rk, ids, grades, cats):
    """방식별·시드별 지표. 판정 안 된 후보는 0 (보수적), 대신 coverage 를 함께 낸다."""
    pos = {p: i for i, p in enumerate(ids)}
    res = {}
    for m in METHODS:
        idx, sc = rk[m]
        for sid in seed_ids:
            if sid not in pos:
                continue
            s = pos[sid]
            judged_all = [g for (a, _b), g in grades.items() if a == sid]
            top = [int(j) for j in idx[s] if j >= 0]
            got = [grades.get((sid, ids[j])) for j in top]
            vals = [g if g is not None else 0 for g in got]
            r = res.setdefault(m, {})
            r.setdefault("sid", []).append(sid)
            r.setdefault("ndcg10", []).append(stats.ndcg(vals[:10], judged_all, 10))
            r.setdefault("ndcg5", []).append(stats.ndcg(vals[:5], judged_all, 5))
            r.setdefault("p5", []).append(sum(1 for g in vals[:5] if g == 2) / 5)
            r.setdefault("top1_sub", []).append(1.0 if vals and vals[0] == 2 else 0.0)
            r.setdefault("cov10", []).append(sum(1 for g in got[:10] if g is not None) / max(1, len(got[:10])))
            r.setdefault("cat", []).append(cats)
    return res


def summarize_methods(res):
    out = {}
    for m, r in res.items():
        d = {"n_seeds": len(r["sid"])}
        for key in ("ndcg10", "ndcg5", "p5", "top1_sub", "cov10"):
            v = [x for x in r[key] if x == x]
            est, lo, hi = stats.bootstrap_ci(v)
            d[key] = {"mean": est, "lo": lo, "hi": hi, "n": len(v)}
        out[m] = d
    return out


def paired(res, a, b, key="ndcg10"):
    ra, rb = res[a], res[b]
    common_s = sorted(set(ra["sid"]) & set(rb["sid"]))
    ia = {s: v for s, v in zip(ra["sid"], ra[key])}
    ib = {s: v for s, v in zip(rb["sid"], rb[key])}
    xs = [(ia[s], ib[s]) for s in common_s if ia[s] == ia[s] and ib[s] == ib[s]]
    return stats.paired_bootstrap([x for x, _ in xs], [y for _, y in xs])


def cmd_score(_args) -> None:
    conn = common.connect()
    cur = conn.cursor()
    labels = load_labels(cur)
    inorganic = load_inorganic_uv(cur)
    dev_g = load_grades(DEV_GOLD)
    test_g = load_grades(TEST_POOL) if TEST_POOL.exists() else {}
    total_test = sum(1 for _ in csv.DictReader(TEST_POOL.open(encoding="utf-8-sig"))) if TEST_POOL.exists() else 0
    cur.execute("select code from categories order by code")
    cats = [c for (c,) in cur.fetchall()]
    dev_seeds = {s for s, _ in dev_g}
    test_seeds = {s for s, _ in test_g}
    dev_res, test_res = {}, {}
    cal = []   # (served score, 사람 등급) — 점수 구간별 정답률
    fails = []
    for cat in cats:
        ids, docs, meta, rk = rankings(cur, cat, labels, inorganic)
        if len(ids) < 40:
            continue
        for tag, seeds, grades, store in (("dev", dev_seeds, dev_g, dev_res), ("test", test_seeds, test_g, test_res)):
            m = metrics_for(seeds, rk, ids, grades, cat)
            for k, v in m.items():
                dst = store.setdefault(k, {})
                for kk, vv in v.items():
                    dst.setdefault(kk, []).extend(vv)
            if tag == "test":
                pos = {p: i for i, p in enumerate(ids)}
                for sid in seeds:
                    if sid not in pos:
                        continue
                    s = pos[sid]
                    for r_, j in enumerate(rk["served"][0][s][:POOL_K]):
                        if j >= 0 and (sid, ids[j]) in grades:
                            cal.append((float(rk["served"][1][s][r_]), grades[(sid, ids[j])]))
                    top = [int(j) for j in rk["served"][0][s][:POOL_K] if j >= 0]
                    if top and grades.get((sid, ids[top[0]]), None) == 0:
                        fails.append({"seed": meta["names"][sid], "top1": meta["names"][ids[top[0]]], "cat": cat})
    out = {"protocol": "PROTOCOL.md A", "test_judged": len(test_g), "test_rows": total_test}
    out["dev"] = summarize_methods(dev_res) if dev_res else {}
    complete = total_test > 0 and len(test_g) >= 0.95 * total_test
    if test_res and test_g and complete:
        out["test"] = summarize_methods(test_res)
        out["test_paired_ndcg10"] = {f"hybrid_vs_{b}": paired(test_res, "hybrid", b) for b in ("random", "rating", "tfidf")}
        out["test_paired_ndcg10"]["served_vs_hybrid"] = paired(test_res, "served", "hybrid")
        out["test_paired_p5"] = {f"hybrid_vs_{b}": paired(test_res, "hybrid", b, "p5") for b in ("random", "rating", "tfidf")}
        # 점수 구간별 사람 정답률(캘리브레이션): served 점수를 4분위로
        if cal:
            sc = sorted(s for s, _ in cal)
            edges = [stats.percentile(sc, q) for q in (0, 25, 50, 75, 100)]
            bins = []
            for lo, hi in zip(edges[:-1], edges[1:]):
                g = [x for s, x in cal if lo <= s <= hi]
                k2 = sum(1 for x in g if x == 2)
                p, wlo, whi = stats.wilson(k2, len(g))
                bins.append({"score_lo": lo, "score_hi": hi, "n": len(g), "p_replaceable": p, "wilson_lo": wlo, "wilson_hi": whi})
            out["calibration_served"] = bins
        out["failures_top1_grade0"] = fails[:10]
    out["env"] = common.env_info(cur, [DEV_GOLD, TEST_POOL, TEST_METHODS])
    p = common.dump_json("similarity.json", out)
    print_report(out)
    print(f"\n→ {p}")
    cur.close(); conn.close()


def print_report(o):
    def row(tag, d):
        print(f"\n[{tag}] 방식      nDCG@10 [95%CI]         nDCG@5   P@5     cov10")
        for m, v in d.items():
            a, b, c, e = v["ndcg10"], v["ndcg5"], v["p5"], v["cov10"]
            print(f"  {m:<8} {a['mean']:.3f} [{a['lo']:.3f},{a['hi']:.3f}]  {b['mean']:.3f}  {c['mean']:.3f}  {e['mean']:.2f}  (시드 {v['n_seeds']})")
    if o.get("dev"):
        row("dev: 기존 80 시드 — 튜닝에 쓴 자료, random/rating 은 풀에 없어 무효", o["dev"])
    if o.get("test"):
        row("test", o["test"])
        for k, v in o["test_paired_ndcg10"].items():
            print(f"  쌍체 nDCG@10 {k}: 차이 {v['diff']:+.3f} [{v['lo']:+.3f},{v['hi']:+.3f}] n={v['n']}")
    else:
        print(f"\n[test] 판정 {o['test_judged']}/{o['test_rows']} — 95% 이상 채워야 지표를 냅니다: {TEST_POOL} 의 grade 열")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("pool")
    p.add_argument("--per-cat", type=int, default=10)
    sub.add_parser("score")
    a = ap.parse_args()
    {"pool": cmd_pool, "score": cmd_score}[a.cmd](a)
