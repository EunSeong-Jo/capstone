#!/usr/bin/env python3
"""D. 추천·예산 구매 가이드 평가 (PROTOCOL.md D절).

    DATABASE_DSN=<로컬 DSN> python3 scripts/eval/budget.py [--n 1000]

실행 중인 백엔드(localhost:8000, 로컬 DB를 보는 컨테이너)의 실제 엔드포인트를 호출한다 — 서비스 경로 그대로.
  1) 불변식: 예산 초과·합계 불일치·단계 순서·중복 제품·제외 제품·무향/무알코올 위반
  2) 품질: 가이드 조합의 평균 궁합 점수 vs 같은 예산·같은 조건의 무작위 조합 (쌍체 부트스트랩)
  3) 메인 추천: 피부타입별 목록의 '주의' 비율 vs 인기순 (/recommendations/main vs 평점·리뷰순)
  4) 지연 p50/p95
"""
from __future__ import annotations

import argparse
import json
import random
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import common  # noqa: E402
from common import SEED  # noqa: E402
import stats  # noqa: E402

from sqlalchemy.dialects import postgresql  # noqa: E402

from app.services.routine_steps import ROUTINE, step_expr  # noqa: E402
from app.services.skin_fit import PREFER  # noqa: E402

API = "http://localhost:8000/api/v1/recommendations"
STEPS = [s.code for s in ROUTINE]


def post(path, body):
    req = urllib.request.Request(API + path, data=json.dumps(body).encode(), headers={"content-type": "application/json"})
    t0 = time.perf_counter()
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.loads(r.read())
    return data, (time.perf_counter() - t0) * 1000


