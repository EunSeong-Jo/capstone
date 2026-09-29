#!/usr/bin/env python3
"""피부타입 성분 분류 시드 — tags / ingredient_tags / skin_type_rules (Task 14)

    python scripts/seed_skin_type_tags.py --dry-run   # 집계만 출력
    python scripts/seed_skin_type_tags.py            # 실제 적재

멱등하다. 같은 CSV로 여러 번 돌려도 결과가 같다.

입력
  data/seed/skin_type_ingredients/criteria.csv            정본 (PR #36 원본 그대로)
  data/seed/skin_type_ingredients/criteria_overrides.csv  키워드 철자 교정
  data/seed/skin_type_ingredients/tag_map.csv             타입 → 추천 태그 · 캐릭터 ID
  data/seed/skin_type_ingredients/exclusion_criteria.csv  기피 태그 정의 (출처 포함)
  data/seed/skin_type_ingredients/skin_type_exclusions.csv 타입 → 기피 태그

왜 타입별 CSV를 읽지 않는가
---------------------------
PR #36의 타입별 CSV 8개는 성분 25,923건 시절의 스냅샷이다. 그 뒤 파서 보강과
오타 병합으로 지금은 23,634건이고, id 기준 일치율이 74%(2,815/3,223)까지
떨어졌다 — **id가 이미 다른 성분을 가리킨다.**

그래서 결과 스냅샷 대신 정본인 `criteria.csv`의 키워드로 현재 DB를 다시
조회한다. 성분이 바뀔 때마다 재실행으로 따라간다.

태깅 대상을 좁히는 이유
-----------------------
성분 마스터 23,634종 중 80.6%는 어떤 제품에도 등장하지 않는 협회 사전 어휘다.
`ingredient_tags`는 '이 제품의 성분 중 태그 X가 몇 개인가'를 세는 데 쓰이므로
안 쓰이는 성분에 태그를 붙여도 조인되지 않는다. 숫자만 부풀 뿐이다
('펩타이드'는 마스터 1,517종 중 제품에 쓰이는 게 137종뿐이다).
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_values

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "backend"))

from app.config import settings  # noqa: E402

SEED = REPO / "data/seed/skin_type_ingredients"
CRITERIA_CSV = SEED / "criteria.csv"
OVERRIDES_CSV = SEED / "criteria_overrides.csv"
TAG_MAP_CSV = SEED / "tag_map.csv"
EXCLUSION_CSV = SEED / "exclusion_criteria.csv"
TYPE_EXCLUSION_CSV = SEED / "skin_type_exclusions.csv"


def bump_cache_version() -> None:
    """products:cache_version INCR — best-effort.

    지금은 태그가 조회 응답에 나가지 않아 실질 영향이 없지만, Task 14에서
    추천이 태그를 태우기 시작하면 필요해진다. 실패해도 성공으로 끝난다.
    """
    try:
        import redis
        r = redis.Redis.from_url(
            settings.REDIS_URL, socket_connect_timeout=0.5, socket_timeout=0.5,
        )
        print(f"캐시 버전 갱신 → v{r.incr('products:cache_version')}")
    except Exception as exc:  # noqa: BLE001
        print(f"캐시 버전 갱신 실패(무시): {exc}")


def read_tag_map() -> list[dict]:
    with open(TAG_MAP_CSV, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def read_exclusions() -> tuple[list[dict], dict[str, list[str]]]:
    """기피 태그 정의와 타입별 배정.

    추천 태그(criteria.csv)와 달리 **이름이 정확히 일치할 때만** 붙인다.
    부분 일치로 '알코올'을 찾으면 세틸알코올·세테아릴알코올 같은
    고급지방알코올까지 걸리는데, 그건 오히려 보습제다.
    """
    with open(EXCLUSION_CSV, newline="", encoding="utf-8-sig") as f:
        defs = list(csv.DictReader(f))
    by_type: dict[str, list[str]] = defaultdict(list)
    with open(TYPE_EXCLUSION_CSV, newline="", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            by_type[r["skin_type_id"].strip()].append(r["tag_code"].strip())
    known = {d["tag_code"] for d in defs}
    for stype, codes in by_type.items():
        for c in codes:
            if c not in known:
                sys.exit(f"skin_type_exclusions.csv의 '{c}'가 exclusion_criteria.csv에 없습니다")
    return defs, dict(by_type)


def collect_exclusions(cur, defs: list[dict]) -> tuple[dict[str, set[int]], list[str]]:
    """태그 코드 → 성분 id. 추천 태그와 같은 범위(단일제품 사용분)만 본다."""
    by_tag: dict[str, set[int]] = {}
    missing: list[str] = []
    for d in defs:
        names = [n.strip().lower() for n in d["매칭 성분"].split(",") if n.strip()]
        cur.execute(
            """SELECT DISTINCT i.id, i.norm_name
                 FROM ingredients i
                 JOIN product_ingredients pi ON pi.ingredient_id = i.id
                 JOIN products p ON p.id = pi.product_id
                WHERE p.composition = 'single' AND i.norm_name = ANY(%s)""",
            (names,),
        )
        hits = cur.fetchall()
        by_tag[d["tag_code"]] = {i for i, _ in hits}
        found = {n for _, n in hits}
        missing += [f"{d['tag_code']} / {n}" for n in names if n not in found]
    return by_tag, missing


def read_overrides() -> dict[str, str | None]:
    """원본 키워드 → 교체 키워드. 빈 값이면 그 키워드를 버린다."""
    with open(OVERRIDES_CSV, newline="", encoding="utf-8-sig") as f:
        return {
            r["원본_키워드"].strip(): (r["교체_키워드"].strip() or None)
            for r in csv.DictReader(f)
        }


def expand(keyword: str, overrides: dict[str, str | None]) -> list[str]:
    """키워드 하나를 ILIKE 패턴 목록으로 편다.

    괄호가 붙은 키워드는 안팎을 각각 별개로 본다 — '토코페롤(비타민E)'을
    그대로 넣으면 0건이지만 '토코페롤'과 '비타민E'는 각각 잡힌다.

    >>> expand("토코페롤(비타민E)", {})
    ['토코페롤', '비타민E']
    >>> expand("레티날", {"레티날": "레틴알"})
    ['레틴알']
    >>> expand("아젤라익애씨드", {"아젤라익애씨드": None})
    []
    """
    head = keyword.split("(")[0].strip()
    parts = [head] + [p.strip() for p in re.findall(r"\(([^)]*)\)", keyword)]
    out = []
    for p in parts:
        if p in overrides:
            p = overrides[p]
        if p:
            out.append(p)
    return out


def collect(
    cur, tag_map: list[dict]
) -> tuple[dict[str, set[int]], list[str], list[str], list[str]]:
    """태그 코드 → 성분 id 집합. 부수적으로 경고 세 종류를 모은다."""
    overrides = read_overrides()
    with open(CRITERIA_CSV, newline="", encoding="utf-8-sig") as f:
        criteria = {r["피부 타입"].strip(): r for r in csv.DictReader(f)}

    by_tag: dict[str, set[int]] = {}
    empty: list[str] = []
    dropped: list[str] = []
    residue: set[str] = set()

    for row in tag_map:
        stype = row["피부타입"]
        if stype not in criteria:
            sys.exit(f"criteria.csv에 '{stype}' 행이 없습니다 — tag_map.csv와 어긋납니다")
        ids: set[int] = set()
        raw = criteria[stype]["매칭 키워드 (ILIKE)"]
        for keyword in (k.strip() for k in raw.split(",")):
            patterns = expand(keyword, overrides)
            if not patterns:
                # criteria_overrides.csv가 교체 없이 비워 둔 키워드다.
                dropped.append(f"{stype} / {keyword}")
                continue
            hits: set[int] = set()
            for pat in patterns:
                # 단일제품에 실제 등장하는 성분만. DISTINCT로 접는다.
                cur.execute(
                    f"""SELECT DISTINCT i.id, i.norm_name
                          FROM ingredients i
                          JOIN product_ingredients pi ON pi.ingredient_id = i.id
                          JOIN products p ON p.id = pi.product_id
                         WHERE p.composition = 'single'
                           AND i.norm_name ILIKE %s""",
                    (f"%{pat}%",),
                )
                for iid, name in cur.fetchall():
                    # 전성분 한 줄이 통째로 한 행이 된 파싱 잔해를 거른다.
                    # 키워드가 그런 행에 걸리면 엉뚱한 태그가 붙는다
                    # ('%트라넥사믹애씨드%'가 성분 56개짜리 문자열을 잡는 식).
                    # 26자짜리 진짜 INCI명이 있어 40자로 끊었다
                    # (예: c30-45알킬다이메틸실릴폴리프로필실세스퀴옥세인).
                    if len(name) > 40 or re.search(r"[@■]", name):
                        residue.add(name)
                    else:
                        hits.add(iid)
            if not hits:
                empty.append(f"{stype} / {keyword}")
            ids |= hits
        by_tag[row["tag_code"]] = ids
    return by_tag, empty, dropped, sorted(residue)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="적재 없이 집계만 출력")
    args = ap.parse_args()

    for path in (CRITERIA_CSV, OVERRIDES_CSV, TAG_MAP_CSV,
                 EXCLUSION_CSV, TYPE_EXCLUSION_CSV):
        if not path.exists():
            sys.exit(f"CSV가 없습니다: {path}")

    tag_map = read_tag_map()
    conn = psycopg2.connect(settings.DATABASE_DSN)
    cur = conn.cursor()

    exclusion_defs, exclude_of = read_exclusions()
    by_tag, empty, dropped, residue = collect(cur, tag_map)
    excl_by_tag, excl_missing = collect_exclusions(cur, exclusion_defs)
    by_tag.update(excl_by_tag)

    print(f"{'tag':<20}{'피부타입':<10}{'성분':>6}")
    for row in tag_map:
        code = row["tag_code"]
        print(f"{code:<20}{row['피부타입']:<10}{len(by_tag[code]):>6}")
    print(f"\n{'기피 tag':<20}{'':<10}{'성분':>6}{'단일제품':>10}")
    for d in exclusion_defs:
        code = d["tag_code"]
        ids = by_tag[code]
        cur.execute(
            """SELECT count(DISTINCT p.id) FROM products p
                 JOIN product_ingredients pi ON pi.product_id = p.id
                WHERE p.composition = 'single' AND pi.ingredient_id = ANY(%s)""",
            (list(ids),),
        )
        print(f"{code:<20}{'':<10}{len(ids):>6}{cur.fetchone()[0]:>10}")

    per_ing: dict[int, set[str]] = defaultdict(set)
    for code, ids in by_tag.items():
        for i in ids:
            per_ing[i].add(code)
    links = sum(len(v) for v in per_ing.values())
    spread = Counter(len(v) for v in per_ing.values())
    print(f"\ningredient_tags {links:,}행 · 성분 {len(per_ing):,}종")
    print("태그 수별: " + " · ".join(f"{k}개 {v}종" for k, v in sorted(spread.items())))

    if residue:
        print(f"\n파싱 잔해로 제외한 이름 {len(residue)}건")
        for name in residue:
            print(f"  {name[:70]}{'…' if len(name) > 70 else ''}")
    if dropped:
        print(f"\ncriteria_overrides.csv가 제외한 키워드 {len(dropped)}건")
        for d in dropped:
            print(f"  {d}")
    if empty:
        print(f"\n한 건도 못 잡은 키워드 {len(empty)}건 — 철자를 확인할 것")
        for e in empty:
            print(f"  {e}")
    if excl_missing:
        print(f"\n기피 성분 중 제품에 안 쓰이거나 이름이 다른 것 {len(excl_missing)}건")
        for m in excl_missing:
            print(f"  {m}")

    if args.dry_run:
        print("\n--dry-run — 적재하지 않았습니다")
        conn.close()
        return

    execute_values(
        cur,
        """INSERT INTO tags (code, label) VALUES %s
           ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label""",
        [(r["tag_code"], r["tag_label"]) for r in tag_map]
        + [(d["tag_code"], d["tag_label"]) for d in exclusion_defs],
    )
    all_codes = [r["tag_code"] for r in tag_map] + [d["tag_code"] for d in exclusion_defs]
    cur.execute("SELECT code, id FROM tags WHERE code = ANY(%s)", (all_codes,))
    tag_id = dict(cur.fetchall())

    # 업서트가 아니라 지우고 다시 넣는다. 키워드에서 빠진 성분이 남으면
    # 태그가 실제 기준보다 넓어지는데, 그건 겉으로 드러나지 않는다.
    cur.execute("DELETE FROM ingredient_tags WHERE tag_id = ANY(%s)", (list(tag_id.values()),))
    removed = cur.rowcount
    execute_values(
        cur,
        "INSERT INTO ingredient_tags (ingredient_id, tag_id) VALUES %s",
        [(i, tag_id[c]) for i, codes in per_ing.items() for c in sorted(codes)],
        page_size=1000,
    )

    execute_values(
        cur,
        """INSERT INTO skin_type_rules (skin_type, include_tags, exclude_tags)
           VALUES %s
           ON CONFLICT (skin_type) DO UPDATE
              SET include_tags = EXCLUDED.include_tags,
                  exclude_tags = EXCLUDED.exclude_tags,
                  updated_at   = now()""",
        # 배정 근거는 skin_type_exclusions.csv의 `근거` 컬럼에 적어 둔다.
        # 기피 태그가 없는 타입은 빈 배열이다 — 지성처럼 알코올이 오히려
        # 선호되는 경우가 있어 일괄 적용하지 않는다.
        [
            (
                r["skin_type_id"],
                json.dumps([r["tag_code"]], ensure_ascii=False),
                json.dumps(exclude_of.get(r["skin_type_id"], []), ensure_ascii=False),
            )
            for r in tag_map
        ],
    )

    # ── ingredients.grade ──────────────────────────────────────────
    # 상세 화면의 성분 칩 색을 정하는 값이다. EWG처럼 외부 등급을 옮겨오는
    # 대신 **이미 적재한 태그에서 도출한다** — 우리가 근거를 댈 수 있는 값만
    # 넣기 위해서다.
    #
    #   warn    기피 태그(착향제·향료·건조 유발 알코올)가 붙은 성분
    #   key     추천 태그(보습·진정·항산화 등)가 붙은 성분
    #   normal  제품에 쓰이지만 어느 쪽으로도 분류되지 않은 성분
    #   NULL    어떤 제품에도 안 쓰이는 협회 사전 어휘 (판단할 이유가 없다)
    #
    # warn이 key보다 우선한다. 리모넨처럼 항산화 문헌이 있으면서 표시 의무
    # 알레르겐인 성분이 있는데, 그런 건 '주의'로 보이는 쪽이 안전하다.
    #
    # ewg_grade는 채우지 않는다. 출처를 검증할 수 없는 숫자를 DB에 넣으면
    # 화면이 근거 없는 안전 등급을 주장하게 된다.
    exclusion_codes = [d["tag_code"] for d in exclusion_defs]
    warn_ids = sorted({i for c in exclusion_codes for i in by_tag.get(c, ())})
    key_ids = sorted(
        {i for r in tag_map for i in by_tag.get(r["tag_code"], ())} - set(warn_ids)
    )

    cur.execute("UPDATE ingredients SET grade = NULL WHERE grade IS NOT NULL")
    cur.execute(
        """UPDATE ingredients SET grade = 'normal'
           WHERE id IN (SELECT DISTINCT ingredient_id FROM product_ingredients)"""
    )
    normal_ids = cur.rowcount
    if key_ids:
        cur.execute("UPDATE ingredients SET grade = 'key' WHERE id = ANY(%s)", (key_ids,))
    if warn_ids:
        cur.execute("UPDATE ingredients SET grade = 'warn' WHERE id = ANY(%s)", (warn_ids,))

    # 알레르기 유발 착향제는 ingredients.is_allergen에도 표시한다. 성분 단위
    # 질의(상세 화면의 '알레르기 주의' 배지 등)가 태그 조인 없이 쓰도록.
    allergen_ids = list(by_tag.get("allergen_fragrance", ()))
    cur.execute("UPDATE ingredients SET is_allergen = false WHERE is_allergen")
    if allergen_ids:
        cur.execute(
            "UPDATE ingredients SET is_allergen = true WHERE id = ANY(%s)", (allergen_ids,)
        )
    conn.commit()

    print(f"\n적재 완료 — ingredient_tags {links:,}행 (이전 {removed:,}행 교체)")
    print(f"           skin_type_rules {len(tag_map)}행 · tags {len(all_codes)}행")
    print(f"           is_allergen 표시 {len(allergen_ids)}종")
    print(
        f"           grade — key {len(key_ids):,} · warn {len(warn_ids):,} · "
        f"normal {normal_ids - len(key_ids) - len(warn_ids):,} (나머지는 NULL)"
    )
    conn.close()
    bump_cache_version()


if __name__ == "__main__":
    main()
