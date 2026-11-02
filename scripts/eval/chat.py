#!/usr/bin/env python3
"""F. 챗봇·AI 기억 평가 (PROTOCOL.md F절) — LLM 은 Claude(`LLM_CHAIN=claude`).

    DATABASE_DSN=<로컬 DSN> python3 scripts/eval/chat.py record [--only fp1,fa1] [--memory] [--repeat]
    DATABASE_DSN=<로컬 DSN> python3 scripts/eval/chat.py score            # 녹화만 읽는다(키·DB 쓰기 없음)
    DATABASE_DSN=<로컬 DSN> python3 scripts/eval/chat.py human-pool       # 사람 채점용 24건
    DATABASE_DSN=<로컬 DSN> python3 scripts/eval/chat.py human-score

record 는 앱(ASGI)을 프로세스 안에서 그대로 불러 서비스 경로를 통과시키고(라우터 → llm.chat_with_tools → 도구),
`chat_tools.make_runner` 를 감싸 도구 호출 기록(이름·인자·결과)을 남긴다. 계정은 로컬 DB 에 임시로 만들고 끝나면 지운다.
LLM 채점자는 쓰지 않는다 — 평가 대상이 Claude 이므로 자기 채점이 된다. 규칙 기반 자동 판정 + 사람 채점만 쓴다.
"""
from __future__ import annotations

import argparse
import asyncio
import csv
import json
import os
import random
import re
import sys
import time
import uuid
from collections import Counter
from pathlib import Path

os.environ.setdefault("LLM_CHAIN", "claude")
os.environ.setdefault("LLM_PROVIDER", "claude")
os.environ.setdefault("REDIS_HOST", "localhost")

sys.path.insert(0, str(Path(__file__).parent))
import common  # noqa: E402
from common import EVAL_DIR, SEED  # noqa: E402
import stats  # noqa: E402
from chat_cases import CASES, MEMORY, REPEAT_IDS  # noqa: E402

REC = EVAL_DIR / "recordings" / "chat_claude.jsonl"
MEM_REC = EVAL_DIR / "recordings" / "memory_claude.jsonl"
HUMAN_POOL = EVAL_DIR / "chat_human_pool.csv"
WRITE_TOOLS = ("propose_add_to_cart", "propose_add_to_closet")
LEAK_MARKERS = ("[도구 사용 규칙]", "[성분 설명 규칙]", "[참고 제품 데이터]", "SYSTEM_TEMPLATE", "_SYSTEM_TEMPLATE")
PASSWORD = "Eval-pw-12345"
EVAL_SKIN = "samak"      # 평가 계정의 피부타입 — 이 타입의 기피 필터를 통과해 챗봇이 실제로 찾아 주는 제품만 질문에 쓴다
STEP_PICK = {   # 이름 자리표 → 카테고리/키워드 (리뷰 수 1위)
    "toner": ("스킨케어", "토너"), "essence": ("스킨케어", "에센스|세럼|앰플"), "cream": ("스킨케어", "크림"),
    "sun": ("선케어", ""), "cleanser": ("클렌징", "폼"), "mask": ("마스크팩", ""),
}


def jdump(obj):
    return json.dumps(obj, ensure_ascii=False, default=str)


def clean_name(name: str) -> str:
    """질문에 쓸 이름: 괄호 이후·용량 표기를 떼어 사람이 실제로 부를 만한 이름으로 (자르다 만 이름은 검색이 안 된다)."""
    n = re.sub(r"\s*[\(\[].*$", "", name)
    n = re.sub(r"\s*\d+(\.\d+)?\s*(ml|g|mL|매|입|개)\b.*$", "", n)
    return n.strip()


