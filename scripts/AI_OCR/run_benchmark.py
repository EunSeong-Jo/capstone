"""AI(Claude / GPT-4o) Vision OCR 벤치마크 실행 스크립트.

ocr_benchmark(Tesseract/EasyOCR/PaddleOCR)와 같은 이미지·정답 라벨을 그대로 재사용해
CER/WER/정확일치율/레이턴시를 동일한 기준으로 비교할 수 있게 한다.
"""
import argparse
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd
from dotenv import load_dotenv
from PIL import Image
from tqdm import tqdm

# scripts/AI_OCR/.env 또는 저장소 루트 .env에서 ANTHROPIC_API_KEY / OPENAI_API_KEY를 읽는다.
load_dotenv(Path(__file__).resolve().parent / ".env")
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

# metrics.py는 pandas/rapidfuzz만 있으면 되므로 ocr_benchmark의 무거운 opencv/easyocr
# 의존성 없이 그대로 재사용한다 (build_ground_truth/load_labels는 그 대가로 아래에 복사).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "ocr_benchmark"))
from metrics import aggregate_by_engine, compute_all_metrics  # noqa: E402

from engines_ai import run_claude_ocr, run_openai_ocr


def build_ground_truth(row: pd.Series) -> str:
    name = row["한글명"].strip() or row["영어명"].strip()
    if not name:
        return ""
    brand = row["브랜드"].strip()
    return f"{brand} {name}".strip()


def load_labels(labels_csv: Path) -> pd.DataFrame:
    df = pd.read_csv(labels_csv, dtype=str).fillna("")
    df["ground_truth"] = df.apply(build_ground_truth, axis=1)
    labeled = df[df["ground_truth"].str.strip() != ""]
    n_skipped = len(df) - len(labeled)
    if n_skipped:
        print(f"[경고] 한글명/영어명이 모두 비어 있는 {n_skipped}개 행은 건너뜁니다.")
    return labeled.reset_index(drop=True)


def generate_chart(summary_df: pd.DataFrame, output_path: Path) -> None:
    engines = summary_df["engine"].tolist()
    colors = {"claude": "#C15F3C", "openai": "#10A37F"}
    bar_colors = [colors.get(e, "#888888") for e in engines]

    fig, axes = plt.subplots(1, 3, figsize=(13, 4))
    axes[0].bar(engines, summary_df["mean_cer"], color=bar_colors)
    axes[0].set_title("Mean CER")
    axes[0].set_ylabel("CER")
    axes[1].bar(engines, summary_df["mean_identification_score"], color=bar_colors)
    axes[1].set_title("Mean Identification Score (0~3)")
    axes[1].set_ylabel("score")
    axes[2].bar(engines, summary_df["mean_latency_sec"], color=bar_colors)
    axes[2].set_title("Mean Latency (sec)")
    axes[2].set_ylabel("seconds")
    fig.tight_layout()
    fig.savefig(output_path, dpi=150)
    plt.close(fig)


def generate_sample_visualizations(raw_df: pd.DataFrame, images_dir: Path, output_dir: Path, n: int) -> None:
    """제품 사진 + 실제로 추출된 텍스트를 나란히 보여주는 예시 이미지 n장을 만든다."""
    samples_dir = output_dir / "samples"
    samples_dir.mkdir(parents=True, exist_ok=True)

    picked = raw_df[raw_df["error"].isna()].drop_duplicates("filename").head(n)
    for _, row in picked.iterrows():
        image_path = images_dir / row["filename"]
        if not image_path.exists():
            continue
        img = Image.open(image_path)

        fig, (ax_img, ax_text) = plt.subplots(1, 2, figsize=(11, 6), gridspec_kw={"width_ratios": [1, 1.2]})
        ax_img.imshow(img)
        ax_img.axis("off")
        ax_img.set_title(row["filename"], fontsize=10)

        ax_text.axis("off")
        body = (
            f"[{row['engine']}] 추출 결과 ({row['latency_sec']:.2f}초)\n"
            f"{'-' * 30}\n{row['raw_text']}\n\n"
            f"정답(브랜드+제품명): {row['ground_truth']}\n"
            f"CER: {row['best_cer']:.3f}   식별점수: {row['identification_score']}/3"
        )
        ax_text.text(0, 1, body, va="top", ha="left", wrap=True, fontsize=9, family="monospace")

        fig.tight_layout()
        fig.savefig(samples_dir / f"{Path(row['filename']).stem}_{row['engine']}.png", dpi=150)
        plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description="Claude / GPT-4o Vision OCR 벤치마크")
    parser.add_argument("--images-dir", default="../ocr_benchmark/images")
    parser.add_argument("--labels-csv", default="../ocr_benchmark/labels.csv")
    parser.add_argument("--output-dir", default="output")
    parser.add_argument("--engines", default="claude", help="쉼표로 구분 (claude,openai)")
    parser.add_argument("--claude-model", default="claude-opus-5")
    parser.add_argument("--openai-model", default="gpt-4o")
    parser.add_argument("--limit", type=int, default=None, help="빠른 테스트용: 앞에서 N장만 실행")
    parser.add_argument("--samples", type=int, default=5, help="추출 결과 예시 이미지 생성 개수")
    args = parser.parse_args()

    images_dir = Path(args.images_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    requested_engines = args.engines.split(",")

    labels_df = load_labels(Path(args.labels_csv))
    if args.limit:
        labels_df = labels_df.head(args.limit)
    if labels_df.empty:
        print("ground_truth가 채워진 행이 없습니다.")
        return

    engine_fns = {}
    if "claude" in requested_engines:
        import anthropic

        client = anthropic.Anthropic()  # ANTHROPIC_API_KEY 환경변수 또는 `ant auth login` 프로필 사용
        engine_fns["claude"] = lambda p: run_claude_ocr(p, client, model=args.claude_model)
    if "openai" in requested_engines:
        import openai

        client = openai.OpenAI()  # OPENAI_API_KEY 환경변수 사용
        engine_fns["openai"] = lambda p: run_openai_ocr(p, client, model=args.openai_model)

    rows = []
    for _, row in tqdm(list(labels_df.iterrows()), desc="이미지 처리 중"):
        image_path = images_dir / row["filename"]
        if not image_path.exists():
            print(f"[경고] 파일을 찾을 수 없어 건너뜁니다: {image_path}")
            continue

        for engine_name, run_fn in engine_fns.items():
            result = run_fn(image_path)
            metrics = compute_all_metrics(
                row["ground_truth"], result.text, result.fragments, result.latency_sec,
                brand=row["브랜드"], korean_name=row["한글명"], english_name=row["영어명"],
            )
            rows.append({
                "filename": row["filename"],
                "engine": engine_name,
                "ground_truth": row["ground_truth"],
                "raw_text": result.text,
                "error": result.error,
                **metrics,
            })

    raw_df = pd.DataFrame(rows)
    raw_df.to_csv(output_dir / "results_raw.csv", index=False)

    summary_df = aggregate_by_engine(raw_df)
    summary_df.to_csv(output_dir / "summary.csv", index=False)
    with open(output_dir / "summary.md", "w") as f:
        f.write(summary_df.to_markdown(index=False))

    generate_chart(summary_df, output_dir / "comparison_chart.png")
    generate_sample_visualizations(raw_df, images_dir, output_dir, args.samples)

    print(f"\n결과 저장 완료: {output_dir}/summary.md, {output_dir}/comparison_chart.png, {output_dir}/samples/\n")
    print(summary_df.to_string(index=False))


if __name__ == "__main__":
    main()
