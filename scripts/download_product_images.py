#!/usr/bin/env python3
"""제품 이미지 다운로드 — products.image_url → backend/data/product_images/

    python scripts/download_product_images.py [--workers 8] [--limit N] [--force]

멱등하다. 기본이 resume이라 중간에 끊겨도 다시 돌리면 받은 것은 건너뛴다.

왜 원본을 보관하지 않는가
------------------------
올리브영 CDN 이미지는 약 2000x2000 · 장당 평균 451KB라 4,013장이면 1.85GB다.
그런데 임베딩 모델 입력은 224px(DINOv2-small · CLIP ViT-B/32)다. 받은 즉시
**장변 512px · JPEG q85**로 줄여 저장하면 약 250MB로 끝나고, 224/336 입력을
모두 덮는다. 더 큰 입력이 필요해지면 10분이면 다시 받으면 된다
(실측: 동시 8로 6.5장/s).

CDN에 축소 변형은 없다 — URL의 `/thumbnails/10/`은 픽셀 크기가 아니고,
`/thumbnails/{100,250,550}/`은 전부 404다. 원본을 받아 우리가 줄이는 수밖에 없다.

저장 위치
---------
backend/data/product_images/{product_id}.jpg   (backend/data/는 .gitignore:69)
backend/data/product_images/manifest.jsonl     product_id · url · sha256 · 크기

manifest는 "이 벡터가 어느 이미지에서 나왔나"를 추적하는 근거다. 제품 이미지가
CDN에서 교체되면 sha256이 달라지므로 재임베딩이 필요한 행을 찾을 수 있다.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import psycopg2
import requests
from PIL import Image, ImageOps

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "backend"))

from app.config import settings  # noqa: E402

OUT_DIR = REPO / "backend/data/product_images"
MANIFEST = OUT_DIR / "manifest.jsonl"

# 장변 512px. 모델 입력(224)보다 크게 두는 이유는 위 docstring 참고.
MAX_SIDE = 512
JPEG_QUALITY = 85

# UA가 없으면 CDN이 느려지거나 끊는다 — 실측에서 직렬 + UA 없이 받다가
# 장당 9.8초 + 타임아웃이 났고, UA를 붙이자 48/48이 평균 541ms에 들어왔다.
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; swappy-image-fetch/1.0)"}
TIMEOUT = 20
RETRIES = 3


def fetch(url: str) -> bytes:
    """지수 백오프로 RETRIES회까지 재시도한다."""
    last: Exception | None = None
    for attempt in range(RETRIES):
        try:
            r = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
            r.raise_for_status()
            return r.content
        except Exception as exc:  # noqa: BLE001
            last = exc
            if attempt < RETRIES - 1:
                time.sleep(2 ** attempt)
    raise last  # type: ignore[misc]


def shrink(raw: bytes) -> tuple[bytes, int, int]:
    """장변 MAX_SIDE로 줄여 JPEG로 다시 쓴다. (bytes, w, h)"""
    img = Image.open(io.BytesIO(raw))
    # 휴대폰 사진이 아니라 CDN 이미지지만, EXIF 회전이 붙은 경우가 있어 맞춰 둔다.
    # 전례: scripts/CLOVA_OCR/extract_product_name.py
    img = ImageOps.exif_transpose(img).convert("RGB")
    w, h = img.size
    if max(w, h) > MAX_SIDE:
        s = MAX_SIDE / max(w, h)
        img = img.resize((round(w * s), round(h * s)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=JPEG_QUALITY, optimize=True)
    return buf.getvalue(), img.size[0], img.size[1]


def one(task: tuple[int, str]) -> dict:
    pid, url = task
    try:
        small, w, h = shrink(fetch(url))
        (OUT_DIR / f"{pid}.jpg").write_bytes(small)
        return {
            "product_id": pid,
            "url": url,
            "sha256": hashlib.sha256(small).hexdigest(),
            "bytes": len(small),
            "width": w,
            "height": h,
        }
    except Exception as exc:  # noqa: BLE001
        return {"product_id": pid, "url": url, "error": f"{type(exc).__name__}: {exc}"}


def load_manifest() -> dict[int, dict]:
    if not MANIFEST.exists():
        return {}
    out = {}
    for line in MANIFEST.read_text(encoding="utf-8").splitlines():
        if line.strip():
            r = json.loads(line)
            out[r["product_id"]] = r
    return out


def save_manifest(rows: dict[int, dict]) -> None:
    with open(MANIFEST, "w", encoding="utf-8") as f:
        for pid in sorted(rows):
            f.write(json.dumps(rows[pid], ensure_ascii=False) + "\n")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--workers", type=int, default=8,
                    help="동시 다운로드 수 (실측 최적 8, 실패 0건)")
    ap.add_argument("--limit", type=int, help="앞쪽 N개만 (시험용)")
    ap.add_argument("--force", action="store_true", help="이미 받은 것도 다시 받기")
    ap.add_argument("--dry-run", action="store_true", help="받지 않고 대상 수만 보고")
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = load_manifest()

    with psycopg2.connect(settings.DATABASE_DSN) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT id, image_url FROM products "
            "WHERE image_url IS NOT NULL ORDER BY id"
        )
        rows = cur.fetchall()
    if args.limit:
        rows = rows[: args.limit]

    todo = [
        (pid, url) for pid, url in rows
        if args.force or not (OUT_DIR / f"{pid}.jpg").exists()
        or (OUT_DIR / f"{pid}.jpg").stat().st_size == 0
    ]
    print(f"제품 {len(rows):,}건 · 받을 것 {len(todo):,}건 "
          f"(이미 있음 {len(rows) - len(todo):,}건)")
    if args.dry_run or not todo:
        if not todo:
            print("전부 받았습니다.")
        return

    t0 = time.perf_counter()
    done = failed = 0
    with ThreadPoolExecutor(args.workers) as ex:
        for res in ex.map(one, todo):
            if "error" in res:
                failed += 1
            else:
                manifest[res["product_id"]] = res
                done += 1
            if (done + failed) % 250 == 0:
                el = time.perf_counter() - t0
                print(f"  {done + failed:,}/{len(todo):,} · {(done+failed)/el:.1f}장/s "
                      f"· 남은 시간 약 {(len(todo)-done-failed)/((done+failed)/el)/60:.1f}분")

    save_manifest(manifest)
    el = time.perf_counter() - t0
    total = sum(r["bytes"] for r in manifest.values())
    print(f"\n성공 {done:,} · 실패 {failed:,} · {el/60:.1f}분 ({done/el:.1f}장/s)")
    print(f"manifest {len(manifest):,}행 · 합계 {total/1e6:.0f}MB "
          f"· 장당 평균 {total/max(len(manifest),1)/1024:.0f}KB")

    if failed:
        # 실패는 치명이 아니다 — manifest에 안 남으므로 다음 실행의 resume이 집는다.
        miss = [pid for pid, _ in todo if pid not in manifest]
        print(f"\n실패한 {failed}건은 다시 돌리면 재시도합니다: {miss[:10]}")


if __name__ == "__main__":
    main()
