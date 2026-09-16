"""네이버 CLOVA OCR(General) 벤치마크 실행 스크립트.

ocr_benchmark(Tesseract/EasyOCR/PaddleOCR), AI_OCR(Claude/GPT-4o)와 같은 이미지·정답
라벨을 그대로 재사용해 CER/WER/정확일치율/레이턴시를 동일한 기준으로 비교한다.
"""
import argparse
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd
from dotenv import load_dotenv
from tqdm import tqdm

# scripts/CLOVA_OCR/.env 또는 저장소 루트 .env에서 CLOVA_OCR_SECRET / CLOVA_OCR_INVOKE_URL을 읽는다.
load_dotenv(Path(__file__).resolve().parent / ".env")
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

# metrics.py는 pandas/rapidfuzz만 있으면 되므로 ocr_benchmark의 무거운 opencv/easyocr
# 의존성 없이 그대로 재사용한다 (build_ground_truth/load_labels는 그 대가로 아래에 복사).
# --region-detection을 쓸 때만 preprocessing/region_detection(opencv/easyocr 필요)도 가져온다.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "ocr_benchmark"))
from metrics import aggregate_by_engine, compute_all_metrics  # noqa: E402

from engines_clova import run_clova_ocr, run_clova_ocr_on_image, OCRResult


def run_on_regions(image_path: Path, detector, secret_key: str, invoke_url: str) -> OCRResult:
    """region-detection으로 크롭한 후보 영역마다 CLOVA OCR을 호출하고 결과를 합친다.
    ocr_benchmark/run_benchmark.py의 run_engine_on_regions()와 동일한 방식."""
    from preprocessing import preprocess_image
    from region_detection import detect_candidate_regions

    preprocessed = preprocess_image(image_path)
    candidates = detect_candidate_regions(preprocessed, detector)

    texts, fragments, errors = [], [], []
    latency_sec = 0.0
    for image in candidates:
        result = run_clova_ocr_on_image(image, secret_key, invoke_url)
        if result.text:
            texts.append(result.text)
        fragments.extend(result.fragments)
        latency_sec += result.latency_sec
        if result.error:
            errors.append(result.error)
    return OCRResult(
        engine="clova", text=" ".join(texts), fragments=fragments, latency_sec=latency_sec,
        error="; ".join(errors) if errors else None,
    )


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
    fig, axes = plt.subplots(1, 3, figsize=(13, 4))
    axes[0].bar(engines, summary_df["mean_cer"], color="#03C75A")
    axes[0].set_title("Mean CER")
    axes[1].bar(engines, summary_df["mean_identification_score"], color="#03C75A")
    axes[1].set_title("Mean Identification Score (0~3)")
    axes[2].bar(engines, summary_df["mean_latency_sec"], color="#03C75A")
    axes[2].set_title("Mean Latency (sec)")
    fig.tight_layout()
    fig.savefig(output_path, dpi=150)
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description="네이버 CLOVA OCR(General) 벤치마크")
    parser.add_argument("--images-dir", default="../ocr_benchmark/images")
    parser.add_argument("--labels-csv", default="../ocr_benchmark/labels.csv")
    parser.add_argument("--output-dir", default="output")
    parser.add_argument("--limit", type=int, default=None, help="빠른 테스트용: 앞에서 N장만 실행")
    parser.add_argument(
        "--region-detection", action="store_true",
        help="ocr_benchmark와 동일하게 브랜드/제품명 후보 영역만 크롭해 CLOVA OCR에 넣는다",
    )
    parser.add_argument("--tag", default=None, help="결과 파일명 접미사 (예: region_detect)")
    args = parser.parse_args()

    import os

    secret_key = os.environ.get("CLOVA_OCR_SECRET")
    invoke_url = os.environ.get("CLOVA_OCR_INVOKE_URL")
    if not secret_key or not invoke_url:
        print("[에러] CLOVA_OCR_SECRET / CLOVA_OCR_INVOKE_URL 환경변수가 없습니다. README.md 참고.")
        return

    images_dir = Path(args.images_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    suffix = f"_{args.tag}" if args.tag else ""

    labels_df = load_labels(Path(args.labels_csv))
    if args.limit:
        labels_df = labels_df.head(args.limit)
    if labels_df.empty:
        print("ground_truth가 채워진 행이 없습니다.")
        return

    detector = None
    if args.region_detection:
        from region_detection import build_detector

        print("텍스트 영역 검출기 로딩 중...")
        detector = build_detector()

    rows = []
    for _, row in tqdm(list(labels_df.iterrows()), desc="이미지 처리 중"):
        image_path = images_dir / row["filename"]
        if not image_path.exists():
            print(f"[경고] 파일을 찾을 수 없어 건너뜁니다: {image_path}")
            continue

        if detector is not None:
            result = run_on_regions(image_path, detector, secret_key, invoke_url)
        else:
            result = run_clova_ocr(image_path, secret_key, invoke_url)
        metrics = compute_all_metrics(
            row["ground_truth"], result.text, result.fragments, result.latency_sec,
            brand=row["브랜드"], korean_name=row["한글명"], english_name=row["영어명"],
        )
        rows.append({
            "filename": row["filename"],
            "engine": "clova",
            "ground_truth": row["ground_truth"],
            "raw_text": result.text,
            "error": result.error,
            **metrics,
        })

    raw_df = pd.DataFrame(rows)
    raw_df.to_csv(output_dir / f"results_raw{suffix}.csv", index=False)

    summary_df = aggregate_by_engine(raw_df)
    summary_df.to_csv(output_dir / f"summary{suffix}.csv", index=False)
    with open(output_dir / f"summary{suffix}.md", "w") as f:
        f.write(summary_df.to_markdown(index=False))

    generate_chart(summary_df, output_dir / f"comparison_chart{suffix}.png")

    print(f"\n결과 저장 완료: {output_dir}/summary{suffix}.md, {output_dir}/comparison_chart{suffix}.png\n")
    print(summary_df.to_string(index=False))


if __name__ == "__main__":
    main()
