"""Tesseract vs EasyOCR vs PaddleOCR 벤치마크 메인 실행 스크립트."""
import argparse
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd
from tqdm import tqdm

from engines import ALL_ENGINE_NAMES, OCRResult, build_engines
from metrics import aggregate_by_engine, compute_all_metrics
from preprocessing import preprocess_image
from region_detection import build_detector, detect_candidate_regions


def build_ground_truth(row: pd.Series) -> str:
    """브랜드 + 이름(한글명 우선, 없으면 영어명)을 합쳐 매칭 대상 문자열을 만든다.

    한글명·영어명이 둘 다 비어 있으면(=사진 프레임에 제품명이 없는 경우) 빈 문자열을
    반환해 벤치마크 대상에서 자동 제외한다.
    """
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


def run_engine_on_regions(run_fn, images: list) -> OCRResult:
    """엔진 함수를 후보 영역(크롭) 각각에 대해 실행하고 결과를 하나로 합친다.

    images가 원본 전체 이미지 1장뿐이면(=텍스트 영역 검출 미사용) 기존과 동일하게
    동작한다 - 한 번만 호출되고 그 결과를 그대로 반환.
    """
    engine_name = ""
    texts, fragments, errors = [], [], []
    latency_sec = 0.0
    for image in images:
        result = run_fn(image)
        engine_name = result.engine
        if result.text:
            texts.append(result.text)
        fragments.extend(result.fragments)
        latency_sec += result.latency_sec
        if result.error:
            errors.append(result.error)
    return OCRResult(
        engine=engine_name,
        text=" ".join(texts),
        fragments=fragments,
        latency_sec=latency_sec,
        error="; ".join(errors) if errors else None,
    )


def generate_chart(summary_df: pd.DataFrame, output_path: Path) -> None:
    engines = summary_df["engine"].tolist()
    colors = {
        "tesseract": "#4C72B0",
        "easyocr": "#DD8452",
        "paddleocr": "#55A868",
        "tesseract_easyocr_fallback": "#8172B3",
    }
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
    parser.add_argument(
        "--region-detection",
        action="store_true",
        help="EasyOCR CRAFT 검출기로 브랜드/제품명 후보 영역만 크롭해 OCR에 넣는다 (기본: 이미지 전체 사용)",
    )
    parser.add_argument(
        "--tesseract-psm",
        type=int,
        default=11,
        help="Tesseract PSM(페이지 분할 모드). 기본 11(sparse text). "
        "--region-detection과 함께 쓸 때는 6(균일한 단일 블록)도 시도해볼 것",
    )
    parser.add_argument(
        "--engines",
        default=",".join(ALL_ENGINE_NAMES),
        help=f"쉼표로 구분된 실행할 엔진 목록 (기본 전체: {','.join(ALL_ENGINE_NAMES)}). "
        "예: --engines paddleocr — 특정 엔진만 빠르게 재검증할 때 사용",
    )
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
    engines = build_engines(tesseract_psm=args.tesseract_psm, engines=args.engines.split(","))

    detector = None
    if args.region_detection:
        print("텍스트 영역 검출기 로딩 중...")
        detector = build_detector()

    rows = []
    for _, row in tqdm(list(labels_df.iterrows()), desc="이미지 처리 중"):
        image_path = images_dir / row["filename"]
        if not image_path.exists():
            print(f"[경고] 파일을 찾을 수 없어 건너뜁니다: {image_path}")
            continue

        preprocessed = preprocess_image(image_path)

        if detector is not None:
            candidate_images = detect_candidate_regions(preprocessed, detector)
        else:
            candidate_images = [preprocessed]

        for engine_name, run_fn in engines.items():
            result = run_engine_on_regions(run_fn, candidate_images)
            metrics = compute_all_metrics(
                row["ground_truth"],
                result.text,
                result.fragments,
                result.latency_sec,
                brand=row["브랜드"],
                korean_name=row["한글명"],
                english_name=row["영어명"],
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
