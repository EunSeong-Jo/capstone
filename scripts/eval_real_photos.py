#!/usr/bin/env python3
"""실사진 평가 — 텍스트(OCR)와 이미지, 두 신호를 같은 사진으로 비교한다.

    python scripts/eval_real_photos.py                 # 캐시된 OCR로 평가만
    python scripts/eval_real_photos.py --ocr           # CLOVA를 호출해 캐시 갱신

왜 필요한가
----------
scripts/IMAGE_MATCH_SUMMARY.md의 ②(합성 '사진화')는 카탈로그 이미지 자신을 왜곡해
만든 **상한**이었다. 실제로 손으로 찍은 사진에서 어떤지는 다른 문제이고, 이 스크립트가
그걸 잰다. 결과는 같은 문서의 '③ 실사진' 절에 기록돼 있다.

입력
----
data/ocr_test/item{N}_{f,b}.jpg    _f=앞면(제품명 면) · _b=뒷면(전성분 면)
                                   장변 1024px로 줄여 커밋했다(원본 65.8MB → 2.5MB).
                                   줄이기 전후로 결과가 같은 것을 확인했고 OCR은 오히려
                                   3~5배 빨라진다(장당 17초 → 2초).
data/ocr_test/labels.csv           정답 product_id 집합. 비어 있으면 '카탈로그 없음'

data/ocr_test/ocr_cache.json       CLOVA 응답 캐시. **커밋한다** — 비밀값이 없고,
                                   이게 있어야 키 없는 사람도 평가를 재현할 수 있다.

필요한 것
--------
  텍스트  백엔드가 떠 있어야 한다 (docker compose up) — GET /api/v1/products/match
  이미지  backend/data/embeddings/*.npy — scripts/embed_product_images.py 먼저
  --ocr   scripts/CLOVA_OCR/.env 의 CLOVA_OCR_SECRET / CLOVA_OCR_INVOKE_URL
          ⚠ INVOKE_URL은 공개(APIGW) 주소여야 한다. 콘솔의 Private 주소
            (clovaocr-api-kr.ncloud.com/external/...)는 사설 IP라 외부에서 안 닿는다.
"""
from __future__ import annotations

import argparse
import base64
import csv
import io
import json
import os
import sys
import time
import uuid
from pathlib import Path

import numpy as np
import requests

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "backend"))
sys.path.insert(0, str(REPO / "scripts"))

PHOTO_DIR = REPO / "data/ocr_test"
LABELS = PHOTO_DIR / "labels.csv"
CACHE = PHOTO_DIR / "ocr_cache.json"
API = "http://localhost:8000/api/v1/products/match"


def load_labels() -> dict[str, set[int]]:
    out = {}
    with open(LABELS, encoding="utf-8") as f:
        rows = [l for l in f if not l.startswith("#")]
    for r in csv.DictReader(rows):
        ids = {int(x) for x in r["product_ids"].split("|") if x.strip()}
        out[r["item"]] = ids
    return out


# ── OCR ─────────────────────────────────────────────────────────────────────

def run_ocr(photos: list[Path], force: bool) -> dict:
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    todo = [p for p in photos if force or p.stem not in cache]
    if not todo:
        return cache
    from dotenv import load_dotenv
    load_dotenv(REPO / "scripts/CLOVA_OCR/.env")
    load_dotenv(REPO / ".env")
    try:
        secret, url = os.environ["CLOVA_OCR_SECRET"], os.environ["CLOVA_OCR_INVOKE_URL"]
    except KeyError:
        sys.exit("CLOVA_OCR_SECRET / CLOVA_OCR_INVOKE_URL이 없습니다 — 이 파일의 docstring 참고.")

    for p in todo:
        t0 = time.perf_counter()
        r = requests.post(
            url, headers={"Content-Type": "application/json", "X-OCR-SECRET": secret},
            json={"version": "V2", "requestId": str(uuid.uuid4()),
                  "timestamp": int(time.time() * 1000),
                  "images": [{"format": "jpg", "name": p.stem,
                              "data": base64.b64encode(p.read_bytes()).decode()}]},
            timeout=90)
        if r.status_code != 200:
            print(f"  {p.stem}: HTTP {r.status_code} {r.text[:120]}")
            continue
        im = r.json()["images"][0]
        # 글자 높이를 같이 남긴다 — '큰 글씨만' 질의를 만들 때 쓴다
        cache[p.stem] = {
            "result": im.get("inferResult"),
            "sec": round(time.perf_counter() - t0, 2),
            "fields": [
                {"text": f["inferText"],
                 "h": max(v["y"] for v in f["boundingPoly"]["vertices"])
                      - min(v["y"] for v in f["boundingPoly"]["vertices"])}
                for f in im.get("fields", [])
            ],
        }
        print(f"  {p.stem}: {im.get('inferResult')} {len(cache[p.stem]['fields'])}필드 "
              f"{cache[p.stem]['sec']}초")
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1))
    return cache