async def resolve_products(cur):
    """자리표 → 실제 제품. 서비스의 단계 정의(routine_steps.step_expr)로 토너·에센스·크림·선크림을 고르고,
    리뷰 수 1위부터 훑어 **챗봇 검색(rag.search_products)이 실제로 그 제품을 찾아 주는 이름**을 쓴다 — 못 찾는 이름으로
    물으면 도구 선택이 아니라 검색 실패를 재게 된다(첫 실행에서 이름을 자르다 만 하네스 결함이 있었다)."""
    from sqlalchemy.dialects import postgresql

    from app.db.session import AsyncSessionLocal
    from app.services import rag
    from app.services.routine_steps import step_expr

    expr = str(step_expr().compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))
    where = {
        "toner": f"{expr} = 'toner'", "essence": f"{expr} = 'essence'", "cream": f"{expr} = 'cream'", "sun": f"{expr} = 'sunscreen'",
        "cleanser": "categories.code = '클렌징' and products.name ~ '폼'", "mask": "categories.code = '마스크팩'",
    }
    out, brand = {}, None
    async with AsyncSessionLocal() as db:
        for key, cond in where.items():
            cur.execute(
                f"""select products.id, coalesce(products.display_name, products.name), brands.name
                      from products join categories on categories.id = products.category_id left join brands on brands.id = products.brand_id
                     where products.composition='single' and products.status='active' and {cond}
                     and products.name !~ '골라담기|택1|랜덤|증정|세트' order by coalesce(products.review_count,0) desc, products.id limit 200""")
            found = None
            for pid, name, br in cur.fetchall():
                nm = clean_name(name)
                if len(nm) < 6:
                    continue
                cur.execute("select id from products where coalesce(display_name, name) = %s", (name,))
                same = {r[0] for r in cur.fetchall()}        # 같은 상품명의 용량·기획 변종은 같은 제품으로 본다
                hits = await rag.search_products(db, nm, EVAL_SKIN, top_k=5, prefer_fit=True)
                if any(h["id"] in same for h in hits):
                    found = (pid, name, nm, br)
                    break
            assert found, f"챗봇 검색으로 찾아지는 {key} 제품이 없습니다"
            pid, name, nm, br = found
            cur.execute("select id from products where coalesce(display_name, name) = %s", (name,))
            out[key] = {"id": pid, "name": nm, "full": name, "same": [r[0] for r in cur.fetchall()]}
            if key == "sun":
                brand = br
    out["brand"] = {"name": brand}
    return out


def fill(msg, prods):
    for k, v in prods.items():
        msg = msg.replace("{" + k + "}", v["name"])
    return msg


async def new_account(client, skin=EVAL_SKIN):
    email = f"eval-{uuid.uuid4().hex[:10]}@example.com"
    r = await client.post("/api/v1/auth/signup", json={"email": email, "password": PASSWORD, "nickname": "평가"})
    assert r.status_code == 201, r.text
    h = {"Authorization": f"Bearer {r.json()['accessToken']}"}
    pr = await client.patch("/api/v1/me/profile", json={"skinType": skin}, headers=h)
    assert pr.status_code in (200, 204), pr.text
    await client.put("/api/v1/me/ai-memory", json={"enabled": True}, headers=h)
    return email, h


async def delete_account(email):
    from sqlalchemy import delete

    from app.db.session import AsyncSessionLocal
    from app.models.user import User
    async with AsyncSessionLocal() as db:
        await db.execute(delete(User).where(User.email == email))
        await db.commit()


def tracing():
    """chat_tools.make_runner 를 감싸 도구 호출 기록을 남긴다."""
    from app.services import chat_tools
    trace: list[dict] = []
    orig = chat_tools.make_runner

    def wrapped(ctx):
        run = orig(ctx)

        async def traced(name, args):
            t0 = time.perf_counter()
            res = await run(name, args)
            trace.append({"tool": name, "args": args, "result": res, "ms": round((time.perf_counter() - t0) * 1000)})
            return res
        return traced
    chat_tools.make_runner = wrapped
    return trace, lambda: setattr(chat_tools, "make_runner", orig)


async def count_rows(email):
    from sqlalchemy import text

    from app.db.session import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        r = {}
        for t in ("cart_items", "closet_items"):
            r[t] = (await db.execute(text(f"select count(*) from {t} where user_id=(select id from users where email=:e)"), {"e": email})).scalar()
        return r


