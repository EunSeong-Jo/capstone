#!/usr/bin/env python3
"""대한화장품협회 성분 목록 PDF → CSV

    pip install -r requirements-dev.txt
    python scripts/extract_ingredient_dict.py \
        --std     표준화명칭목록_260630.pdf \
        --changes 명칭변경목록_260630.pdf

data/seed/ 아래 gzip CSV로 저장한다. 협회가 목록을 갱신하면 새 PDF를 받아
다시 돌리면 된다. PDF 원본은 용량이 커(8MB) 커밋하지 않으므로 팀 드라이브에 둔다.

출처: https://kcia.or.kr — 화장품 성분사전
  표준화명칭목록 : 성분코드 | 표준 성분명 | 표준 영문명 | 구명칭 | 구영문명
  명칭변경목록   : 위와 동일 + 변경일자
"""
from __future__ import annotations

import argparse
import csv
import gzip
import re
import sys
from pathlib import Path

try:
    import pdfplumber
except ImportError:
    sys.exit("pdfplumber가 필요합니다:  pip install -r requirements-dev.txt")

REPO = Path(__file__).resolve().parents[1]
SEED = REPO / "data" / "seed"

STD_FIELDS = ["code", "std_ko", "std_en", "old_ko", "old_en"]
CHG_FIELDS = STD_FIELDS + ["changed_at"]
HEADER_CELLS = {
    "성분코드", "표준 성분명", "표준명칭", "표준 영문명", "표준영문명",
    "구명칭", "구영문명", "변경일자",
}


def clean(c: str | None) -> str:
    return re.sub(r"\s+", " ", (c or "").replace("\n", "")).strip()


def extract(pdf_path: Path, fields: list[str]) -> list[dict]:
    rows: list[dict] = []
    n = len(fields)
    with pdfplumber.open(pdf_path) as pdf:
        total = len(pdf.pages)
        for i, page in enumerate(pdf.pages, 1):
            table = page.extract_table()
            if not table:
                continue
            for r in table:
                cells = [clean(c) for c in r]
                if not any(cells) or set(cells) & HEADER_CELLS:
                    continue
                # "성분사전 표준화명칭목록", "2026.06.30 기준" 같은 표제 행
                if cells[0].startswith("성분사전") or (
                    "기준" in cells[0] and len(cells[0]) < 20
                ):
                    continue
                cells = (cells + [""] * n)[:n]
                rec = dict(zip(fields, cells))
                if rec["std_ko"]:
                    rows.append(rec)
            if i % 200 == 0:
                print(f"  {i}/{total} 페이지 · 누적 {len(rows):,}행", flush=True)
    return rows


def write_gz(rows: list[dict], fields: list[str], out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(out, "wt", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    print(f"  → {out.relative_to(REPO)} ({out.stat().st_size / 1024:.0f}KB, {len(rows):,}행)")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--std", type=Path, help="표준화명칭목록 PDF")
    ap.add_argument("--changes", type=Path, help="명칭변경목록 PDF")
    args = ap.parse_args()

    if not args.std and not args.changes:
        ap.error("--std 또는 --changes 중 하나는 필요합니다")

    if args.std:
        print(f"표준화명칭목록 추출: {args.std}")
        write_gz(extract(args.std, STD_FIELDS), STD_FIELDS,
                 SEED / "ingredient_dict.csv.gz")
    if args.changes:
        print(f"명칭변경목록 추출: {args.changes}")
        write_gz(extract(args.changes, CHG_FIELDS), CHG_FIELDS,
                 SEED / "name_changes.csv.gz")


if __name__ == "__main__":
    main()
