#!/usr/bin/env python3
"""제품 이미지 임베딩 — backend/data/product_images/ → backend/data/embeddings/

    python scripts/embed_product_images.py --model dinov2-small [--batch 16]

이 스크립트는 **DB에 쓰지 않는다.** 결과를 .npy로 떨구는 이유는, 두 모델을 같은
표본에서 비교해야 하고(scripts/eval_image_match.py) pgvector 컬럼은 차원이
고정이라 모델이 정해지기 전에는 담을 수 없기 때문이다. DB 적재는 모델이 정해진
뒤 scripts/seed_product_image_embeddings.py가 한다.

왜 두 모델인가
-------------
우리가 푸는 문제는 "이게 토너인가"가 아니라 "이게 **그** 토너인가"다 —
의미(semantic) 유사도가 아니라 개체(instance) 유사도. CLIP은 의미로 묶어서
'흰 토너병'을 전부 가깝게 만드는 경향이 있고, DINOv2는 개체 수준 대조에 더
적합하다고 알려져 있다. 어느 쪽이 우리 데이터에서 나은지는 평가로 정한다.

출력
----
backend/data/embeddings/{model}.npy       float32 (N, dim) · L2 정규화됨
backend/data/embeddings/{model}.ids.json  행 순서 ↔ product_id

L2 정규화해 두면 코사인 유사도가 **내적 한 번**으로 끝난다.

의존성
------
onnxruntime · pillow · numpy. requirements-dev.txt 참고. 모델 파일(.onnx)은
저장소에 넣지 않고 --model-dir에서 읽는다 (기본 backend/data/models/).

    DINOv2-small  https://huggingface.co/onnx-community/dinov2-small
                    onnx/model.onnx → dinov2-small.onnx            (85MB, 384차원)
    CLIP ViT-B/32 https://huggingface.co/Qdrant/clip-ViT-B-32-vision
                    model.onnx      → clip-b32-vision.onnx        (336MB, 512차원)

실측 지연 (16코어 CPU · GPU 없음 · intra_op=4)
    dinov2-small     batch=1 p90 62ms · batch=16 장당 38ms · 4,013장 2.5분
    clip-b32-vision  batch=1 p90 28ms · batch=16 장당 21ms · 4,013장 1.4분
"""
from __future__ import annotations

import argparse
import io
import json
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

REPO = Path(__file__).resolve().parents[1]

IMG_DIR = REPO / "backend/data/product_images"
OUT_DIR = REPO / "backend/data/embeddings"
MODEL_DIR = REPO / "backend/data/models"

# 전처리는 모델 저자가 공개한 preprocessor_config.json을 그대로 따른다.
# 여기서 어긋나면 벡터가 조용히 나빠지므로 숫자를 직접 박아 둔다.
SPECS = {
    "dinov2-small": dict(
        file="dinov2-small.onnx", dim=384,
        short=256, crop=224,
        mean=(0.485, 0.456, 0.406), std=(0.229, 0.224, 0.225),
        pool="cls",      # last_hidden_state (B, 257, 384) → CLS 토큰
    ),
    "clip-b32-vision": dict(
        file="clip-b32-vision.onnx", dim=512,
        short=224, crop=224,
        mean=(0.48145466, 0.4578275, 0.40821073),
        std=(0.26862954, 0.26130258, 0.27577711),
        pool="direct",   # image_embeds (B, 512)
    ),
}


def preprocess(src: Path | io.BytesIO, spec: dict) -> np.ndarray:
    """짧은 변을 short로 맞춘 뒤 crop만큼 중앙에서 잘라 정규화한다.

    src는 경로나 바이트 버퍼 둘 다 받는다 — 평가 스크립트가 왜곡한 이미지를
    파일로 떨구지 않고 메모리에서 바로 넘긴다.
    """
    img = Image.open(src)
    img = ImageOps.exif_transpose(img).convert("RGB")
    w, h = img.size
    s = spec["short"] / min(w, h)
    img = img.resize((round(w * s), round(h * s)), Image.BICUBIC)
    w, h = img.size
    c = spec["crop"]
    l, t = (w - c) // 2, (h - c) // 2
    img = img.crop((l, t, l + c, t + c))
    x = np.asarray(img, dtype=np.float32) / 255.0
    x = (x - np.array(spec["mean"], np.float32)) / np.array(spec["std"], np.float32)
    return x.transpose(2, 0, 1)


def normalize(v: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(v, axis=1, keepdims=True)
    return v / np.maximum(n, 1e-12)


def make_session(onnx_path: Path, threads: int):
    import onnxruntime as ort
    so = ort.SessionOptions()
    # API 워커와 공존할 수 있는 현실적 설정. 전부 쓰면 벤치는 빠르지만
    # 요청 처리와 경쟁한다.
    so.intra_op_num_threads = threads
    return ort.InferenceSession(str(onnx_path), so, providers=["CPUExecutionProvider"])


def embed_batch(sess, spec: dict, batch: np.ndarray) -> np.ndarray:
    out = sess.run(None, {"pixel_values": batch})[0]
    v = out[:, 0, :] if spec["pool"] == "cls" else out
    return normalize(v.astype(np.float32))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--model", choices=sorted(SPECS), required=True)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--threads", type=int, default=4)
    ap.add_argument("--limit", type=int, help="앞쪽 N장만 (시험용)")
    ap.add_argument("--model-dir", default=str(MODEL_DIR))
    args = ap.parse_args()

    spec = SPECS[args.model]
    onnx_path = Path(args.model_dir) / spec["file"]
    if not onnx_path.exists():
        sys.exit(f"모델이 없습니다: {onnx_path}\n이 파일의 docstring에 내려받을 주소가 있습니다.")

    files = sorted(IMG_DIR.glob("*.jpg"), key=lambda p: int(p.stem))
    if args.limit:
        files = files[: args.limit]
    if not files:
        sys.exit(f"이미지가 없습니다: {IMG_DIR}\n먼저 scripts/download_product_images.py를 돌리세요.")
    ids = [int(p.stem) for p in files]
    print(f"이미지 {len(files):,}장 · 모델 {args.model} ({spec['dim']}차원)")

    t0 = time.perf_counter()
    sess = make_session(onnx_path, args.threads)
    print(f"  모델 로드 {time.perf_counter() - t0:.1f}초")

    t0 = time.perf_counter()
    vecs = np.empty((len(files), spec["dim"]), dtype=np.float32)
    for i in range(0, len(files), args.batch):
        chunk = files[i : i + args.batch]
        X = np.stack([preprocess(p, spec) for p in chunk])
        vecs[i : i + len(chunk)] = embed_batch(sess, spec, X)
        if (i // args.batch) % 25 == 0 and i:
            el = time.perf_counter() - t0
            print(f"  {i:,}/{len(files):,} · 장당 {el/i*1000:.0f}ms "
                  f"· 남은 시간 약 {(len(files)-i)*el/i/60:.1f}분")
    el = time.perf_counter() - t0

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    np.save(OUT_DIR / f"{args.model}.npy", vecs)
    (OUT_DIR / f"{args.model}.ids.json").write_text(json.dumps(ids), encoding="utf-8")

    norms = np.linalg.norm(vecs, axis=1)
    print(f"\n{el/60:.1f}분 · 장당 {el/len(files)*1000:.0f}ms")
    print(f"저장 {OUT_DIR / f'{args.model}.npy'} · {vecs.nbytes/1e6:.1f}MB")
    print(f"노름 검증 min {norms.min():.4f} / max {norms.max():.4f} (1.0이어야 정상)")


if __name__ == "__main__":
    main()
