#!/usr/bin/env python3
"""판매자 오타 → 협회 표준명 후보 뽑기 (Task 3)

    python scripts/find_typo_aliases.py                    # 검토용 CSV 생성
    python scripts/find_typo_aliases.py --threshold 0.7
    python scripts/find_typo_aliases.py --dry-run          # 출력만

**DB를 바꾸지 않는다.** 결과를 CSV로 내고, 사람이 검토해 확정한 것만
seed_ingredients.py가 별칭으로 적재한다.

왜 문자열 유사도인가
--------------------
파싱 실패는 파서로 고쳤고, 남은 의심 성분의 절반쯤은 판매자가 잘못 적은
오타다.

    1,2-헥신다이올      ← 헥산
    포타슙하이드록사이드   ← 포타슘
    카퍼트라이펩사이드-1  ← 펩타이드
    자이리톨            ← 자일리톨

한 글자씩 어긋난 것이라 규칙으로는 손댈 수 없다. 다만 **정답지가 있다** —
협회 표준화명칭 21,910종이다. pg_trgm이 이미 설치돼 있어 최근접 매칭을
바로 돌릴 수 있다.

LLM보다 이쪽이 나은 이유는 후보가 반드시 실재하는 성분이기 때문이다.
LLM은 사전을 모르는 채 추측해서 없는 성분명을 지어낼 수 있고, 성분 사전은
유사도의 근간이라 그게 들어가면 조용히 결과가 틀어진다.

기준을 0.6으로 잡은 근거
------------------------
구간별로 표본을 열어 확인했다.

    0.8 이상   하이픈·슬래시 차이. 정확
    0.6~0.8    진짜 오타. 정확
      포타슘미리스토일하이드콜라이즈드콜라겐 → …하이드롤라이즈드…
      카퍼트라이펩사이드-1              → 카퍼트라이펩타이드-1
    0.6 미만   오답이 섞인다. 쓸 수 없다
      하이드롤라이즈드레시틴 → 하이드롤라이즈드콩   ← 다른 성분이다
      포타슘글루코오스     → 포타슘글루코네이트     ← 의심스럽다
"""
from __future__ import annotations

import argparse
import csv
import difflib
import sys
from pathlib import Path

import psycopg2

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "backend"))

from app.config import settings  # noqa: E402

OUT_CSV = REPO / "data/seed/ingredient_typo_fixes.csv"
FIELDS = ["alias", "std_ko", "score", "df", "verdict", "reason"]


def judge(alias: str, std: str) -> tuple[str, str]:
    """(verdict, reason). 자동으로 정할 수 없으면 verdict를 비워 둔다.

    유사도만으로는 '오타'와 '다른 성분'을 구별할 수 없다. 실제로 0.88짜리
    `소듐아크릴레이트크로스폴리머 → …크로스폴리머-2`는 서로 다른 성분이다.
    편집 형태를 함께 봐야 한다.
    """
    std = std.lower()
    if std in alias and len(alias) > len(std):
        # 표준명에 잔해가 덧붙은 형태. '6-다이소듐이디티에이' · '…콜라겐+표시'
        return "ok", "표준명에 잔해가 붙음"
    if alias in std and len(alias) < len(std):
        # 짧은 쪽이 별개 성분일 수 있다. '…크로스폴리머'와 '…크로스폴리머-2'는
        # 다른 성분이고, '솔비탄세스퀴올리에이'는 그냥 잘린 것이다. 구별 불가.
        return "", "표준명의 일부 — 다른 성분일 수 있어 확인 필요"

    matcher = difflib.SequenceMatcher(None, alias, std)
    edits = [op for op in matcher.get_opcodes() if op[0] != "equal"]
    if abs(len(alias) - len(std)) <= 1 and len(edits) <= 2:
        return "ok", "1~2글자 차이"
    return "", "차이가 커 확인 필요"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--threshold", type=float, default=0.6)
    ap.add_argument("--dry-run", action="store_true", help="CSV를 쓰지 않는다")
    ap.add_argument("--out", type=Path, default=OUT_CSV)
    args = ap.parse_args()

    conn = psycopg2.connect(settings.DATABASE_DSN)
    cur = conn.cursor()

    # 대상: 단일제품에 쓰이면서 협회 사전에 없는 성분.
    # DF를 제한하지 않는다 — 오타는 DF=1이 대부분이지만, 같은 오타를 여러
    # 제품이 반복하는 경우도 있다.
    cur.execute(
        """
        SELECT i.id, i.norm_name, count(DISTINCT pi.product_id) AS df
          FROM ingredients i
          JOIN product_ingredients pi ON pi.ingredient_id = i.id
          JOIN products p ON p.id = pi.product_id AND p.composition = 'single'
         WHERE i.code IS NULL
         GROUP BY 1, 2
         ORDER BY 3 DESC, 2
        """
    )
    targets = cur.fetchall()
    print(f"사전 미등록 성분 {len(targets):,}종 · 기준 유사도 {args.threshold}")

    cur.execute("SET pg_trgm.similarity_threshold = %s", (args.threshold,))
    rows: list[dict] = []
    for _, name, df in targets:
        # '%' 연산자가 위 threshold를 쓴다. 인덱스(gin_trgm_ops)가 받는다.
        cur.execute(
            """SELECT norm_name, name_ko, similarity(norm_name, %s) AS s
                 FROM ingredients
                WHERE code IS NOT NULL AND norm_name %% %s
                ORDER BY s DESC, length(norm_name)
                LIMIT 1""",
            (name, name),
        )
        hit = cur.fetchone()
        if not hit:
            continue
        std_norm, std_ko, score = hit
        if std_norm == name:
            continue                       # 이미 같은 키다
        verdict, reason = judge(name, std_ko)
        rows.append({
            "alias": name,
            "std_ko": std_ko,
            "score": f"{float(score):.3f}",
            "df": df,
            "verdict": verdict,            # ok면 적재. 빈 값은 검토 대기
            "reason": reason,
        })
    conn.close()

    print(f"후보를 찾은 것 {len(rows):,}종 ({len(rows) / len(targets) * 100:.1f}%)\n")

    buckets = {"0.9+": 0, "0.8~0.9": 0, "0.7~0.8": 0, "0.6~0.7": 0}
    for r in rows:
        s = float(r["score"])
        key = ("0.9+" if s >= 0.9 else "0.8~0.9" if s >= 0.8
               else "0.7~0.8" if s >= 0.7 else "0.6~0.7")
        buckets[key] += 1
    for k, n in buckets.items():
        print(f"  유사도 {k:<9}{n:>5}종")

    import collections
    print()
    for reason, n in collections.Counter(r["reason"] for r in rows).most_common():
        mark = "적재" if any(r["verdict"] == "ok" for r in rows if r["reason"] == reason) else "보류"
        print(f"  [{mark}] {reason:<34}{n:>4}종")
    auto = sum(1 for r in rows if r["verdict"] == "ok")
    print(f"\n  자동 판정 {auto}종 · 검토 대기 {len(rows) - auto}종")

    if args.dry_run:
        print("\n--dry-run — CSV를 쓰지 않았습니다")
        return

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(sorted(rows, key=lambda x: -float(x["score"])))
    print(f"\n→ {args.out.relative_to(REPO)} ({len(rows):,}행)")
    print("verdict 열에 ok/no를 채운 뒤 seed_ingredients.py를 돌리면 반영된다.")


if __name__ == "__main__":
    main()
