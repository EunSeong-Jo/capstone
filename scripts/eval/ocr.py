#!/usr/bin/env python3
"""E. OCR 제품 매칭 평가 (PROTOCOL.md E절) — 앞면 사진만.

    DATABASE_DSN=<로컬 DSN> python3 scripts/eval/ocr.py run     # 앞면 사진을 서비스 경로로 OCR → 캐시 (CLOVA 호출)
    DATABASE_DSN=<로컬 DSN> python3 scripts/eval/ocr.py score   # 캐시로 매칭·지표 (키 불필요, 반복 가능)

서비스 경로 그대로: services.ocr.recognize_text → " ".join(fields)[:300] → api.products.match_text.
dev = item1~11 (임계값을 정한다), test = item12~48 (임계값을 고정한 채 1회 보고).
test 라벨(`data/ocr_test/labels.csv`)은 사용자가 채운다. 라벨이 없는 item 은 test 지표에서 제외하고 개수를 보고한다.
"""
from __future__ import annotations

import argparse
import asyncio
import csv
import hashlib
import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import common  # noqa: E402
from common import EVAL_DIR, REPO  # noqa: E402
import stats  # noqa: E402

PHOTOS = REPO / "data" / "ocr_test"
LABELS = PHOTOS / "labels.csv"
LABELS_TEST = PHOTOS / "labels_test.csv"      # test(item12~48) 정답 — in_catalog 를 Y/N 으로 명시해야 채점에 포함된다
CACHE = EVAL_DIR / "recordings" / "ocr_service_cache.json"
SCAN_QUERY_MAX = 300      # api/products.py SCAN_QUERY_MAX 와 같아야 한다
DEV_ITEMS = set(range(1, 12))


def fronts():
    out = []
    for p in PHOTOS.glob("item*_f.jpg"):
        m = re.fullmatch(r"item(\d+)_f", p.stem)
        if m:
            out.append((int(m.group(1)), p))
    return sorted(out)


def load_labels():
    """dev: labels.csv (비어 있는 product_ids = 카탈로그 없음). test: labels_test.csv — 빈 칸을 '없음'으로 오해하지 않도록
    in_catalog 가 Y/N 으로 적힌 행만 인정한다."""
    rows = [l for l in LABELS.open(encoding="utf-8") if not l.startswith("#")]
    out = {}
    for r in csv.DictReader(rows):
        pid = r["product_ids"].strip()
        out[r["item"].strip()] = {int(x) for x in pid.split("|") if x.strip()}
    if LABELS_TEST.exists():
        for r in csv.DictReader(LABELS_TEST.open(encoding="utf-8-sig")):
            flag = r["in_catalog"].strip().upper()
            pid = r["product_ids"].strip()
            if flag == "N":
                out[r["item"].strip()] = set()
            elif flag == "Y" and pid:
                out[r["item"].strip()] = {int(x) for x in pid.split("|") if x.strip()}
    return out


def cmd_template(_a) -> None:
    if LABELS_TEST.exists():
        raise SystemExit(f"{LABELS_TEST} 가 이미 있습니다(덮어쓰지 않습니다).")
    with LABELS_TEST.open("w", newline="", encoding="utf-8-sig") as fh:
        w = csv.writer(fh)
        w.writerow(["item", "in_catalog", "product_ids", "label"])
        for n, _p in fronts():
            if n not in DEV_ITEMS:
                w.writerow([f"item{n}", "", "", ""])
    print(f"→ {LABELS_TEST}  (사진을 보고: 카탈로그에 있으면 in_catalog=Y + product_ids('|' 구분, 용량·기획 변종 모두), 없으면 N)")


async def cmd_find(a) -> None:
    from sqlalchemy import text

    from app.db.session import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        # 한글 상품명 + 영문 상품명(product_names_en)을 함께 찾는다. 영문 이름이 없는 제품도 있으므로 한글 이름 검색이 기본이다.
        rows = (await db.execute(text(
            "select p.id, p.name, p.composition, p.image_url, (select string_agg(e.name_en, ' / ') from product_names_en e where e.product_id = p.id) "
            "from products p where p.status='active' and p.composition <> 'optgroup' and (p.name ilike :q or exists "
            "(select 1 from product_names_en e where e.product_id = p.id and (e.name_en ilike :q or e.brand_en ilike :q))) "
            "order by p.id limit 40"), {"q": f"%{a.q}%"})).all()
    for i, n, comp, img, en in rows:
        # composition 이 optgroup 인 행은 스캔 후보에서 빠진다(옵션 행이 대신 나온다). 이미지는 사진과 대조할 때 연다.
        print(i, f"({comp})", n + (f"   [EN] {en}" if en else ""))
        if img:
            print("     ", img)


