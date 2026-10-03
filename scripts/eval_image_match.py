#!/usr/bin/env python3
"""이미지 유사도 평가 — 이 방법이 쓸 만한지, 어느 모델이 나은지 센다.

    python scripts/eval_image_match.py --model dinov2-small [--sample 300] [--seed 42]
    python scripts/eval_image_match.py --model all

왜 자체 평가셋인가
-----------------
**라벨된 실사진이 0장이다.** scripts/ocr_benchmark/images/는 비어 있고 labels.csv도
없다(로컬 전용이었다). scripts/ocr_test_image/의 3장은 OCR 박스를 덧그린 시각화
산출물이고 어떤 제품인지도 모른다.

그래서 실사진이 전혀 필요 없는 두 측정을 한다. 특히 ①이 이 방법 전체의 상한을
결정하므로 ②보다 먼저 읽어야 한다.

① 천장 — 카탈로그 쌍둥이
    같은 브랜드 라인의 50ml/100ml·리필·색상 변종은 카탈로그 사진이 거의 동일할 수
    있다. 그러면 이미지 유사도는 그 둘을 **원리적으로** 구별할 수 없다. 사진이
    아무리 좋아도 넘을 수 없는 천장이다. 혼동 쌍이 이름으로는 갈린다면, 그게
    signals.text + signals.image를 겹쳐 쓰는 정량적 근거가 된다.

② 합성 '사진화' 재현율
    카탈로그 이미지에 촬영 왜곡을 주입하고 4,013개 전수에서 원본을 다시 찾는지 센다.
    **이 수치는 상한이다** — 표본이 카탈로그 이미지 자신에서 나왔으므로 실제 촬영
    사진보다 후하다. scripts/eval_product_match.py의 텍스트 평가에 붙인 것과 같은
    단서다. 그래도 어떤 왜곡에서 무너지는지(→ 촬영 가이드 UI 근거), 임계값을 어디
    두어야 하는지, 두 모델 중 어느 쪽이 나은지를 말해 준다.
"""
from __future__ import annotations

import argparse
import io
import json
import random
import sys
import time
from pathlib import Path

import numpy as np
import psycopg2
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "backend"))
sys.path.insert(0, str(REPO / "scripts"))

from app.config import settings  # noqa: E402
from embed_product_images import (  # noqa: E402
    IMG_DIR, MODEL_DIR, OUT_DIR, SPECS, embed_batch, make_session, preprocess,
)

# 같은 이미지로 볼 기준. 0.98 위면 두 카탈로그 사진이 사실상 구별되지 않는다.
TWIN = 0.98
# 텍스트 매칭의 임계값과 같아야 "이미지가 못 가린 걸 텍스트가 가리나"를 비교할 수 있다
# (backend/app/api/products.py: MATCH_THRESHOLD).
TEXT_THRESHOLD = 0.15


# ── ② 왜곡 ──────────────────────────────────────────────────────────────────