# ── 두 신호 ─────────────────────────────────────────────────────────────────

def text_match(q: str, limit: int = 5) -> list[dict]:
    try:
        r = requests.get(API, params={"q": q[:500], "limit": limit}, timeout=30)
    except requests.RequestException as exc:
        sys.exit(f"백엔드에 못 붙었습니다 ({exc}) — docker compose up 후 다시 돌리세요.")
    return r.json() if r.status_code == 200 else []


def image_ranker(model: str):
    from PIL import Image, ImageOps
    from embed_product_images import (MODEL_DIR, OUT_DIR, SPECS, embed_batch,
                                      make_session, preprocess)
    spec = SPECS[model]
    npy = OUT_DIR / f"{model}.npy"
    if not npy.exists():
        sys.exit(f"{npy} 가 없습니다 — scripts/embed_product_images.py --model {model} 먼저.")
    V = np.load(npy)
    ids = json.loads((OUT_DIR / f"{model}.ids.json").read_text())
    sess = make_session(MODEL_DIR / spec["file"], 8)

    def rank(path: Path) -> list[tuple[int, float]]:
        buf = io.BytesIO()
        ImageOps.exif_transpose(Image.open(path)).convert("RGB").save(buf, "JPEG", quality=92)
        buf.seek(0)
        q = embed_batch(sess, spec, np.stack([preprocess(buf, spec)]))[0]
        S = q @ V.T
        return [(ids[i], float(S[i])) for i in np.argsort(-S)]
    return rank


def rank_of(ranked: list[tuple[int, float]], truth: set[int]) -> int | None:
    for i, (pid, _) in enumerate(ranked, 1):
        if pid in truth:
            return i
    return None


# ── 실행 ────────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ocr", action="store_true", help="CLOVA를 호출해 캐시를 채운다")
    ap.add_argument("--force-ocr", action="store_true", help="캐시가 있어도 다시 호출")
    ap.add_argument("--model", default="dinov2-small")
    ap.add_argument("--side", default="f", choices=("f", "b", "both"),
                    help="f=앞면(기본) · b=뒷면 · both")
    args = ap.parse_args()

    labels = load_labels()
    sides = ("f", "b") if args.side == "both" else (args.side,)
    photos = [PHOTO_DIR / f"{it}_{s}.jpg" for it in labels for s in sides]
    photos = [p for p in photos if p.exists()]

    ocr = run_ocr(photos, args.force_ocr) if (args.ocr or args.force_ocr) else (
        json.loads(CACHE.read_text()) if CACHE.exists() else {})
    if not ocr:
        sys.exit("OCR 캐시가 없습니다 — --ocr 로 한 번 채우세요.")

    rank_img = image_ranker(args.model)

    print(f"\n{'사진':<9}{'카탈로그':<9}{'텍스트 1위':>11}{'정답순위':>9}"
          f"{'이미지 1위':>11}{'정답순위':>9}")
    rows = []
    for p in photos:
        item = p.stem.split("_")[0]
        truth = labels[item]
        o = ocr.get(p.stem)
        if not o:
            continue
        q = " ".join(x["text"] for x in o["fields"])
        tm = text_match(q)
        t1 = tm[0]["signals"]["text"]["score"] if tm else 0.0
        trank = rank_of([(m["product"]["id"], 0.0) for m in tm], truth) if truth else None

        ir = rank_img(p)
        i1 = ir[0][1]
        irank = rank_of(ir, truth) if truth else None

        rows.append((p.stem, bool(truth), t1, trank, i1, irank))
        print(f"{p.stem:<9}{'있음' if truth else '없음':<9}{t1:>11.3f}"
              f"{str(trank or '-'):>9}{i1:>11.3f}{str(irank or '-'):>9}")

    pos = [r for r in rows if r[1]]
    neg = [r for r in rows if not r[1]]
    if pos:
        print(f"\n정답이 카탈로그에 있는 {len(pos)}장")
        print(f"  텍스트  top-1 {sum(1 for r in pos if r[3]==1)}/{len(pos)}"
              f"   top-5 {sum(1 for r in pos if r[3] and r[3]<=5)}/{len(pos)}")
        print(f"  이미지  top-1 {sum(1 for r in pos if r[5]==1)}/{len(pos)}"
              f"   top-5 {sum(1 for r in pos if r[5] and r[5]<=5)}/{len(pos)}")
    if pos and neg:
        print(f"\n거절 가능성 — 정답 최소 1위점수 vs 카탈로그에 없는 사진의 최대 1위점수")
        for name, i in (("텍스트", 2), ("이미지", 4)):
            pmin = min(r[i] for r in pos)
            nmax = max(r[i] for r in neg)
            print(f"  {name}  {pmin:.3f} vs {nmax:.3f}  "
                  f"{'✅ 임계값으로 가를 수 있다' if pmin > nmax else '❌ 겹친다 — 자동 거절 불가'}")


if __name__ == "__main__":
    main()