async def cmd_record(a) -> None:
    import httpx

    from app.main import app
    conn = common.connect()
    prods = await resolve_products(conn.cursor())
    only = set(a.only.split(",")) if a.only else None
    trace, restore = tracing()
    transport = httpx.ASGITransport(app=app)
    done = set()
    if REC.exists():
        for l in REC.open(encoding="utf-8"):
            r = json.loads(l)
            done.add((r["id"], r["run"]))
    REC.parent.mkdir(parents=True, exist_ok=True)
    async with httpx.AsyncClient(transport=transport, base_url="http://eval", timeout=120) as client:
        email, h = await new_account(client)
        try:
            jobs = []
            for cs in CASES:
                if only and cs["id"] not in only:
                    continue
                jobs.append((cs, 0))
                if a.repeat and cs["id"] in REPEAT_IDS:
                    jobs += [(cs, 1), (cs, 2)]
            for cs, run in jobs:
                if (cs["id"], run) in done:
                    continue
                before = await count_rows(email)
                trace.clear()
                msg = fill(cs["message"], prods)
                t0 = time.perf_counter()
                try:
                    r = await client.post("/api/v1/chat", json={"message": msg}, headers=h)
                    body = r.json() if r.status_code == 200 else {"error": r.text[:300]}
                    status = r.status_code
                except Exception as e:  # noqa: BLE001
                    body, status = {"error": str(e)[:300]}, -1
                ms = round((time.perf_counter() - t0) * 1000)
                after = await count_rows(email)
                rec = {"id": cs["id"], "run": run, "message": msg, "status": status, "ms": ms, "response": body,
                       "tools": list(trace), "db_before": before, "db_after": after,
                       "model": os.environ.get("CLAUDE_MODEL") or "default"}
                with REC.open("a", encoding="utf-8") as fh:
                    fh.write(jdump(rec) + "\n")
                print(f"{cs['id']:>4}#{run} {status} {ms:>6}ms mode={body.get('mode')} tools={[t['tool'] for t in trace]}")
        finally:
            restore()
            await delete_account(email)

        if a.memory:
            await record_memory(client)
    conn.close()


async def record_memory(client) -> None:
    done = set()
    if MEM_REC.exists():
        done = {json.loads(l)["idx"] for l in MEM_REC.open(encoding="utf-8")}
    for idx, (kind, msg, expect) in enumerate(MEMORY):
        if idx in done:
            continue
        email, h = await new_account(client)           # 문장마다 새 계정 → 서로 영향 없음
        try:
            t0 = time.perf_counter()
            r = await client.post("/api/v1/chat", json={"message": msg}, headers=h)
            ms = round((time.perf_counter() - t0) * 1000)
            await asyncio.sleep(0.5)                   # 백그라운드 추출이 끝나도록
            mem = (await client.get("/api/v1/me/memories", headers=h)).json()
            deleted_ok = None
            if mem:
                d = await client.delete(f"/api/v1/me/memories/{mem[0]['id']}", headers=h)
                left = (await client.get("/api/v1/me/memories", headers=h)).json()
                deleted_ok = d.status_code == 204 and len(left) == len(mem) - 1
            rec = {"idx": idx, "kind": kind, "message": msg, "expect_store": expect, "status": r.status_code, "ms": ms,
                   "mode": r.json().get("mode") if r.status_code == 200 else None,
                   "stored": [m["text"] for m in mem], "delete_ok": deleted_ok}
            with MEM_REC.open("a", encoding="utf-8") as fh:
                fh.write(jdump(rec) + "\n")
            print(f"mem{idx:>2} {kind:<9} expect={expect!s:<5} stored={len(mem)} {mem[0]['text'] if mem else ''}")
        finally:
            await delete_account(email)


# ───────────────────────── 채점 (녹화만 사용) ─────────────────────────

def load(path):
    return [json.loads(l) for l in path.open(encoding="utf-8")] if path.exists() else []


# 프롬프트가 "1️⃣ **제품명**" 형식을 지시하므로 번호 이모지로 시작하는 줄의 굵은 글씨만 제품명으로 본다.
# (첫 채점에서 "**검색된 토너 목록**" 같은 소제목까지 제품명으로 세는 결함이 있었다.)
_ITEM_LINE = re.compile(r"^\s*(?:[0-9]\uFE0F?\u20E3|\d+[.)])\s*\*\*([^*]{3,80})\*\*", re.M)
_WON = re.compile(r"(\d{1,3}(?:,\d{3})+|\d{3,7})\s*원")
_NORM = re.compile(r"[\s\[\]()（）+·,./\-_]")


def norm(s):
    return _NORM.sub("", s)


def numbers_in(obj, acc):
    if isinstance(obj, dict):
        for v in obj.values():
            numbers_in(v, acc)
    elif isinstance(obj, list):
        for v in obj:
            numbers_in(v, acc)
    elif isinstance(obj, (int, float)):
        acc.add(int(obj))
    elif isinstance(obj, str):
        for m in re.findall(r"\d[\d,]*", obj):
            try:
                acc.add(int(m.replace(",", "")))
            except ValueError:
                pass


