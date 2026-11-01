#!/usr/bin/env python3
"""독립성 점검 — test 표본이 dev(튜닝에 쓴 자료)와 겹치지 않는지 id 교집합으로 확인한다. 외부 호출·DB 없음.

    python3 scripts/eval/independence.py     # 교집합이 0 이 아니면 종료코드 1

- 유사도: test 시드 ∩ dev 시드(similarity_gold.csv, curated_gold.csv)
- OCR: test 정답 id ∩ dev 정답 id (data/ocr_test/labels.csv)
- 궁합: test 판정 제품은 튜닝 자료가 따로 없어 dev 대응 파일이 없음 → 제품 수만 보고한다
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
EV = REPO / "data" / "eval"


def rows(path):
    return list(csv.DictReader(open(path, encoding="utf-8-sig", newline="")))


def main() -> int:
    bad = 0
    test_seeds = {r["seed_id"] for r in rows(EV / "similarity_test_pool.csv")}
    dev_seeds = {r["seed_id"] for r in rows(EV / "similarity_gold.csv")} | {r["seed_id"] for r in rows(EV / "curated_gold.csv")}
    inter = test_seeds & dev_seeds
    print(f"유사도 시드: test {len(test_seeds)} · dev {len(dev_seeds)} · 교집합 {len(inter)} {sorted(inter)[:10]}")
    bad += len(inter)

    def ids(path):
        out = set()
        for r in csv.DictReader(l for l in open(path, encoding="utf-8-sig") if not l.startswith("#")):
            out |= {x for x in (r.get("product_ids") or "").split("|") if x.strip().isdigit()}
        return out

    dev_ids = ids(REPO / "data" / "ocr_test" / "labels.csv")
    test_ids = ids(REPO / "data" / "ocr_test" / "labels_test.csv")
    inter = dev_ids & test_ids
    print(f"OCR 정답 id: test {len(test_ids)} · dev {len(dev_ids)} · 교집합 {len(inter)} {sorted(inter)[:10]}")
    bad += len(inter)

    fit = {r["product_id"] for r in rows(EV / "skin_fit_test_pool.csv")}
    print(f"궁합 test 제품 {len(fit)}개 (dev 대응 파일 없음)")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
