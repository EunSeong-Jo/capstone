#!/usr/bin/env python3
"""성분 기능 분류 시드 — data/seed/ingredient_functions/labels.csv → ingredient_functions

    python scripts/seed_ingredient_functions.py --dry-run   # 검사·매칭 수만 출력
    python scripts/seed_ingredient_functions.py             # 실제 적재

멱등하다. CSV가 원본이므로 분류를 고칠 때는 CSV를 고치고 다시 돌린다.
분류표와 판정 지침은 data/seed/ingredient_functions/README.md.

키는 `norm_name`이다(id는 환경마다 달라 쓰지 않는다 — data/seed/skin_type_ingredients/README.md).
어휘 검사: 허용 코드 밖의 값이 한 행이라도 있으면 아무것도 적재하지 않는다.

입력 컬럼
  norm_name   ingredients.norm_name과 맞춰 ingredient_id를 찾는다
  name_ko     사람이 읽는 용(적재에 쓰지 않는다)
  functions   H B S W A O P E U 의 조합(예: 'HB'). 활성이 아니면 빈 값
  role        a e s f t p x j 중 하나
  flags       I F L 의 조합(예: 'FI'). 없으면 빈 값
  confidence  1 | 2 | 3
  note        선택
  source      ai_expert | reviewed | mfds | cosing
  allergen_listed  1이면 식약처 알레르기 유발 착향제 고시 목록의 성분(data/seed/ingredient_functions/allergens_mfds.csv)
"""
from __future__ import annotations

import argparse
import csv
import sys
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "backend"))

CSV_PATH = REPO / "data/seed/ingredient_functions/labels.csv"

FUNCTIONS = set("HBSWAOPEU")
ROLES = set("aefstpxj")
FLAGS = set("IFL")
# ai_expert: AI가 성분 지식으로 판정 · reviewed: 사람 검수 · mfds: 식약처 고시 목록 · cosing: EU CosIng 확인
SOURCES = {"ai_expert", "reviewed", "mfds", "cosing"}


def parse(rows: list[dict]) -> tuple[list[tuple], list[str]]:
    """CSV 행 → (norm_name, functions[], role, flags[], confidence, note, source, allergen_listed). 잘못된 행은 errors로."""
    out: list[tuple] = []
    errors: list[str] = []
    seen: set[str] = set()
    for i, r in enumerate(rows, start=2):  # 1행은 헤더
        name = (r.get("norm_name") or "").strip()
        functions = (r.get("functions") or "").strip()
        role = (r.get("role") or "").strip()
        flags = (r.get("flags") or "").strip()
        source = (r.get("source") or "").strip()
        listed = (r.get("allergen_listed") or "0").strip() in ("1", "true", "True")
        try:
            confidence = int(r.get("confidence") or 0)
        except ValueError:
            confidence = 0
        problems = []
        if not name:
            problems.append("norm_name 없음")
        elif name in seen:
            problems.append("norm_name 중복")
        if set(functions) - FUNCTIONS:
            problems.append(f"기능 '{functions}'")
        if role not in ROLES:
            problems.append(f"역할 '{role}'")
        if set(flags) - FLAGS:
            problems.append(f"플래그 '{flags}'")
        if confidence not in (1, 2, 3):
            problems.append(f"확신도 '{r.get('confidence')}'")
        if source not in SOURCES:
            problems.append(f"source '{source}'")
        if listed and ("F" not in flags or confidence != 3):
            problems.append("allergen_listed는 향료(F)·확신도 3이어야 함")
        if role == "j" and (functions or flags):
            problems.append("오염(j)인데 기능·플래그가 있음")
        if role == "a" and not functions:
            problems.append("활성(a)인데 기능이 없음")
        if problems:
            errors.append(f"{i}행 {name or '?'}: " + ", ".join(problems))
            continue
        seen.add(name)
        out.append((name, sorted(functions), role, sorted(flags), confidence,
                    (r.get("note") or "").strip() or None, source, listed))
    return out, errors


def bump_cache_version() -> None:
    """products:cache_version INCR — best-effort (유사도·궁합 캐시를 무효화한다)."""
    try:
        import redis

        from app.config import settings
        r = redis.Redis.from_url(settings.REDIS_URL, socket_connect_timeout=0.5, socket_timeout=0.5)
        print(f"캐시 버전 갱신 → v{r.incr('products:cache_version')}")
    except Exception as exc:  # noqa: BLE001
        print(f"캐시 버전 갱신 실패(무시): {exc}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="검사·매칭 수만 출력하고 적재하지 않는다")
    args = ap.parse_args()

    with open(CSV_PATH, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    parsed, errors = parse(rows)
    if errors:
        print("\n".join(errors[:20]))
        sys.exit(f"잘못된 행 {len(errors)}건 — 적재하지 않았습니다.")

    print(f"CSV {len(rows):,}행 · 어휘 검사 통과")
    print("  역할:", dict(Counter(p[2] for p in parsed)))
    print("  확신도:", dict(sorted(Counter(p[4] for p in parsed).items())))

    import psycopg2
    from psycopg2.extras import execute_values

    from app.config import settings

    with psycopg2.connect(settings.DATABASE_DSN) as conn, conn.cursor() as cur:
        cur.execute("SELECT norm_name, id FROM ingredients")
        id_of = dict(cur.fetchall())
        values = [(id_of[n], f, role, fl, c, note, src, listed)
                  for n, f, role, fl, c, note, src, listed in parsed if n in id_of]
        missing = [p[0] for p in parsed if p[0] not in id_of]
        print(f"DB와 매칭 {len(values):,}건" + (f" · DB에 없는 성분 {len(missing)}건(건너뜀): {missing[:10]}" if missing else ""))
        if args.dry_run:
            print("--dry-run: 적재하지 않았습니다.")
            return

        execute_values(
            cur,
            """INSERT INTO ingredient_functions
                   (ingredient_id, functions, role, flags, confidence, note, source, allergen_listed)
               VALUES %s
               ON CONFLICT (ingredient_id) DO UPDATE SET
                   functions  = EXCLUDED.functions,
                   role       = EXCLUDED.role,
                   flags      = EXCLUDED.flags,
                   confidence = EXCLUDED.confidence,
                   note       = EXCLUDED.note,
                   source     = EXCLUDED.source,
                   allergen_listed = EXCLUDED.allergen_listed,
                   updated_at = now()""",
            values,
            template="(%s, %s::text[], %s, %s::text[], %s, %s, %s, %s)",
            page_size=1000,
        )
        conn.commit()
        cur.execute("SELECT count(*) FROM ingredient_functions")
        print(f"적재 {len(values):,}건 → ingredient_functions {cur.fetchone()[0]:,}행")

    bump_cache_version()


if __name__ == "__main__":
    main()
