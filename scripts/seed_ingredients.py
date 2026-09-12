#!/usr/bin/env python3
"""성분 마스터 시드 — 대한화장품협회 표준화명칭목록 → ingredients / ingredient_aliases

    python scripts/seed_ingredients.py

멱등하다. 여러 번 돌려도 행수가 늘지 않는다.

입력
  data/seed/ingredient_dict.csv   표준화명칭목록 (code, std_ko, std_en, old_ko, old_en)
  data/seed/name_changes.csv      명칭변경목록 (+ changed_at)

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


def bump_cache_version() -> None:
    """products:cache_version INCR — best-effort.

    성분명은 ProductDetailOut.ingredients[]에 그대로 노출되므로, 재시드 후
    상세 캐시에 오래된 이름이 남지 않도록 함께 무효화한다. 실패해도
    스크립트 자체는 성공으로 끝나야 한다.
    """
    try:
        import redis
        r = redis.Redis.from_url(
            settings.REDIS_URL, socket_connect_timeout=0.5, socket_timeout=0.5,
        )
        print(f"캐시 버전 갱신 → v{r.incr('products:cache_version')}")
    except Exception as exc:  # noqa: BLE001
        print(f"캐시 버전 갱신 실패(무시): {exc}")


DICT_CSV = REPO / "data/seed/ingredient_dict.csv"
CHANGES_CSV = REPO / "data/seed/name_changes.csv"

# 판매자 오타 → 표준명 별칭. scripts/find_typo_aliases.py가 만들고 사람이
# verdict를 확정한다. 협회 CSV와 같은 자리에 두는 이유는 여기서 읽어야
# **재시드해도 살아남기** 때문이다 — ingredient_aliases에 직접 넣으면
# 아래 upsert(:ON CONFLICT DO UPDATE)가 ingredient_id를 덮어써 사라진다.
TYPO_CSV = REPO / "data/seed/ingredient_typo_fixes.csv"


def read_csv(path: Path) -> list[dict]:
    """확장자로 gzip 여부를 판별한다 (load_products.read_rows와 같은 방식).

    시드는 평문 CSV로 커밋하지만, 예전 .gz를 들고 있는 사람도 그대로 돌아간다.
    """
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def parse_date(s: str) -> date | None:
    s = (s or "").strip()
    try:
        return date.fromisoformat(s)
    except ValueError:
        return None


def resolve(path: Path) -> Path | None:
    """평문을 먼저 보고, 없으면 예전 .gz를 찾는다. 둘 다 없으면 None."""
    if path.exists():
        return path
    legacy = path.with_suffix(path.suffix + ".gz")
    return legacy if legacy.exists() else None


def main() -> None:
    dict_csv = resolve(DICT_CSV)
    if dict_csv is None:
        sys.exit(f"성분사전이 없습니다: {DICT_CSV}")
    changes_csv = resolve(CHANGES_CSV)

    rows = read_csv(dict_csv)
    changes = read_csv(changes_csv) if changes_csv else []
    print(f"표준화명칭목록 {len(rows):,}행 / 명칭변경목록 {len(changes):,}행")

    # ── 표준 성분 집계 (norm_name이 유일키) ───────────────────────
    ingredients: dict[str, dict] = {}
    for r in rows:
        std = (r["std_ko"] or "").strip()
        if not std:
            continue
        key = normalize(std)
        if not key or key in ingredients:
            continue
        ingredients[key] = {
            "norm_name": key,
            "name_ko": std,
            "name_en": (r["std_en"] or "").strip() or None,
            "code": (r["code"] or "").strip() or None,
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

    # 오타 별칭. verdict가 'ok'인 것만 쓴다 — 빈 값은 아직 검토 중이다.
    typos = 0
    if TYPO_CSV.exists():
        for r in read_csv(TYPO_CSV):
            if (r.get("verdict") or "").strip().lower() != "ok":
                continue
            a, std_key = normalize(r["alias"]), normalize(r["std_ko"])
            if not a or not std_key or a == std_key:
                continue
            alias_targets[a].add(std_key)
            typos += 1
        print(f"오타 별칭 {typos:,}건 ({TYPO_CSV.name})")

    ambiguous = {a for a, t in alias_targets.items() if len(t) > 1}
    print(f"성분 {len(ingredients):,}종 / 별칭 {len(alias_targets):,}건 "
          f"(모호 {len(ambiguous):,}건)")

    # ── 적재 ─────────────────────────────────────────────────────
    with psycopg2.connect(settings.DATABASE_DSN) as conn, conn.cursor() as cur:
        execute_values(
            cur,
            """INSERT INTO ingredients
                   (norm_name, name_ko, name_en, code)
               VALUES %s
               ON CONFLICT (norm_name) DO UPDATE SET
                   name_ko = EXCLUDED.name_ko,
                   name_en = COALESCE(EXCLUDED.name_en, ingredients.name_en),
                   code    = COALESCE(EXCLUDED.code, ingredients.code)""",
            [(v["norm_name"], v["name_ko"], v["name_en"], v["code"])
             for v in ingredients.values()],
            page_size=1000,
        )
        conn.commit()

        cur.execute("SELECT norm_name, id FROM ingredients")
        id_of = dict(cur.fetchall())
        cur.execute("SELECT norm_name FROM ingredients WHERE code IS NOT NULL")
        standard = {r[0] for r in cur.fetchall()}

        alias_rows = []
        for a, targets in alias_targets.items():
            # 모호한 별칭도 첫 대상으로 걸어두되 플래그로 구분한다.
            # 적재 스크립트가 is_ambiguous=true인 별칭은 변환에 쓰지 않는다.
            target = sorted(targets)[0]
            ing_id = id_of.get(target)
            if ing_id is None or a in standard:
                # 별칭이 그 자체로 **협회 표준명**이면 매핑하지 않는다.
                # 사전에 없는 행으로 존재하는 것은(오타 성분) 매핑 대상이다 —
                # 아래에서 그 행을 지워 조회가 별칭으로 흐르게 한다.
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

        # 별칭이 걸린 오타 성분 행을 지운다. load_products.resolve()가
        # 정규화 직결을 먼저 보므로, 행이 남아 있으면 별칭이 영영 안 쓰인다.
        # 연결(product_ingredients)은 CASCADE로 지워지고 바로 뒤 적재가
        # 표준 성분으로 다시 잇는다 — 그래서 이 스크립트 다음에 반드시
        # load_products.py를 돌려야 한다.
        aliased = [a for a, *_ in alias_rows]
        cur.execute(
            """DELETE FROM ingredients
                WHERE code IS NULL AND norm_name = ANY(%s)""",
            (aliased,),
        )
        if cur.rowcount:
            print(f"별칭으로 대체된 성분 행 삭제 {cur.rowcount:,}건 "
                  f"— load_products.py를 다시 돌려야 한다")
        conn.commit()

        cur.execute("SELECT count(*) FROM ingredients")
        n_ing = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM ingredient_aliases")
        n_alias = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM ingredient_aliases WHERE is_ambiguous")
        n_amb = cur.fetchone()[0]

    bump_cache_version()
    print(f"\n완료 — ingredients {n_ing:,}행 / ingredient_aliases {n_alias:,}행 "
          f"(모호 {n_amb:,})")


if __name__ == "__main__":
    main()