def prep_placeholder():
    pass


def prep(path: Path) -> bytes:
    """앱의 사진 전처리와 같게: EXIF 방향 보정 → 장변 1024px로 축소 → JPEG q85 (frontend/src/utils/scanImage.ts).
    이미 1024px 이하인 사진(dev)은 원본 바이트를 그대로 쓴다(재인코딩하지 않는다)."""
    import io

    from PIL import Image, ImageOps

    raw = path.read_bytes()
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(raw)))
    if max(img.size) <= 1024:
        return raw
    scale = 1024 / max(img.size)
    img = img.convert("RGB").resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=85)
    return buf.getvalue()


def load_cache():
    return json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}


async def cmd_run(_a) -> None:
    from app.services.ocr import recognize_text
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    cache = load_cache()
    todo = 0
    for n, p in fronts():
        data = prep(p)
        h = hashlib.sha256(data).hexdigest()[:16]
        if cache.get(p.stem, {}).get("sha") == h:
            continue
        t0 = time.perf_counter()
        fields = await recognize_text(data, "image/jpeg")
        cache[p.stem] = {"sha": h, "fields": fields, "sec": round(time.perf_counter() - t0, 2)}
        CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
        todo += 1
        print(f"  {p.stem}: 필드 {len(fields)}개 {cache[p.stem]['sec']}s")
    print(f"CLOVA 호출 {todo}회 (캐시 {len(cache)}건) → {CACHE}")


async def match_all(cache):
    from app.api.products import match_text
    from app.db.session import AsyncSessionLocal
    res = {}
    async with AsyncSessionLocal() as db:
        for stem, c in cache.items():
            q = " ".join(c["fields"])[:SCAN_QUERY_MAX].strip()
            cands = []
            if len(q) >= 2:
                for m in await match_text(db, q, 5):
                    ids = [m.product.id] + [v.product.id for v in (m.variants or [])]
                    cands.append({"ids": ids, "score": m.signals.text.score, "name": m.product.name})
            res[stem] = {"query": q, "cands": cands}
    return res


def evaluate(items, res, labels):
    """items: [(번호)] — 라벨이 있는 것만. 양성=카탈로그에 있는 제품, 음성=없는 제품."""
    pos_top1, pos_top5, pos_scores, neg_scores = [], [], [], []
    per = []
    for n in items:
        gold = labels[f"item{n}"]
        cands = res.get(f"item{n}_f", {}).get("cands", [])
        top = cands[0]["score"] if cands else 0.0
        if gold:
            ranks = [i for i, c in enumerate(cands) if gold & set(c["ids"])]
            r = ranks[0] if ranks else None
            pos_top1.append(r == 0)
            pos_top5.append(r is not None)
            pos_scores.append(top)
            per.append({"item": n, "gold": sorted(gold), "rank": None if r is None else r + 1, "top_score": top,
                        "top_name": cands[0]["name"] if cands else None})
        else:
            neg_scores.append(top)
            per.append({"item": n, "gold": [], "rank": None, "top_score": top, "top_name": cands[0]["name"] if cands else None})
    return pos_top1, pos_top5, pos_scores, neg_scores, per


def best_threshold(pos_scores, neg_scores, pos_correct):
    """dev 에서 Youden J(수락한 양성 중 맞은 것 - 수락한 음성) 최대 임계값."""
    best, bt = -1.0, 0.0
    for t in sorted(set(pos_scores + neg_scores)):
        tpr = sum(1 for s, ok in zip(pos_scores, pos_correct) if s >= t and ok) / max(1, len(pos_scores))
        fpr = sum(1 for s in neg_scores if s >= t) / max(1, len(neg_scores))
        if tpr - fpr > best:
            best, bt = tpr - fpr, t
    return bt


