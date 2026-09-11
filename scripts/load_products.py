#!/usr/bin/env python3
"""제품 적재 — 올리브영 크롤링 CSV → products / brands / categories / product_ingredients

    python scripts/load_products.py [--csv 경로]

멱등하다(goods_no 기준 upsert). 선행 조건: scripts/seed_ingredients.py

입력 CSV 컬럼 (crawling/utils.py의 HEADER)
    카테고리, 브랜드, 상품명, 가격(원), 평점, 리뷰수, 화장품성분,
    사용기한, 내용량, 제조국, 제조사, 이미지파일명, 이미지URL, 상품URL, 수집일시

성분 해석 순서
    1) normalize()      → ingredients.norm_name
    2) 별칭 조회        → ingredient_aliases (is_ambiguous 제외)
    3) normalize_loose() → 괄호까지 제거 후 재시도
    4) 실패 시 ingredients에 신규 등록 (code=NULL)
  → 어떤 경우에도 성분을 버리지 않는다.
"""
from __future__ import annotations

import argparse
import collections
import csv
import gzip
import re
import sys
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_values

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "backend"))

from app.config import settings  # noqa: E402
from app.utils.composition import classify  # noqa: E402
from app.utils.ingredients import (  # noqa: E402
    normalize,
    normalize_loose,
    parse_ingredients,
)


def bump_cache_version() -> None:
    """products:cache_version INCR — best-effort.

    실패해도 스크립트 자체는 성공으로 끝나야 한다(캐시는 가속기일 뿐,
    적재 성공 여부와 무관하다).
    """
    try:
        import redis
        r = redis.Redis.from_url(
            settings.REDIS_URL, socket_connect_timeout=0.5, socket_timeout=0.5,
        )
        print(f"캐시 버전 갱신 → v{r.incr('products:cache_version')}")
    except Exception as exc:  # noqa: BLE001
        print(f"캐시 버전 갱신 실패(무시): {exc}")

DEFAULT_CSV = REPO / "data/raw/oliveyoung_products.csv"

# 'N종 택1' 기획세트는 호수별 전성분을 한 셀에 이어 붙여 최대 1,978개까지 나온다.
# 이런 행은 '모든 성분을 가진 제품'이 되어 무엇과도 유사해지므로 유사도 계산에서
# 걸러야 하는데, 그 판단은 적재가 아니라 유사도 배치(Task 3)의 몫으로 둔다.
#
# 적재 단계에서 자르지 않는 이유: 100개 임계로 4,478건 중 368건(8.2%)이 잘리는데
# 그 구간에 'VDL 커버 스테인 파운데이션 30ml'(105개) 같은 단일 제품이 섞여 있다.
# 한 번 버린 데이터는 되살릴 수 없으므로 원본을 그대로 두고,
# 소비 측에서 아래 기준으로 제외하는 편이 안전하다.
#
#     WHERE (SELECT count(*) FROM product_ingredients
#            WHERE product_id = p.id) <= 100
#
# 참고 분포(4,478건): 중앙 38 · 90퍼센타일 87 · 95퍼센타일 142 · 최대 1,978
SIMILARITY_SAFE_MAX = 100   # 통계 표시용 기준값 (적재를 막지는 않는다)

# 적재 대상 카테고리. 화이트리스트로 둔 이유는 재수집 때 새 카테고리가
# 조용히 섞여 들어오는 것을 막기 위해서다.
#
# 이 서비스의 축은 '얼굴 피부타입 진단 → 성분이 비슷한 대체품'이다.
# 진단 5개 축이 전부 얼굴 기준이라, 추천 대상도 얼굴용으로 맞춘다.
#
# 뺀 카테고리와 이유:
#   이너뷰티·향수/디퓨저 — 성분 기반 추천이 구조적으로 불가능. 먹는 제품과
#     향료 제품은 전성분 표기 대상이 아니거나 표기 방식이 달라, 수집된
#     60건 중 39건(65%)·48건 중 24건(50%)에 성분이 아예 없다.
#   남성케어(50건) · 헤어케어(75건) · 바디케어(72건) — 성분은 온전하나
#     비교군이 얇다. 브랜드가 41~45개로 흩어져 제품당 브랜드 2개꼴이라
#     의미 있는 성분 교집합이 생기지 않는다. 헤어·바디는 얼굴 진단 결과와
#     연결할 근거도 없다.
#   메이크업(87건) — 위 이유에 더해 데이터가 오염돼 있다. 'N종 택1'
#     기획세트가 호수별 전성분을 한 셀에 이어 붙여 원본 평균 성분이 373개다
#     (전체 평균 42). 호수 정보를 수집할 수 있게 되면 복원 후보.
#
# CSV 원본은 그대로 두므로 이 집합에 다시 추가하면 언제든 복구된다.
ALLOWED_CATEGORIES = {"스킨케어", "마스크팩", "클렌징", "선케어"}

