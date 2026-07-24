"""images/ 폴더를 스캔해 labels.csv 템플릿을 생성/갱신한다.

파일명에서 정제한 문자열은 어디까지나 참고용 힌트(suggested_label)일 뿐이며,
ground_truth는 항상 빈 칸으로 생성한다 - 정답은 사람이 실제 사진을 보고 채워야 한다.
재실행 시 이미 채워진 ground_truth 값은 절대 덮어쓰지 않고, 새로 추가된 파일만 append한다.
"""
import argparse
import re
from pathlib import Path

import pandas as pd

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
COLUMNS = ["filename", "suggested_label", "ground_truth", "condition", "notes"]


def scan_images_dir(images_dir: Path) -> list[Path]:
    return sorted(
        p for p in images_dir.iterdir()
        if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS
    )


def clean_filename_to_label(filename: str) -> str:
    name = Path(filename).stem
    name = re.sub(r"^IMG[_-]?", "", name, flags=re.IGNORECASE)
    name = re.sub(r"[_\-]+", " ", name)
    name = re.sub(r"\(\d+\)$", "", name)
    name = re.sub(r"\s+\d+$", "", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name


def build_template(images: list[Path]) -> pd.DataFrame:
    rows = [
        {
            "filename": p.name,
            "suggested_label": clean_filename_to_label(p.name),
            "ground_truth": "",
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
    print(f"{labels_csv}: 신규 {n_added}개 추가, 기존 {n_skipped}개 유지 (ground_truth 보존됨)")
    print("이제 labels.csv를 열어 각 사진을 직접 확인하며 ground_truth 칸을 채워주세요.")


if __name__ == "__main__":
    main()
