#!/usr/bin/env python3
"""성분 마스터 시드 — 대한화장품협회 표준화명칭목록 → ingredients / ingredient_aliases

    python scripts/seed_ingredients.py

멱등하다. 여러 번 돌려도 행수가 늘지 않는다.

입력
  data/seed/ingredient_dict.csv.gz   표준화명칭목록 (code, std_ko, std_en, old_ko, old_en)
  data/seed/name_changes.csv.gz      명칭변경목록 (+ changed_at)

별칭이 서로 다른 표준명 둘 이상을 가리키는 경우가 있다
(예: '승마추출물' → 촛대승마추출물 / 라케모사승마뿌리추출물).
기계적으로 결정할 수 없으므로 is_ambiguous=true로 표시만 하고,
적재 시 자동 변환에서 제외한다.
"""
from __future__ import annotations

import csv
import gzip
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_values

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "backend"))

from app.config import settings  # noqa: E402
from app.utils.ingredients import normalize  # noqa: E402

DICT_CSV = REPO / "data/seed/ingredient_dict.csv.gz"
CHANGES_CSV = REPO / "data/seed/name_changes.csv.gz"


def read_gz_csv(path: Path) -> list[dict]:
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def parse_date(s: str) -> date | None:
    s = (s or "").strip()
    try:
        return date.fromisoformat(s)
    except ValueError:
        return None


def main() -> None:
    if not DICT_CSV.exists():
        sys.exit(f"성분사전이 없습니다: {DICT_CSV}")

    rows = read_gz_csv(DICT_CSV)
    changes = read_gz_csv(CHANGES_CSV) if CHANGES_CSV.exists() else []
    print(f"표준화명칭목록 {len(rows):,}행 / 명칭변경목록 {len(changes):,}행")

    # ── 표준 성분 집계 (normalized_name이 유일키) ──────────────────
    ingredients: dict[str, dict] = {}
    for r in rows:
        std = (r["std_ko"] or "").strip()
        if not std:
            continue
        key = normalize(std)
        if not key or key in ingredients:
            continue
        ingredients[key] = {
            "normalized_name": key,
            "korean_name": std,
            "english_name": (r["std_en"] or "").strip() or None,
            "official_code": (r["code"] or "").strip() or None,
        }

    # ── 별칭 집계 ────────────────────────────────────────────────
    # alias(정규화) → {표준명 정규화 키} 집합. 2개 이상이면 모호.
    alias_targets: dict[str, set[str]] = defaultdict(set)
    alias_changed: dict[str, date | None] = {}

    def collect(src: list[dict], date_col: str | None) -> None:
        for r in src:
            std = (r["std_ko"] or "").strip()
            if not std:
                continue
            std_key = normalize(std)
            for raw_alias in (r["old_ko"] or "").split("|"):
                a = normalize(raw_alias)
                if not a or a == std_key:
                    continue
                alias_targets[a].add(std_key)
                if date_col:
                    alias_changed.setdefault(a, parse_date(r.get(date_col, "")))

    collect(rows, None)
    collect(changes, "changed_at")

    ambiguous = {a for a, t in alias_targets.items() if len(t) > 1}
    print(f"성분 {len(ingredients):,}종 / 별칭 {len(alias_targets):,}건 "
          f"(모호 {len(ambiguous):,}건)")

    # ── 적재 ─────────────────────────────────────────────────────
    with psycopg2.connect(settings.DATABASE_DSN) as conn, conn.cursor() as cur:
        execute_values(
            cur,
            """INSERT INTO ingredients
                   (normalized_name, korean_name, english_name, official_code)
               VALUES %s
               ON CONFLICT (normalized_name) DO UPDATE SET
                   korean_name   = EXCLUDED.korean_name,
                   english_name  = COALESCE(EXCLUDED.english_name, ingredients.english_name),
                   official_code = COALESCE(EXCLUDED.official_code, ingredients.official_code)""",
            [(v["normalized_name"], v["korean_name"], v["english_name"], v["official_code"])
             for v in ingredients.values()],
            page_size=1000,
        )
        conn.commit()

        cur.execute("SELECT normalized_name, id FROM ingredients")
        id_of = dict(cur.fetchall())

        alias_rows = []
        for a, targets in alias_targets.items():
            # 모호한 별칭도 첫 대상으로 걸어두되 플래그로 구분한다.
            # 적재 스크립트가 is_ambiguous=true인 별칭은 변환에 쓰지 않는다.
            target = sorted(targets)[0]
            ing_id = id_of.get(target)
            if ing_id is None or a in id_of:
                # 별칭이 그 자체로 표준명이면 매핑하지 않는다.
                continue
            alias_rows.append((a, ing_id, a in ambiguous, alias_changed.get(a)))

        execute_values(
            cur,
            """INSERT INTO ingredient_aliases (alias, ingredient_id, is_ambiguous, changed_at)
               VALUES %s
               ON CONFLICT (alias) DO UPDATE SET
                   ingredient_id = EXCLUDED.ingredient_id,
                   is_ambiguous  = EXCLUDED.is_ambiguous,
                   changed_at    = COALESCE(EXCLUDED.changed_at, ingredient_aliases.changed_at)""",
            alias_rows,
            page_size=1000,
        )
        conn.commit()

        cur.execute("SELECT count(*) FROM ingredients")
        n_ing = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM ingredient_aliases")
        n_alias = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM ingredient_aliases WHERE is_ambiguous")
        n_amb = cur.fetchone()[0]

    print(f"\n완료 — ingredients {n_ing:,}행 / ingredient_aliases {n_alias:,}행 "
          f"(모호 {n_amb:,})")


if __name__ == "__main__":
    main()