# ── 복수 카테고리 등재 제품의 소속 결정 ───────────────────────────
#
# 같은 goods_no가 여러 카테고리에 등재된 제품이 28건 있다. 클렌징오일처럼
# 올리브영이 실제로 양쪽에 노출하는 제품들이다. 그냥 두면 CSV에서 마지막에
# 온 행이 이기므로 수집 순서에 따라 소속이 달라진다.
#
# 이때만 제품명으로 판정한다. 후보가 하나뿐인 나머지 4,122건은 크롤링
# 카테고리를 그대로 쓴다. 전수 비교 결과 제품명 키워드와 크롤링 카테고리는
# 96.4% 일치하므로(판정 3,766건 중 3,630건), 크롤링 쪽이 이미 충분히
# 정확하다. 전면 교체하면 '패드'처럼 이름만으로 가릴 수 없는 것들
# (토너패드=스킨케어 / 각질패드=클렌징)을 오히려 망가뜨린다.
#
# 후보가 2개일 때는 반대로 제품명이 훨씬 낫다. 28건 중 26건이 키워드로
# 갈리고, '클렌징폼'과 '토너'가 같은 후보쌍에서 정반대로 판정되기 때문에
# 고정 우선순위만으로는 절반이 틀린다.

# 증정품·기획 문구를 떼고 본품 이름만 남긴다.
# '에스트라 리페어 크림 (+마스크 2매)' → '에스트라 리페어 크림'
# 이걸 안 하면 증정품 '마스크'에 걸려 마스크팩이 된다.
_BRAND_PAREN = re.compile(r"^(\S+)\([A-Za-z][A-Za-z0-9&.\s]*\)")  # 차앤박(CNP) …
_PROMO_PRE = re.compile(r"^\s*\[[^\]]*\]\s*")                     # [7월 올영픽] …
_NAME_TAIL = re.compile(
    r"[(\[].*$|\s*\+.*$|\s*(?:기획|단품|리필|증정|택1|골라담기|본품|세트)\b.*$"
)
_NAME_VOLUME = re.compile(r"\s*\d+(?:\.\d+)?\s*(?:ml|g|매|입|ea|호|종|kg|l)\b.*$", re.I)

# 구체적인 카테고리부터 검사한다. 선케어를 맨 앞에 두는 이유는
# '아넷사 퍼펙트 UV 선스크린 스킨케어 밀크'처럼 제형어(스킨·밀크)가
# 뒤에 붙는 제품이 많아서다. 기능어가 제형어를 이겨야 한다.
_CATEGORY_KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    ("선케어", ("선스크린", "선크림", "선스틱", "선쿠션", "선젤", "선세럼", "선밤",
              "선스프레이", "선케어", "선블록", "선로션", "선에센스", "선밀크",
              "선앰플", "선팩트", "썬스크린", "썬크림", "썬스틱", "썬쿠션",
              "썬블록", "자외선", "uv ", "spf")),
    ("마스크팩", ("마스크팩", "시트마스크", "시트팩", "마스크", "모델링팩",
                "머드팩", "워시오프", "토너패드", "패드")),
    ("클렌징", ("클렌징", "클렌저", "클린징", "페이셜폼", "폼클", "워시", "리무버",
              "필링", "스크럽", "고마쥬", "버블폼", "세안", "클렌")),
    ("스킨케어", ("토너", "스킨", "로션", "크림", "세럼", "앰플", "에센스", "미스트",
                "에멀전", "에멀젼", "부스터", "원액", "스팟", "드롭", "트리트먼트",
                "올인원", "스쿠알란", "젤", "오일", "밤", "스프레이", "솔루션",
                "리퀴드", "패치")),
]

# 키워드가 하나도 안 걸릴 때의 폴백. 구체적인 것이 이긴다.
# 스킨케어는 전체의 절반을 차지하는 사실상의 기타 항목이라 항상 진다.
_CATEGORY_PRIORITY = ("선케어", "클렌징", "마스크팩", "스킨케어")