def distort(img: Image.Image, rng: random.Random, kind: str) -> Image.Image:
    """촬영 왜곡 하나를 입힌다. kind별로 따로 재서 무엇이 치명적인지 본다."""
    img = img.convert("RGB")
    w, h = img.size

    if kind == "crop":
        f = rng.uniform(0.60, 0.90)
        cw, ch = int(w * f), int(h * f)
        l = rng.randint(0, w - cw)
        t = rng.randint(0, h - ch)
        return img.crop((l, t, l + cw, t + ch))

    if kind == "rotate":
        return img.rotate(rng.uniform(-15, 15), Image.BICUBIC,
                          expand=True, fillcolor=(255, 255, 255))

    if kind == "perspective":
        # 기울여 찍은 효과. 네 꼭짓점을 조금씩 밀고 역변환 계수를 구한다.
        d = 0.12
        src = [(0, 0), (w, 0), (w, h), (0, h)]
        dst = [(rng.uniform(0, w * d), rng.uniform(0, h * d)),
               (w - rng.uniform(0, w * d), rng.uniform(0, h * d)),
               (w - rng.uniform(0, w * d), h - rng.uniform(0, h * d)),
               (rng.uniform(0, w * d), h - rng.uniform(0, h * d))]
        return img.transform((w, h), Image.PERSPECTIVE, _coeffs(dst, src),
                             Image.BICUBIC, fillcolor=(255, 255, 255))

    if kind == "light":
        img = ImageEnhance.Brightness(img).enhance(rng.uniform(0.6, 1.4))
        return ImageEnhance.Contrast(img).enhance(rng.uniform(0.6, 1.3))

    if kind == "blur":
        return img.filter(ImageFilter.GaussianBlur(rng.uniform(1.0, 3.0)))

    if kind == "jpeg":
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=rng.randint(35, 75))
        buf.seek(0)
        return Image.open(buf).convert("RGB")

    if kind == "background":
        # 카탈로그는 흰 배경이고 실사진은 아니다. 거의 흰 화소를 잡색으로 바꿔
        # "배경이 임베딩을 지배하는가"를 본다.
        a = np.asarray(img, dtype=np.int16)
        mask = (a > 243).all(axis=2)
        # effect_noise는 size=(w,h)로 받고 asarray는 (h,w)를 준다 — a와 축이 같다
        noise = np.asarray(Image.effect_noise(img.size, rng.uniform(20, 60)))
        tint = np.array([rng.randint(60, 200) for _ in range(3)], dtype=np.int16)
        bg = np.clip(tint[None, None, :] + noise[:, :, None] - 128, 0, 255)
        a[mask] = bg[mask]
        return Image.fromarray(a.astype(np.uint8))

    if kind == "typical":
        # 손으로 찍은 평범한 사진에 가까운 조합. 블러(초점 실패)와 배경 치환은
        # 뺀다 — 전자는 '나쁜 사진'이고 후자는 카탈로그가 대부분 배너라 무의미하다.
        for k in ("crop", "perspective", "light", "jpeg"):
            img = distort(img, rng, k)
        return img

    if kind == "all":
        # 최악 조건 — 7종을 전부 겹친다. 현실에서 이 정도로 망가진 사진은 드물다.
        for k in ("crop", "rotate", "perspective", "light", "blur", "jpeg", "background"):
            img = distort(img, rng, k)
        return img

    raise ValueError(kind)


def _coeffs(src, dst):
    """PIL PERSPECTIVE 계수 8개 — 최소제곱으로 푼다."""
    A, B = [], []
    for (x, y), (X, Y) in zip(src, dst):
        A.append([x, y, 1, 0, 0, 0, -X * x, -X * y]); B.append(X)
        A.append([0, 0, 0, x, y, 1, -Y * x, -Y * y]); B.append(Y)
    return np.linalg.lstsq(np.array(A, float), np.array(B, float), rcond=None)[0].tolist()


# ── ⓪ 카탈로그 성격 ─────────────────────────────────────────────────────────

def catalog_profile(sample: list[int]) -> dict:
    """카탈로그 이미지가 '제품컷'인가 '판촉 배너'인가.

    올리브영 대표 이미지는 깨끗한 흰 배경 제품컷만 있는 게 아니라, 한글 마케팅
    문구·'1+1' 뱃지·콜라보 캐릭터가 들어간 **판촉 배너**인 경우가 많다. 배너는
    임베딩이 배너 디자인에 지배되므로, 사용자가 실제 병을 찍은 사진과는 애초에
    닮을 수 없다. 이 비율이 ②의 재현율보다 더 현실적인 천장이다.

    테두리 화소가 거의 흰색이면 제품컷으로 본다 — 완벽하진 않지만 싸고 일관된 대리 지표다.
    """
    ratios = []
    for pid in sample:
        a = np.asarray(Image.open(IMG_DIR / f"{pid}.jpg").convert("RGB").resize((96, 96)))
        b = np.concatenate([a[:8].reshape(-1, 3), a[-8:].reshape(-1, 3),
                            a[:, :8].reshape(-1, 3), a[:, -8:].reshape(-1, 3)])
        ratios.append(float((b > 235).all(axis=1).mean()))
    r = np.array(ratios)
    return dict(n=len(r), clean=float((r >= 0.95).mean() * 100),
                mostly=float((r >= 0.50).mean() * 100), median=float(np.median(r)))


# ── ① 천장 측정 ─────────────────────────────────────────────────────────────

