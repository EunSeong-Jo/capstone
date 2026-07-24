"""Tesseract vs EasyOCR vs PaddleOCR 벤치마크 메인 실행 스크립트."""
import argparse
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd
from tqdm import tqdm

from engines import build_engines
from metrics import aggregate_by_engine, compute_all_metrics
from preprocessing import preprocess_image


def load_labels(labels_csv: Path) -> pd.DataFrame:
    df = pd.read_csv(labels_csv, dtype=str).fillna("")
    labeled = df[df["ground_truth"].str.strip() != ""]
    n_skipped = len(df) - len(labeled)
    if n_skipped:
        print(f"[경고] ground_truth가 비어 있는 {n_skipped}개 행은 건너뜁니다.")
    return labeled.reset_index(drop=True)


def generate_chart(summary_df: pd.DataFrame, output_path: Path) -> None:
    engines = summary_df["engine"].tolist()
    colors = {"tesseract": "#4C72B0", "easyocr": "#DD8452", "paddleocr": "#55A868"}
    bar_colors = [colors.get(e, "#888888") for e in engines]

    fig, axes = plt.subplots(1, 3, figsize=(13, 4))

    axes[0].bar(engines, summary_df["mean_cer"], color=bar_colors)
    axes[0].set_title("Mean CER")
    axes[0].set_ylabel("CER")

    axes[1].bar(engines, summary_df["mean_wer"], color=bar_colors)
    axes[1].set_title("Mean WER")
    axes[1].set_ylabel("WER")

    axes[2].bar(engines, summary_df["mean_latency_sec"], color=bar_colors)
    axes[2].set_title("Mean Latency (sec)")
    axes[2].set_ylabel("seconds")

    fig.tight_layout()
    fig.savefig(output_path, dpi=150)
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description="OCR 3종 벤치마크 실행")
    parser.add_argument("--images-dir", default="images")
    parser.add_argument("--labels-csv", default="labels.csv")
    parser.add_argument("--output-dir", default="output")
    parser.add_argument("--tag", default=None)
    args = parser.parse_args()

    images_dir = Path(args.images_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    suffix = f"_{args.tag}" if args.tag else ""

    labels_df = load_labels(Path(args.labels_csv))
    if labels_df.empty:
        print("ground_truth가 채워진 행이 없습니다. labels.csv를 먼저 채워주세요.")
        return

    print("엔진 로딩 중 (최초 실행 시 모델 다운로드로 수 분 소요될 수 있습니다)...")
    engines = build_engines()

    rows = []
    for _, row in tqdm(list(labels_df.iterrows()), desc="이미지 처리 중"):
        image_path = images_dir / row["filename"]
        if not image_path.exists():
            print(f"[경고] 파일을 찾을 수 없어 건너뜁니다: {image_path}")
            continue

        preprocessed = preprocess_image(image_path)

        for engine_name, run_fn in engines.items():
            result = run_fn(preprocessed)
            metrics = compute_all_metrics(row["ground_truth"], result.text, result.fragments, result.latency_sec)
            rows.append({
                "filename": row["filename"],
                "engine": engine_name,
                "ground_truth": row["ground_truth"],
                "raw_text": result.text,
                "error": result.error,
                **metrics,
            })

    raw_df = pd.DataFrame(rows)
    raw_path = output_dir / f"results_raw{suffix}.csv"
    raw_df.to_csv(raw_path, index=False)

    summary_df = aggregate_by_engine(raw_df)
    summary_df.to_csv(output_dir / f"summary{suffix}.csv", index=False)
    with open(output_dir / f"summary{suffix}.md", "w") as f:
        f.write(summary_df.to_markdown(index=False))

    generate_chart(summary_df, output_dir / f"comparison_chart{suffix}.png")

    print(f"\n결과 저장 완료: {raw_path}, {output_dir}/summary{suffix}.md, {output_dir}/comparison_chart{suffix}.png\n")
    print(summary_df.to_string(index=False))


if __name__ == "__main__":
    main()