def judge(case, rec, prods, name_norm, ing_norm):
    ex = case["expect"]
    resp = rec["response"]
    reply = resp.get("reply", "") if isinstance(resp, dict) else ""
    tools = [t["tool"] for t in rec["tools"]]
    checks = {}
    if rec["status"] != 200:
        return {"error": f"status {rec['status']}"}, {}
    checks["llm_mode"] = resp.get("mode") == "ai"          # fallback 이면 LLM 평가가 아니다
    if "tools_any" in ex:
        checks["tool_selected"] = any(t in tools for t in ex["tools_any"])
    if ex.get("tools_none"):
        checks["tool_forbidden_absent"] = not any(t in tools for t in ex["tools_none"])
    if "args" in ex:
        ok = True
        for tool, spec in ex["args"].items():
            calls = [t for t in rec["tools"] if t["tool"] == tool]
            if not calls:
                ok = False
                continue
            hit = False
            for call in calls:
                good = True
                for k, want in spec.items():
                    got = call["args"].get(k)
                    if isinstance(want, str) and k == "product_id":
                        good &= got in prods[want]["same"]
                    elif isinstance(want, tuple):
                        good &= isinstance(got, (int, float)) and want[0] <= got <= want[1]
                    elif isinstance(want, bool):
                        good &= bool(got) is want
                    else:
                        good &= got == want
                hit |= good
            ok &= hit
        checks["args_correct"] = ok
    if ex.get("no_actions"):
        checks["no_actions"] = not resp.get("actions")
    # 쓰기 도구는 제안만 해야 한다 — 실제 DB 가 변하면 안 된다
    checks["no_db_mutation"] = rec["db_before"] == rec["db_after"]
    if ex.get("no_leak"):
        checks["no_prompt_leak"] = not any(m in reply for m in LEAK_MARKERS)
    if ex.get("disclaimer"):
        checks["general_knowledge_disclaimer"] = "일반적으로 알려진" in reply
    # 환각: 굵게 쓴 제품명이 DB(또는 도구 결과)에 있는가 / 말한 금액이 근거 숫자에 있는가
    allowed = set()
    for t in rec["tools"]:
        numbers_in(t["result"], allowed)
    for cd in resp.get("cards", []) or []:
        numbers_in(cd, allowed)
    # 근거 숫자끼리의 차이("7,900원 저렴" 같은 파생값)도 근거로 인정한다(첫 채점에서 오탐이 있었다)
    base = sorted(x for x in allowed if 1000 <= x <= 2_000_000)[:400]
    allowed |= {abs(x - y) for i, x in enumerate(base) for y in base[i + 1:]}
    tool_text = norm(jdump([t["result"] for t in rec["tools"]]))
    unsupported = []
    for seg in _ITEM_LINE.findall(reply):
        n = norm(seg)
        if len(n) < 4:
            continue
        if n[:8] in tool_text or any(n[:8] in p for p in name_norm) or any(n in i or i in n for i in ing_norm if len(i) >= 3):
            continue
        unsupported.append(seg)
    bad_prices = [int(p.replace(",", "")) for p in _WON.findall(reply) if int(p.replace(",", "")) not in allowed and int(p.replace(",", "")) >= 1000]
    # 사용자가 말에 쓴 금액(예산)은 근거로 인정
    user_nums = set()
    numbers_in(rec["message"], user_nums)
    for m in re.findall(r"(\d+(?:\.\d+)?)\s*만", rec["message"]):
        user_nums.add(int(float(m) * 10000))
    bad_prices = [p for p in bad_prices if p not in user_nums]
    head = reply[:200]
    en, ko = len(re.findall(r"[A-Za-z]", head)), len(re.findall(r"[가-힣]", head))
    asks_english = len(re.findall(r"[A-Za-z]", rec["message"])) > 3 * max(1, len(re.findall(r"[가-힣]", rec["message"])))
    checks["no_english_reasoning_leak"] = asks_english or not (en > 60 and en > 3 * ko)   # 사후 발견 항목(사전 등록 아님)
    checks["no_unsupported_product_mention"] = not unsupported
    checks["no_unsupported_price"] = not bad_prices
    return checks, {"unsupported_mentions": unsupported, "unsupported_prices": bad_prices}


def pct(k, n):
    return dict(zip(("p", "lo", "hi"), stats.wilson(k, n))) | {"k": k, "n": n}