def ceiling(vecs: np.ndarray, ids: list[int], cur) -> dict:
    """자기 자신을 뺀 최근접 이웃을 구해 '구별 불가능한 쌍'을 센다."""
    S = vecs @ vecs.T                      # L2 정규화돼 있어 내적 = 코사인
    np.fill_diagonal(S, -1.0)
    nn = S.argmax(axis=1)
    top = S[np.arange(len(ids)), nn]

    twins = np.where(top >= TWIN)[0]
    pairs = [(ids[i], ids[nn[i]], float(top[i])) for i in twins]

    cur.execute(
        "SELECT id, brand_id, coalesce(display_name, name) FROM products WHERE id = ANY(%s)",
        [sorted({p for a, b, _ in pairs for p in (a, b)})],
    )
    meta = {r[0]: (r[1], r[2]) for r in cur.fetchall()}

    same_brand = sum(1 for a, b, _ in pairs
                     if a in meta and b in meta and meta[a][0] == meta[b][0])

    # 이미지로 못 가린 쌍을 이름으로는 가릴 수 있나 — 겹쳐 쓸 근거.
    # 쌍마다 질의하면 Neon 왕복(약 212ms)이 쌍 수만큼 쌓인다. 한 번에 묻는다.
    name_sims = []
    both = [(meta[a][1], meta[b][1]) for a, b, _ in pairs if a in meta and b in meta]
    if both:
        cur.execute(
            "SELECT similarity(lower(t.a), lower(t.b)) "
            "FROM (VALUES %s) AS t(a, b)" % ",".join(["(%s,%s)"] * len(both)),
            [x for pair in both for x in pair],
        )
        name_sims = [float(r[0]) for r in cur.fetchall()]
    # 이름이 충분히 다르다 = 텍스트로 갈린다
    text_sep = sum(1 for s in name_sims if s < 0.8)
    # display_name까지 같은 쌍. 중복 행이 아니라 **기획/증정 구성만 다른 별도 상품**이다
    # (예: '…세럼 50ml' 단품 / 기획(+멀티패드 10매) / 리필 기획 — goods_no도 가격도 다르다).
    # display_name이 기획 꼬리를 떼기 때문에 생긴다. 이미지로도 이름으로도 가를 수 없는
    # **가장 어려운 경우**이므로 천장에서 빼지 않고 따로 센다.
    name_same = sum(1 for s in name_sims if s >= 0.99)

    return dict(
        n=len(ids),
        twins=len(pairs),
        twin_pct=len(pairs) / len(ids) * 100,
        same_brand=same_brand,
        text_separable=text_sep,
        text_sep_pct=text_sep / max(len(pairs), 1) * 100,
        name_same=name_same,
        name_same_pct=name_same / max(len(pairs), 1) * 100,
        median_nn=float(np.median(top)),
        p99_nn=float(np.percentile(top, 99)),
        name_sim_median=float(np.median(name_sims)) if name_sims else float("nan"),
        examples=[(meta.get(a, (None, "?"))[1][:34], meta.get(b, (None, "?"))[1][:34],
                   round(c, 4)) for a, b, c in sorted(pairs, key=lambda p: -p[2])[:5]],
    )


# ── ② 재현율 ────────────────────────────────────────────────────────────────

KINDS = ("crop", "rotate", "perspective", "light", "blur", "jpeg", "background",
         "typical", "all")


def recall(sess, spec, vecs, ids, sample_ids, rng_seed: int, batch: int) -> dict:
    pos = {pid: i for i, pid in enumerate(ids)}
    res = {}
    for kind in KINDS:
        rng = random.Random(rng_seed)       # 왜곡 종류마다 같은 난수열 → 공정 비교
        hits1 = hits5 = 0
        margins = []
        for i in range(0, len(sample_ids), batch):
            chunk = sample_ids[i : i + batch]
            tens = []
            for pid in chunk:
                img = distort(Image.open(IMG_DIR / f"{pid}.jpg"), rng, kind)
                buf = io.BytesIO()
                img.save(buf, "JPEG", quality=92)
                buf.seek(0)
                tens.append(preprocess(buf, spec))
            q = embed_batch(sess, spec, np.stack(tens))
            S = q @ vecs.T
            order = np.argsort(-S, axis=1)[:, :5]
            for j, pid in enumerate(chunk):
                truth = pos[pid]
                if order[j, 0] == truth:
                    hits1 += 1
                    margins.append(float(S[j, truth] - S[j, order[j, 1]]))
                if truth in order[j]:
                    hits5 += 1
        n = len(sample_ids)
        res[kind] = dict(
            top1=hits1 / n * 100,
            top5=hits5 / n * 100,
            margin=float(np.median(margins)) if margins else float("nan"),
        )
    return res