def core_name(name: str) -> str:
    """제품명에서 본품 이름만 남긴다."""
    s = name
    while True:
        stripped = _PROMO_PRE.sub("", s)
        if stripped == s:
            break
        s = stripped
    s = _BRAND_PAREN.sub(r"\1", s)   # 브랜드 영문 괄호는 잘라내지 않는다
    s = _NAME_TAIL.sub("", s)
    s = _NAME_VOLUME.sub("", s)
    return s.strip()


def resolve_category(name: str, candidates: set[str]) -> str:
    """복수 후보 중 하나를 고른다. 후보가 하나면 그대로 반환."""
    if len(candidates) == 1:
        return next(iter(candidates))
    lowered = core_name(name).lower()
    for cat, keywords in _CATEGORY_KEYWORDS:
        if cat in candidates and any(k in lowered for k in keywords):
            return cat
    for cat in _CATEGORY_PRIORITY:
        if cat in candidates:
            return cat
    return next(iter(candidates))

# 성분 칸에 성분 대신 안내문구가 적힌 경우. 판매자가 상품정보제공고시 표에
# 그렇게 입력한 것이라 재수집해도 같은 값이 나온다.
#
#     '상세페이지 참조' · '상품 상세페이지 참고.' · '■ 제품 상세페이지 참조'
#
# 성분이 딱 하나로 파싱될 때만 적용한다. 정상 단일성분 제품
# ('아벤느 온천수(아쿠아)', '로즈힙씨오일(100%)')을 잘못 걸러내지 않기 위해서다.
_PLACEHOLDER = re.compile(r"상세\s*페이지|상품\s*상세|별도\s*표기|해당\s*없음|^\s*없음\s*$")

_GOODS_NO = re.compile(r"goodsNo=([A-Za-z0-9]+)")


# 성분 하나로 접힌 파싱 잔해. 사전에도 별칭에도 없는 이름에만 적용하므로
# (아래 resolve()의 신규 등록 직전), 실재 성분을 지울 여지가 구조적으로 없다.
#
#   1) 구분자 잔류    '향료■파파레서피…클렌저50g옥수수전분'
#   2) 40자 초과      전성분 한 줄이 통째로 한 토큰이 된 것. 진짜 INCI명은
#                    최장 26자다 (c30-45알킬다이메틸실릴폴리프로필실세스퀴옥세인)
#   3) 성분 둘 붙음   '참마뿌리추출물슈도알테로모나스발효추출물'
#                    구분자 없이 '추출물'·'정제수'가 두 번 나오면 접합이다.
#                    협회 사전 22,498종에 이 꼴은 0건이라 오탐이 없다
#
# 쪼개서 살리지 않는 이유: 구분자가 없어 경계를 알 수 없다. 23,000종 사전으로
# 최장일치를 돌리면 '정제수'가 긴 이름 안쪽에서도 걸려 멀쩡한 성분이 갈린다.
# 가짜 성분 하나는 DF=1로 남아 IDF를 최대로 받으므로, 두는 쪽이 더 해롭다.
_RESIDUE_MARK = re.compile(r"[@■<>\[\]]")
_RESIDUE_GLUE = re.compile(r"^[^,/()\[\]]{12,}(?:정제수|추출물)$")


def is_residue(key: str) -> bool:
    """신규 등록 직전 마지막 관문. True면 그 토큰을 통째로 버린다."""
    if _RESIDUE_MARK.search(key) or len(key) > 40:
        return True
    return bool(_RESIDUE_GLUE.match(key)) and (
        key.count("추출물") + key.count("정제수")
    ) >= 2


def is_unusable(parts: list[str]) -> bool:
    """전성분을 얻을 수 없는 제품인지 판단.

    성분이 없으면 대체품 추천 자체가 불가능하다. 기기·브러시·패치처럼
    애초에 화장품이 아닌 것과, 판매자가 성분 대신 안내문구를 넣은 것이
    여기 걸린다.
    """
    if not parts:
        return True
    # 정규화하면 아무것도 안 남는 경우. '■상세페이지 참조'처럼 파서가 안내문구를
    # 이미 걷어내 여기서는 기호만 보이는 상황이 있어, 원문 패턴만 보면 놓친다.
    if not any(normalize(p) for p in parts):
        return True
    return len(parts) == 1 and bool(_PLACEHOLDER.search(parts[0]))


