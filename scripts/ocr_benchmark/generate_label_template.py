"""images/ 폴더를 스캔해 labels.csv 템플릿을 생성/갱신한다.

정답은 한글명/영어명/브랜드 3개 컬럼으로 나눠 기록한다 (run_benchmark.py가 이를 조합해
ground_truth를 만든다). 새로 스캔된 이미지는 전부 빈 칸으로 생성된다 - 실제 사진을 보고
채워야 한다. 재실행 시 이미 채워진 행은 절대 덮어쓰지 않고, 새로 추가된 파일만 append한다.
"""
import argparse
from pathlib import Path

import pandas as pd

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
COLUMNS = ["filename", "한글명", "영어명", "브랜드", "condition", "notes"]


def scan_images_dir(images_dir: Path) -> list[Path]:
    return sorted(
        p for p in images_dir.iterdir()
        if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS
    )


def build_template(images: list[Path]) -> pd.DataFrame:
    rows = [
        {
            "filename": p.name,
            "한글명": "",
            "영어명": "",
            "브랜드": "",
            "condition": "",
            "notes": "",
        }
        for p in images
    ]
    return pd.DataFrame(rows, columns=COLUMNS)


def merge_with_existing(new_df: pd.DataFrame, labels_csv: Path) -> tuple[pd.DataFrame, int, int]:
    if not labels_csv.exists():
        return new_df, len(new_df), 0

    existing_df = pd.read_csv(labels_csv, dtype=str).fillna("")
    existing_filenames = set(existing_df["filename"])

    to_append = new_df[~new_df["filename"].isin(existing_filenames)]
    merged = pd.concat([existing_df, to_append], ignore_index=True)
    return merged, len(to_append), len(new_df) - len(to_append)


def main():
    parser = argparse.ArgumentParser(description="OCR 벤치마크용 라벨 템플릿 생성/갱신")
    parser.add_argument("--images-dir", default="images")
    parser.add_argument("--labels-csv", default="labels.csv")
    args = parser.parse_args()

    images_dir = Path(args.images_dir)
    labels_csv = Path(args.labels_csv)

    images = scan_images_dir(images_dir)
    if not images:
        print(f"[경고] {images_dir}에서 이미지를 찾지 못했습니다.")
        return

    new_df = build_template(images)
    merged_df, n_added, n_skipped = merge_with_existing(new_df, labels_csv)
    merged_df.to_csv(labels_csv, index=False)

    print(f"이미지 {len(images)}개 스캔 완료.")
    print(f"{labels_csv}: 신규 {n_added}개 추가, 기존 {n_skipped}개 유지 (기존 라벨 보존됨)")
    print("이제 labels.csv를 열어 각 사진을 직접 확인하며 한글명/영어명/브랜드 칸을 채워주세요.")


if __name__ == "__main__":
    main()