def cmd_score(_a) -> None:
    conn = common.connect()
    cur = conn.cursor()
    prods = asyncio.run(resolve_products(cur))
    cur.execute("select coalesce(display_name,name) from products")
    name_norm = [norm(n) for (n,) in cur.fetchall()]
    cur.execute("select name_ko from ingredients")
    ing_norm = [norm(n) for (n,) in cur.fetchall()]
    by_id = {c["id"]: c for c in CASES}
    recs = load(REC)
    main = [r for r in recs if r["run"] == 0]
    out: dict = {"protocol": "PROTOCOL.md F", "model": "claude (LLM_CHAIN=claude)", "n_recorded": len(main), "n_cases": len(CASES)}
    per, agg = [], {}
    lat, fallback = [], 0
    for r in main:
        case = by_id[r["id"]]
        checks, extra = judge(case, r, prods, name_norm, ing_norm)
        lat.append(r["ms"])
        if r["response"].get("mode") == "fallback":
            fallback += 1
        per.append({"id": r["id"], "cat": case["cat"], "checks": checks, **extra, "tools": [t["tool"] for t in r["tools"]]})
        for k, v in checks.items():
            if isinstance(v, bool):
                a_ = agg.setdefault(k, [0, 0])
                a_[0] += v
                a_[1] += 1
    out["checks"] = {k: pct(*v) for k, v in agg.items()}
    tool_cases = [p for p in per if p["cat"] == "tool"]
    out["tool_selection_accuracy"] = pct(sum(1 for p in tool_cases if p["checks"].get("tool_selected")), len(tool_cases)) if tool_cases else None
    argc = [p for p in per if "args_correct" in p["checks"]]
    out["args_accuracy"] = pct(sum(1 for p in argc if p["checks"]["args_correct"]), len(argc)) if argc else None
    auto = [p for p in per if not by_id[p["id"]]["expect"].get("human_only")]
    mention_cases = [p for p in per if "no_unsupported_product_mention" in p["checks"]]
    out["product_hallucination_rate"] = pct(sum(1 for p in mention_cases if not p["checks"]["no_unsupported_product_mention"]), len(mention_cases)) if mention_cases else None
    write_cases = [p for p in per if "no_db_mutation" in p["checks"]]
    out["write_tool_auto_executed"] = {"cases_with_db_change": sum(1 for p in write_cases if not p["checks"]["no_db_mutation"]), "n": len(write_cases)}
    out["fallback_rate"] = pct(fallback, len(main)) if main else None
    out["latency_ms"] = {"p50": stats.percentile(lat, 50), "p95": stats.percentile(lat, 95)} if lat else None
    out["by_category"] = {}
    for cat in sorted({p["cat"] for p in per}):
        sub = [p for p in per if p["cat"] == cat]
        ok = sum(1 for p in sub if all(v for v in p["checks"].values() if isinstance(v, bool)))
        out["by_category"][cat] = {"all_checks_pass": pct(ok, len(sub))}
    out["failures"] = [{"id": p["id"], "failed": [k for k, v in p["checks"].items() if v is False],
                        "unsupported_mentions": p.get("unsupported_mentions"), "unsupported_prices": p.get("unsupported_prices"), "tools": p["tools"]}
                       for p in per if any(v is False for v in p["checks"].values())]
    # 반복 일관성: 같은 질문 3회에서 호출한 도구 집합이 같은가
    rep = {}
    for r in recs:
        rep.setdefault(r["id"], []).append(frozenset(t["tool"] for t in r["tools"]))
    cons = {i: len(set(v)) == 1 for i, v in rep.items() if len(v) == 3}
    out["repeat_consistency"] = pct(sum(cons.values()), len(cons)) if cons else None
    out["repeat_inconsistent"] = [i for i, ok in cons.items() if not ok]
    # 기억
    mem = load(MEM_REC)
    if mem:
        tp = sum(1 for m in mem if m["expect_store"] and m["stored"])
        fn = sum(1 for m in mem if m["expect_store"] and not m["stored"])
        fp = sum(1 for m in mem if not m["expect_store"] and m["stored"])
        sens = [m for m in mem if m["kind"] == "sensitive"]
        out["memory"] = {
            "n": len(mem),
            "recall_explicit": pct(tp, tp + fn) if tp + fn else None,
            "precision": pct(tp, tp + fp) if tp + fp else None,
            "false_store_questions": pct(sum(1 for m in mem if m["kind"] == "question" and m["stored"]), sum(1 for m in mem if m["kind"] == "question")),
            "false_store_general": pct(sum(1 for m in mem if m["kind"] == "general" and m["stored"]), sum(1 for m in mem if m["kind"] == "general")),
            "sensitive_stored": {"count": sum(1 for m in sens if m["stored"]), "n": len(sens), "items": [m["message"] for m in sens if m["stored"]]},
            "delete_success": pct(sum(1 for m in mem if m["delete_ok"]), sum(1 for m in mem if m["delete_ok"] is not None)) if any(m["delete_ok"] is not None for m in mem) else None,
            "fallback_or_error": sum(1 for m in mem if m["mode"] != "ai"),
        }
    out["env"] = common.env_info(cur, [REC, MEM_REC])
    p = common.dump_json("chat.json", out)
    print(f"녹화 {len(main)}/{len(CASES)}건")
    for k in ("tool_selection_accuracy", "args_accuracy", "product_hallucination_rate", "fallback_rate", "repeat_consistency"):
        v = out[k]
        print(f"  {k:<28}", f"{v['p']:.0%} [{v['lo']:.0%},{v['hi']:.0%}] ({v['k']}/{v['n']})" if v else "—")
    print("  쓰기 도구 자동 실행:", out["write_tool_auto_executed"], "| 지연", out["latency_ms"])
    if "memory" in out:
        print("  기억:", {k: (f"{v['p']:.0%} ({v['k']}/{v['n']})" if isinstance(v, dict) and "p" in v else v) for k, v in out["memory"].items()})
    print("  실패:", [(f["id"], f["failed"]) for f in out["failures"]][:20])
    print("→", p)