def get(path):
    t0 = time.perf_counter()
    with urllib.request.urlopen(API + path, timeout=60) as r:
        data = json.loads(r.read())
    return data, (time.perf_counter() - t0) * 1000


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--n", type=int, default=1000)
    args = ap.parse_args()
    conn = common.connect()
    cur = conn.cursor()
    rng = random.Random(SEED)

    expr = str(step_expr().compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))
    cur.execute(f"select products.id, {expr} as step, products.price from products join categories on categories.id = products.category_id where products.price is not null")
    pool_all = {i: (s, int(pr)) for i, s, pr in cur.fetchall() if s}
    cur.execute("select product_id, skin_type, score, verdict, excluded, has_fragrance, has_drying_alcohol from product_skin_fit")
    fit = {}
    facts = {}
    for p, t, sc, v, ex, fr, al in cur.fetchall():
        fit[(p, t)] = (sc, v, bool(ex))
        facts[p] = (bool(fr), bool(al))
    types = list(PREFER)

    viol: dict[str, int] = {}
    ex_: dict[str, list] = {}

    def note(k, item):
        viol[k] = viol.get(k, 0) + 1
        ex_.setdefault(k, [])
        if len(ex_[k]) < 3:
            ex_[k].append(item)

    lat, empty, partial = [], 0, 0
    guide_fit, rand_fit = [], []
    n_ok = 0
    for n in range(args.n):
        lo = rng.choice([0, 20000, 30000, 50000, 80000])
        hi = lo + rng.choice([20000, 40000, 70000, 120000, 200000])
        st = rng.choice(types + [None])
        ff, af = rng.random() < 0.3, rng.random() < 0.3
        excl = rng.sample(list(pool_all), rng.choice([0, 0, 3, 10]))
        body = {"budgetMin": lo, "budgetMax": hi, "fragranceFree": ff, "alcoholFree": af, "excludeProductIds": excl}
        if st:
            body["skinType"] = st
        try:
            out, ms = post("/budget", body)
        except Exception as e:  # noqa: BLE001
            note("http_error", (body, str(e)[:80]))
            continue
        lat.append(ms)
        n_ok += 1
        combos = out["combinations"]
        if not combos:
            empty += 1
            continue
        if out["missingSteps"]:
            partial += 1
        for c in combos:
            items = c["items"]
            tot = sum(i["product"]["price"] for i in items)
            ids = [i["product"]["id"] for i in items]
            steps = [i["step"] for i in items]
            if tot != c["total"]:
                note("total_mismatch", (body, tot, c["total"]))
            if tot > hi:
                note("over_budget", (body, tot))
            if c["remaining"] != hi - tot:
                note("remaining_mismatch", (hi, tot, c["remaining"]))
            if steps != [s for s in STEPS if s in steps]:
                note("step_order", (steps,))
            if len(set(ids)) != len(ids):
                note("duplicate_product", (ids,))
            if set(ids) & set(excl):
                note("excluded_product_returned", (ids, excl))
            if len(set(steps)) != len(steps):
                note("duplicate_step", (steps,))
            for i in ids:
                if ff and facts.get(i, (False, False))[0]:
                    note("fragrance_free_violated", (i,))
                if af and facts.get(i, (False, False))[1]:
                    note("alcohol_free_violated", (i,))
                if st and fit.get((i, st), (None, None, False))[2]:
                    note("hard_excluded_type_returned", (i, st))
        # 품질: 조합 목록의 가운데 안(combos[len//2], 점수 최고도 최저가도 아닌 중간)의 평균 궁합 vs 같은 단계 구성의 무작위 조합.
        # 표본 제외 조건: 피부타입이 없는 요청, 빈 단계(missingSteps)가 있는 부분 루틴, 같은 단계에 무작위로 뽑을 후보가 없는 경우
        if st and not out["missingSteps"]:
            best = combos[len(combos) // 2]
            sc = [fit[(i["product"]["id"], st)][0] for i in best["items"] if fit.get((i["product"]["id"], st), (None,))[0] is not None]
            if len(sc) == len(best["items"]):
                steps = [i["step"] for i in best["items"]]
                cand = {s: [p for p, (ss, pr) in pool_all.items() if ss == s and pr <= hi and p not in excl
                            and (not ff or not facts.get(p, (0, 0))[0]) and (not af or not facts.get(p, (0, 0))[1])
                            and fit.get((p, st), (None, None, False))[0] is not None and not fit[(p, st)][2]] for s in steps}
                if all(cand.values()):
                    vals = []
                    for _ in range(300):
                        pick = [rng.choice(cand[s]) for s in steps]
                        t = sum(pool_all[p][1] for p in pick)
                        if lo <= t <= hi:
                            vals.append(sum(fit[(p, st)][0] for p in pick) / len(pick))
                    if len(vals) >= 5:
                        guide_fit.append(sum(sc) / len(sc))
                        rand_fit.append(sum(vals) / len(vals))

    out = {
        "protocol": "PROTOCOL.md D",
        "requests": args.n, "ok": n_ok, "empty_result": empty, "partial_routine": partial,
        "violations": viol, "examples": ex_,
        "latency_ms": {"p50": stats.percentile(lat, 50), "p95": stats.percentile(lat, 95), "n": len(lat)},
    }
    if guide_fit:
        out["quality_vs_random"] = {"n": len(guide_fit), "guide_mean": sum(guide_fit) / len(guide_fit),
                                   "random_mean": sum(rand_fit) / len(rand_fit),
                                   "paired": stats.paired_bootstrap(guide_fit, rand_fit)}

    # 메인 추천: '주의' 비율 — 피부타입별 /main 8개 vs 인기순 8개 (같은 카탈로그)
    cur.execute("select id, coalesce(rating,0), coalesce(review_count,0) from products where composition='single' and status='active'")
    pop = sorted(cur.fetchall(), key=lambda r: (-r[2], -r[1], r[0]))
    pop_ids = [r[0] for r in pop][:8]
    main_rows = {}
    for t in types:
        data, _ms = get(f"/main?skinType={t}&size=8")
        ids = [i["id"] for i in data["items"]]
        cs = sum(1 for i in ids if fit.get((i, t), (0, ""))[1] == "caution")
        pc = sum(1 for i in pop_ids if fit.get((i, t), (0, ""))[1] == "caution")
        gs = [fit[(i, t)][0] for i in ids if fit.get((i, t), (None,))[0] is not None]
        ps = [fit[(i, t)][0] for i in pop_ids if fit.get((i, t), (None,))[0] is not None]
        main_rows[t] = {"main_caution": cs, "popular_caution": pc, "n": len(ids),
                        "main_mean_fit": sum(gs) / len(gs) if gs else None, "popular_mean_fit": sum(ps) / len(ps) if ps else None,
                        "main_hard_excluded": sum(1 for i in ids if fit.get((i, t), (0, "", False))[2])}
    out["main_vs_popular"] = main_rows
    out["env"] = common.env_info(cur, [])
    p = common.dump_json("budget.json", out)
    print(f"요청 {args.n} (성공 {n_ok}) · 빈 결과 {empty} · 부분 루틴 {partial}")
    print("위반:", viol or "없음", ex_ if viol else "")
    print(f"지연 p50 {out['latency_ms']['p50']:.0f}ms p95 {out['latency_ms']['p95']:.0f}ms")
    if "quality_vs_random" in out:
        q = out["quality_vs_random"]
        print(f"평균 궁합 점수: 가이드 {q['guide_mean']:.1f} vs 무작위 {q['random_mean']:.1f} "
              f"(차이 {q['paired']['diff']:+.1f} [{q['paired']['lo']:+.1f},{q['paired']['hi']:+.1f}] n={q['n']})")
    print("메인 추천 vs 인기순 (주의 개수 / 평균 궁합점수):")
    for t, r in main_rows.items():
        print(f"  {t:<11} main 주의 {r['main_caution']}/{r['n']} 평균 {r['main_mean_fit']} | 인기순 주의 {r['popular_caution']}/8 평균 {r['popular_mean_fit']} | main 하드제외 {r['main_hard_excluded']}")
    print("→", p)


if __name__ == "__main__":
    main()