def to_int(s: str) -> int | None:
    s = re.sub(r"[^\d]", "", s or "")
    return int(s) if s else None


def to_float(s: str) -> float | None:
    s = (s or "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def read_rows(path: Path) -> list[dict]:
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", type=Path, default=DEFAULT_CSV)
    args = ap.parse_args()

    if not args.csv.exists():
        # 예전 .gz를 들고 있는 사람도 그대로 돌아가게 한다 (read_rows가 둘 다 읽는다).
        legacy = args.csv.with_suffix(args.csv.suffix + ".gz")
        if not legacy.exists():
            sys.exit(f"CSV가 없습니다: {args.csv}")
        args.csv = legacy

    rows = read_rows(args.csv)
    print(f"CSV {len(rows):,}행")

    # ── goods_no 기준 dedup ─────────────────────────────────────
    # 제품 정보는 뒤에 온 행이 최신이므로 그대로 덮어쓴다.
    # 카테고리만은 등재된 후보를 전부 모아 resolve_category()로 정한다.
    # 그냥 덮어쓰면 복수 등재 제품의 소속이 CSV 수집 순서에 좌우된다.
    by_goods: dict[str, dict] = {}
    cats_seen: dict[str, set[str]] = {}
    no_goods_no = excluded = 0
    for r in rows:
        cat = (r.get("카테고리") or "").strip()
        if cat not in ALLOWED_CATEGORIES:
            excluded += 1
            continue
        m = _GOODS_NO.search(r.get("상품URL", "") or "")
        if not m:
            no_goods_no += 1
            continue
        goods_no = m.group(1)
        by_goods[goods_no] = r
        cats_seen.setdefault(goods_no, set()).add(cat)

    multi = resolved = 0
    for goods_no, cands in cats_seen.items():
        if len(cands) == 1:
            continue
        multi += 1
        row = by_goods[goods_no]
        chosen = resolve_category(row.get("상품명", ""), cands)
        if chosen != (row.get("카테고리") or "").strip():
            resolved += 1
        row["카테고리"] = chosen

    dup = len(rows) - len(by_goods) - no_goods_no - excluded
    print(f"고유 제품 {len(by_goods):,}건 "
          f"(중복 {dup:,} / URL없음 {no_goods_no} / 제외 카테고리 {excluded:,})")
    print(f"복수 카테고리 등재 {multi}건 — 제품명으로 결정 (소속 변경 {resolved}건)")

    conn = psycopg2.connect(settings.DATABASE_DSN)
    cur = conn.cursor()

    # ── 잔해 성분 정리 ───────────────────────────────────────────
    # 예전 적재로 이미 등록된 잔해는 아래 resolve()의 신규 등록 경로를 타지
    # 않는다 — 사전 조회에서 바로 잡히기 때문이다. 사전을 읽기 전에 지워야
    # is_residue()가 실제로 걸린다. FK가 CASCADE라 연결·유사도도 함께 정리된다.
    cur.execute("SELECT id, norm_name FROM ingredients WHERE code IS NULL")
    junk = [i for i, n in cur.fetchall() if is_residue(n)]
    if junk:
        cur.execute("DELETE FROM ingredients WHERE id = ANY(%s)", (junk,))
        conn.commit()
        print(f"잔해 성분 제거 {len(junk):,}종")

    # ── 성분 사전 선로드 ─────────────────────────────────────────
    # 전성분 구분자가 제품마다 달라(쉼표/공백/@) 파서가 사전을 참고해야 한다.
    cur.execute("SELECT norm_name, id FROM ingredients")
    ing_id = dict(cur.fetchall())
    cur.execute("SELECT alias, ingredient_id FROM ingredient_aliases WHERE NOT is_ambiguous")
    alias_id = dict(cur.fetchall())
    vocab = set(ing_id) | set(alias_id)
    print(f"사전 로드 — 성분 {len(ing_id):,} / 별칭 {len(alias_id):,}")

    # ── 전성분을 얻을 수 없는 제품 제외 ──────────────────────────
    parsed = {g: parse_ingredients(r.get("화장품성분", ""), vocab)
              for g, r in by_goods.items()}
    unusable = {g for g, p in parsed.items() if is_unusable(p)}
    if unusable:
        for g in unusable:
            del by_goods[g], parsed[g]
        print(f"성분 없음으로 제외 {len(unusable):,}건 → 적재 대상 {len(by_goods):,}건")

        # 이번에 제외된 제품이 예전 적재로 DB에 남아 있으면 지운다. upsert만
        # 하면 성분 0개인 제품이 영영 남아, 파서를 고쳐 제외 대상이 늘어도
        # 반영되지 않는다. FK가 CASCADE라 연결·유사도도 함께 정리된다.
        cur.execute("DELETE FROM products WHERE goods_no = ANY(%s)", (list(unusable),))
        if cur.rowcount:
            print(f"  그중 {cur.rowcount:,}건은 예전 적재분이라 DB에서 제거했다")
        conn.commit()

    # ── 브랜드 · 카테고리 ────────────────────────────────────────
    brands = sorted({(r.get("브랜드") or "").strip() for r in by_goods.values()} - {""})
    cats = sorted({(r.get("카테고리") or "").strip() for r in by_goods.values()} - {""})

    execute_values(cur,
        "INSERT INTO brands (name) VALUES %s ON CONFLICT (name) DO NOTHING",
        [(b,) for b in brands], page_size=500)
    execute_values(cur,
        "INSERT INTO categories (code, label) VALUES %s ON CONFLICT (code) DO NOTHING",
        [(c, c) for c in cats], page_size=500)
    conn.commit()

    cur.execute("SELECT name, id FROM brands")
    brand_id = dict(cur.fetchall())
    cur.execute("SELECT code, id FROM categories")
    cat_id = dict(cur.fetchall())
    print(f"브랜드 {len(brand_id):,} / 카테고리 {len(cat_id)}")

    # ── 제품 ─────────────────────────────────────────────────────
    product_rows = []
    for gno, r in by_goods.items():
        # 원본 문자열 기준 성분 개수(중복 포함). product_ingredients 행수는
        # 제품 내 중복을 제거하므로 이 값과 다를 수 있다.
        raw_count = len(parsed[gno])
        # 제품 구성. v5 정제본이면 처리메모·증정기획_정리·상품명_원본으로
        # 정확히 판정되고, 구 CSV면 상품명만으로 판정한다(.get이 None을 낸다).
        # v5는 정제명을 `상품명`에, 원본을 `상품명_원본`에 둔다. 구 CSV에는
        # `상품명` 하나뿐이고 그게 원본이라 display_name은 비워둔다.
        raw_name = (r.get("상품명_원본") or r.get("상품명") or "").strip()
        display_name = (r.get("상품명") or "").strip() if r.get("상품명_원본") else None
        composition = classify(
            raw_name,
            r.get("처리메모"),
            r.get("증정기획_정리"),
            r.get("내용량_원본"),
        )
        product_rows.append((
            gno,
            raw_name,
            brand_id.get((r.get("브랜드") or "").strip()),
            cat_id.get((r.get("카테고리") or "").strip()),
            to_int(r.get("가격(원)", "")),
            to_float(r.get("평점", "")),
            to_int(r.get("리뷰수", "")),
            (r.get("이미지URL") or "").strip() or None,
            (r.get("상품URL") or "").strip() or None,
            (r.get("내용량") or "").strip() or None,
            (r.get("제조국") or "").strip() or None,
            (r.get("제조사") or "").strip() or None,
            (r.get("사용기한") or "").strip() or None,
            raw_count,
            composition,
            display_name,
        ))

    execute_values(cur, """
        INSERT INTO products
            (goods_no, name, brand_id, category_id, price, rating, review_count,
             image_url, product_url, volume, country, manufacturer, expiry,
             ingredient_count_raw, composition, display_name)
        VALUES %s
        ON CONFLICT (goods_no) DO UPDATE SET
            name = EXCLUDED.name, brand_id = EXCLUDED.brand_id,
            category_id = EXCLUDED.category_id, price = EXCLUDED.price,
            rating = EXCLUDED.rating, review_count = EXCLUDED.review_count,
            image_url = EXCLUDED.image_url, product_url = EXCLUDED.product_url,
            volume = EXCLUDED.volume, country = EXCLUDED.country,
            manufacturer = EXCLUDED.manufacturer, expiry = EXCLUDED.expiry,
            ingredient_count_raw = EXCLUDED.ingredient_count_raw,
            composition = EXCLUDED.composition,
            -- 구 CSV로 돌리면 EXCLUDED.display_name이 NULL이라, 이미 채워둔
            -- 정제명을 지우지 않도록 COALESCE로 보존한다.
            display_name = COALESCE(EXCLUDED.display_name, products.display_name),
            updated_at = now()
    """, product_rows, page_size=500)
    conn.commit()

    cur.execute("SELECT goods_no, id FROM products")
    pid_of = dict(cur.fetchall())
    print(f"제품 적재 {len(pid_of):,}건")

    # ── 성분 해석 ────────────────────────────────────────────────
    stat = {"direct": 0, "alias": 0, "loose": 0, "new": 0, "residue": 0}
    pending_new: dict[str, str] = {}   # normalized → 원문

    def resolve(raw: str) -> str | None:
        """성분 원문 → norm_name (신규는 pending_new에 적재)"""
        key = normalize(raw)
        if not key:
            return None
        if key in ing_id:
            stat["direct"] += 1
            return key
        if key in alias_id:
            stat["alias"] += 1
            return key
        loose = normalize_loose(raw)
        if loose and loose in ing_id:
            stat["loose"] += 1
            return loose
        if is_residue(key):
            stat["residue"] += 1
            return None
        if key not in pending_new:
            pending_new[key] = raw.strip()
            stat["new"] += 1
        return key

    links: list[tuple[str, str, int, str]] = []  # (goods_no, key, position, raw)
    over_threshold = 0
    for gno in by_goods:
        parts = parsed[gno]
        if len(parts) > SIMILARITY_SAFE_MAX:
            over_threshold += 1   # 적재는 하되 집계만 남긴다
        seen: set[str] = set()
        pos = 0
        for raw in parts:
            key = resolve(raw)
            if not key or key in seen:
                continue      # 같은 제품 안의 중복 성분은 첫 등장만
            seen.add(key)
            pos += 1
            links.append((gno, key, pos, raw.strip()))

    print(f"성분 해석 — 사전직결 {stat['direct']:,} / 별칭 {stat['alias']:,} / "
          f"완화 {stat['loose']:,} / 신규 {stat['new']:,} / 잔해버림 {stat['residue']:,}")
    print(f"성분 {SIMILARITY_SAFE_MAX}개 초과 {over_threshold}건 "
          f"(적재는 하되 유사도 계산에서 제외 권장)")

    # 사전에 없던 성분 등록
    if pending_new:
        execute_values(cur,
            """INSERT INTO ingredients (norm_name, name_ko)
               VALUES %s ON CONFLICT (norm_name) DO NOTHING""",
            [(k, v) for k, v in pending_new.items()], page_size=1000)
        conn.commit()
        cur.execute("SELECT norm_name, id FROM ingredients")
        ing_id = dict(cur.fetchall())

    # ── product_ingredients ──────────────────────────────────────
    def to_ingredient_id(key: str) -> int | None:
        return ing_id.get(key) or alias_id.get(key)

    # position은 여기서 다시 매긴다. 위에서 붙인 번호를 그대로 쓰면, 성분
    # id를 못 찾아 건너뛴 자리만큼 빈틈이 생겨 '1부터 연속'이라는 계약이
    # 깨진다. 상대 순서는 links의 순서가 이미 보존하고 있다.
    pi_rows = []
    pos_of: dict[str, int] = collections.defaultdict(int)
    placed: set[tuple[int, int]] = set()
    for gno, key, _, raw in links:
        pid, iid = pid_of.get(gno), to_ingredient_id(key)
        if not (pid and iid) or (pid, iid) in placed:
            # 앞의 seen은 key 기준이라, 별칭을 거쳐 같은 성분 id로 모이는
            # 두 표기를 못 막는다. DB의 ON CONFLICT가 뒤엣것을 버리는데
            # 번호는 이미 올라가 자리가 빈다 — 여기서 걸러야 한다.
            continue
        placed.add((pid, iid))
        pos_of[gno] += 1
        pi_rows.append((pid, iid, pos_of[gno], raw))

    cur.execute("DELETE FROM product_ingredients WHERE product_id = ANY(%s)",
                (list(pid_of.values()),))
    execute_values(cur,
        """INSERT INTO product_ingredients (product_id, ingredient_id, position, raw_name)
           VALUES %s ON CONFLICT (product_id, ingredient_id) DO NOTHING""",
        pi_rows, page_size=5000)
    conn.commit()

    for t in ("products", "product_ingredients", "brands", "categories", "ingredients"):
        cur.execute(f"SELECT count(*) FROM {t}")
        print(f"  {t:22s} {cur.fetchone()[0]:>9,}")

    cur.close()
    conn.close()
    bump_cache_version()
    print("\n완료")


if __name__ == "__main__":
    main()