def summarize(tag, pos1, pos5, ps, ns, thr):
    d = {"n_pos": len(pos1), "n_neg": len(ns)}
    if pos1:
        d["top1"] = dict(zip(("p", "lo", "hi"), stats.wilson(sum(pos1), len(pos1))))
        d["top5"] = dict(zip(("p", "lo", "hi"), stats.wilson(sum(pos5), len(pos5))))
    if ps and ns:
        d["auroc"] = stats.auroc(ps, ns)
        boots = []
        import random
        rng = random.Random(common.SEED)
        for _ in range(5000):
            a = [ps[rng.randrange(len(ps))] for _ in ps]
            b = [ns[rng.randrange(len(ns))] for _ in ns]
            boots.append(stats.auroc(a, b))
        boots.sort()
        d["auroc_lo"], d["auroc_hi"] = boots[124], boots[4874]
    if thr is not None and (ps or ns):
        d["threshold"] = thr
        acc_pos = [(s >= thr, ok) for s, ok in zip(ps, pos1)]
        d["accepted_positive"] = dict(zip(("p", "lo", "hi"), stats.wilson(sum(a for a, _ in acc_pos), max(1, len(ps)))))
        d["accepted_correct_among_accepted"] = dict(zip(("p", "lo", "hi"), stats.wilson(sum(1 for a, ok in acc_pos if a and ok), max(1, sum(a for a, _ in acc_pos)))))
        d["false_accept_negative"] = dict(zip(("p", "lo", "hi"), stats.wilson(sum(1 for s in ns if s >= thr), max(1, len(ns)))))
    return d


def add_top3(d, per) -> None:
    """앱 스캔 화면은 후보를 3개(`ScanBody.limit` 기본 3)만 보여 준다 — 사용자가 실제로 보는 범위의 적중률.
    사전 등록 지표(top-5)는 그대로 두고, 서비스 화면과 일치하는 top-3 를 함께 보고한다(사후 추가)."""
    pos = [x for x in per if x["gold"]]
    if pos:
        d["top3"] = dict(zip(("p", "lo", "hi"), stats.wilson(sum(1 for x in pos if x["rank"] is not None and x["rank"] <= 3), len(pos))))


async def cmd_score(_a) -> None:
    cache = load_cache()
    labels = load_labels()
    res = await match_all(cache)
    have = lambda n: f"item{n}" in labels and f"item{n}_f" in res  # noqa: E731
    dev_items = [n for n in sorted(DEV_ITEMS) if have(n)]
    test_items = [n for n, _ in fronts() if n not in DEV_ITEMS and have(n)]
    unlabeled = [n for n, _ in fronts() if n not in DEV_ITEMS and f"item{n}" not in labels]
    out = {"protocol": "PROTOCOL.md E (앞면만)", "photos_front": len(fronts()),
           "dev_items": len(dev_items), "test_items_labeled": len(test_items), "test_items_unlabeled": len(unlabeled)}
    d1, d5, dps, dns, dper = evaluate(dev_items, res, labels)
    thr = best_threshold(dps, dns, d1) if dps and dns else None
    out["dev"] = summarize("dev", d1, d5, dps, dns, thr)
    add_top3(out["dev"], dper)
    out["dev_items_detail"] = dper
    if test_items and len(unlabeled) == 0:
        t1, t5, tps, tns, tper = evaluate(test_items, res, labels)
        out["test"] = summarize("test", t1, t5, tps, tns, thr)     # 임계값은 dev 값 그대로
        add_top3(out["test"], tper)
        out["test_items_detail"] = tper
    else:
        out["test"] = None
        out["test_pending"] = f"라벨 없는 test 사진 {len(unlabeled)}장: item{unlabeled[:3]}… — data/ocr_test/labels_test.csv 의 in_catalog(Y/N)·product_ids 를 채워 주세요"
    with common.connect() as conn:
        out["env"] = common.env_info(conn.cursor(), [LABELS, LABELS_TEST, CACHE])
    p = common.dump_json("ocr.json", out)
    dv = out["dev"]
    print(f"앞면 사진 {out['photos_front']}장 · dev 라벨 {len(dev_items)} · test 라벨 {len(test_items)} / 미라벨 {len(unlabeled)}")
    if "top1" in dv:
        print(f"[dev] top-1 {dv['top1']['p']:.0%} [{dv['top1']['lo']:.0%},{dv['top1']['hi']:.0%}] top-5 {dv['top5']['p']:.0%} "
              f"(양성 {dv['n_pos']}, 음성 {dv['n_neg']}) AUROC {dv.get('auroc', float('nan')):.2f} 임계값 {thr}")
    print(out.get("test_pending") or f"[test] {out['test']}")
    print("→", p)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("cmd", choices=["run", "score", "template", "find"])
    ap.add_argument("q", nargs="?", default="", help="find: 제품명 일부")
    a = ap.parse_args()
    if a.cmd == "template":
        cmd_template(a)
    else:
        asyncio.run({"run": cmd_run, "score": cmd_score, "find": cmd_find}[a.cmd](a))