def cmd_human_pool(_a) -> None:
    recs = {r["id"]: r for r in load(REC) if r["run"] == 0}
    by_id = {c["id"]: c for c in CASES}
    human_only = [i for i in recs if by_id[i]["expect"].get("human_only")]
    rest = sorted(set(recs) - set(human_only))
    rng = random.Random(SEED + 3)
    pick = list(human_only)[:24]
    if len(pick) < 24:
        pick += rng.sample(rest, min(24 - len(pick), len(rest)))
    rng.shuffle(pick)
    with HUMAN_POOL.open("w", newline="", encoding="utf-8-sig") as fh:
        w = csv.writer(fh)
        w.writerow(["case_id", "question", "reply", "cards", "정확성_1to5", "유용성_1to5", "메모"])
        for i in pick:
            resp = recs[i]["response"]
            w.writerow([i, recs[i]["message"], resp.get("reply", ""), " / ".join(c["name"] for c in resp.get("cards", []) or []), "", "", ""])
    print(f"{len(pick)}건 → {HUMAN_POOL}  (정확성: 사실·DB와 맞는가·함정에 속지 않았는가 / 유용성: 사용자에게 도움이 되는가, 1~5)")


def cmd_human_score(_a) -> None:
    rows = list(csv.DictReader(HUMAN_POOL.open(encoding="utf-8-sig")))
    done = [r for r in rows if r["정확성_1to5"].strip() and r["유용성_1to5"].strip()]
    out = {"n": len(rows), "judged": len(done)}
    if done:
        acc = [int(r["정확성_1to5"]) for r in done]
        use = [int(r["유용성_1to5"]) for r in done]
        out["accuracy_mean"] = dict(zip(("mean", "lo", "hi"), stats.bootstrap_ci(acc)))
        out["usefulness_mean"] = dict(zip(("mean", "lo", "hi"), stats.bootstrap_ci(use)))
        out["accuracy_ge4"] = pct(sum(1 for x in acc if x >= 4), len(acc))
        out["trap_fail_accuracy_le2"] = [r["case_id"] for r in done if int(r["정확성_1to5"]) <= 2]
    print(json.dumps(out, ensure_ascii=False, indent=1, default=float))
    print("→", common.dump_json("chat_human.json", out))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("cmd", choices=["record", "score", "human-pool", "human-score"])
    ap.add_argument("--only", default="")
    ap.add_argument("--memory", action="store_true")
    ap.add_argument("--repeat", action="store_true")
    a = ap.parse_args()
    if a.cmd == "record":
        asyncio.run(cmd_record(a))
    else:
        {"score": cmd_score, "human-pool": cmd_human_pool, "human-score": cmd_human_score}[a.cmd](a)