# ── 실행 ────────────────────────────────────────────────────────────────────

def load(model: str) -> tuple[np.ndarray, list[int]]:
    npy, idf = OUT_DIR / f"{model}.npy", OUT_DIR / f"{model}.ids.json"
    if not npy.exists():
        sys.exit(f"{npy} 가 없습니다 — scripts/embed_product_images.py --model {model} 먼저.")
    return np.load(npy), json.loads(idf.read_text())


def report(model: str, c: dict, r: dict, prof: dict) -> None:
    print(f"\n{'='*78}\n{model}\n{'='*78}")
    print(f"\n⓪ 카탈로그 성격  (표본 {prof['n']:,}장 · 모델과 무관)")
    print(f"   깨끗한 제품컷          {prof['clean']:5.1f}%   ← 실제 촬영 사진과 닮을 수 있는 쪽")
    print(f"   대체로 흰 배경         {prof['mostly']:5.1f}%")
    print(f"   나머지는 판촉 배너     문구·뱃지·캐릭터가 임베딩을 지배한다")
    print(f"\n① 천장 — 카탈로그 쌍둥이  (제품 {c['n']:,}개 전수)")
    print(f"   최근접 이웃 코사인      중위 {c['median_nn']:.4f} · p99 {c['p99_nn']:.4f}")
    print(f"   ≥{TWIN} 쌍둥이          {c['twins']:,}개 ({c['twin_pct']:.1f}%)"
          f"  ← 이미지 단독으로 구별 불가 = 천장")
    print(f"     전부 같은 브랜드      {c['same_brand']:,}개 (변종 혼동)")
    print(f"     이름으로 갈리는 쌍    {c['text_separable']:,}개 ({c['text_sep_pct']:.0f}%)"
          f"  ← 텍스트와 겹쳐 쓸 근거")
    print(f"     이름도 같은 쌍        {c['name_same']:,}개 ({c['name_same_pct']:.0f}%)"
          f"  ← 기획/증정 구성만 다른 별도 상품. 두 신호 모두 실패")
    print(f"     쌍둥이 이름 유사도    중위 {c['name_sim_median']:.3f}")
    if c["examples"]:
        print("   가장 닮은 쌍:")
        for a, b, s in c["examples"]:
            print(f"     {s:.4f}  {a:<36} ↔ {b}")

    print(f"\n② 합성 '사진화' 재현율  ({'상한임 — docstring 참고'})")
    print(f"   {'왜곡':<14}{'top-1':>9}{'top-5':>9}{'1·2위 간격':>12}")
    for k in KINDS:
        v = r[k]
        print(f"   {k:<14}{v['top1']:8.1f}%{v['top5']:8.1f}%{v['margin']:12.4f}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--model", default="all", choices=[*sorted(SPECS), "all"])
    ap.add_argument("--sample", type=int, default=300)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--threads", type=int, default=8)
    args = ap.parse_args()

    models = sorted(SPECS) if args.model == "all" else [args.model]
    conn = psycopg2.connect(settings.DATABASE_DSN)
    cur = conn.cursor()

    for model in models:
        spec = SPECS[model]
        vecs, ids = load(model)
        rng = random.Random(args.seed)
        sample_ids = rng.sample(ids, min(args.sample, len(ids)))
        print(f"\n{model}: 벡터 {vecs.shape} · 표본 {len(sample_ids)}개 (seed={args.seed})")

        prof = catalog_profile(sample_ids)

        t0 = time.perf_counter()
        c = ceiling(vecs, ids, cur)
        print(f"  ① {time.perf_counter()-t0:.1f}초")

        t0 = time.perf_counter()
        sess = make_session(Path(MODEL_DIR) / spec["file"], args.threads)
        r = recall(sess, spec, vecs, ids, sample_ids, args.seed, args.batch)
        print(f"  ② {time.perf_counter()-t0:.1f}초")

        report(model, c, r, prof)

    conn.close()
    print("\n해석 주의 — ②의 표본은 카탈로그 이미지 자신에서 합성됐으므로 상한이다.\n"
          "진짜 천장은 ⓪(배너라 실사진과 닮을 수 없는 비율)과 ①(이미지로는\n"
          "구별되지 않는 쌍의 비율)이며, 둘 다 모델을 바꿔도 사라지지 않는다.")


if __name__ == "__main__":
    main()
