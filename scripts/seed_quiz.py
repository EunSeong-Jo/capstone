#!/usr/bin/env python3
"""피부타입 진단 문항 시드 — quiz_versions / quiz_questions / quiz_options (Task 13.2)

    python scripts/seed_quiz.py --dry-run   # 파싱 결과만 출력
    python scripts/seed_quiz.py             # 실제 적재

멱등하다. 같은 입력으로 여러 번 돌려도 결과가 같다.

원본이 프론트 파일인 이유
-------------------------
문항 문구는 `frontend/src/data/onboarding.ts`에, 선택지별 점수 변화량은
`frontend/src/data/skinTypeScoring.ts`에 있다. 두 파일을 여기서 읽어 DB에
옮긴다.

거꾸로(DB를 원본으로) 가지 않는 이유는 **비회원도 네트워크 없이 진단을
끝낼 수 있어야 하기 때문**이다(PRD의 Soft-gate). 프론트가 문항을 들고 있어야
하고, 그렇다면 원본이 둘일 수는 없다. 대신 이 스크립트가 둘을 맞춰 준다 —
프론트 문항이 바뀌면 다시 돌리면 된다.

파싱을 쓰는 이유
----------------
TypeScript를 JSON으로 따로 빼면 원본이 또 하나 늘어난다. 정규식 파싱이
투박하지만, 형식이 깨지면 조용히 넘어가지 않고 개수 검증에서 멈춘다.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "backend"))

ONBOARDING_TS = REPO / "frontend" / "src" / "data" / "onboarding.ts"
SCORING_TS = REPO / "frontend" / "src" / "data" / "skinTypeScoring.ts"
PERSONAS_JSON = REPO / "frontend" / "src" / "data" / "personas.json"

# 문항이 기여하는 대표 축. quiz_questions.axis에 들어간다.
# 한 문항이 여러 축을 건드리므로(가중치는 선택지에 있다) 여기 값은
# "이 문항이 주로 무엇을 묻는가"에 가깝다.
QUESTION_AXES = [
    "moisture",      # Q1 아침 물세수 1시간 후
    "sensitivity",   # Q2 자극 반응
    "trouble",       # Q3 여드름·홍조 빈도
    "pigmentation",  # Q4 가장 해결하고 싶은 고민
    "oil",           # Q5 메이크업 무너짐
    "moisture",      # Q6 스킨케어 선택 포인트
]


def parse_questions() -> list[dict]:
    """onboarding.ts의 QUESTIONS 배열 → [{q, options:[title...]}]"""
    src = ONBOARDING_TS.read_text(encoding="utf-8")
    body = src[src.index("export const QUESTIONS"):]

    questions: list[dict] = []
    for block in re.finditer(r"\{\s*q:\s*'([^']*)',\s*options:\s*\[(.*?)\],\s*\}", body, re.S):
        titles = re.findall(r"title:\s*'([^']*)'", block.group(2))
        questions.append({"q": block.group(1), "options": titles})
    return questions


def parse_deltas() -> list[list[dict]]:
    """skinTypeScoring.ts의 DELTAS → [[{axis: n}, ...], ...]"""
    src = SCORING_TS.read_text(encoding="utf-8")
    body = src[src.index("const DELTAS"): src.index("/** 8타입 프로필")]

    # 주석(// ...)을 먼저 지운다. 한글 설명에 중괄호가 없어 안전하다.
    body = re.sub(r"//[^\n]*", "", body)

    per_question: list[list[dict]] = []
    # 문항 단위 묶음은 대괄호, 선택지는 중괄호다.
    for group in re.finditer(r"\[\s*((?:\{[^}]*\}\s*,?\s*)+)\]", body):
        options: list[dict] = []
        for opt in re.finditer(r"\{([^}]*)\}", group.group(1)):
            delta = {}
            for pair in re.finditer(r"(\w+)\s*:\s*(-?\d+)", opt.group(1)):
                delta[pair.group(1)] = int(pair.group(2))
            options.append(delta)
        per_question.append(options)
    return per_question


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    questions = parse_questions()
    deltas = parse_deltas()
    label = json.loads(PERSONAS_JSON.read_text(encoding="utf-8"))["quizVersion"]

    # 파싱이 어긋나면 여기서 멈춘다. 조용히 절반만 적재되면 진단 결과가
    # 이유 없이 한쪽으로 쏠린다.
    if not questions:
        raise SystemExit("문항을 하나도 파싱하지 못했습니다 — onboarding.ts 형식 확인")
    if len(questions) != len(deltas):
        raise SystemExit(
            f"문항 {len(questions)}개인데 가중치는 {len(deltas)}개 — 두 파일이 어긋났습니다"
        )
    for i, (q, d) in enumerate(zip(questions, deltas), 1):
        if len(q["options"]) != len(d):
            raise SystemExit(
                f"Q{i}: 선택지 {len(q['options'])}개인데 가중치는 {len(d)}개"
            )
    if len(questions) > len(QUESTION_AXES):
        raise SystemExit("QUESTION_AXES를 문항 수에 맞게 늘려야 합니다")

    print(f"버전 {label} · 문항 {len(questions)}개")
    for i, (q, d) in enumerate(zip(questions, deltas)):
        print(f"\n  Q{i + 1} [{QUESTION_AXES[i]}] {q['q'][:46]}")
        for j, (title, delta) in enumerate(zip(q["options"], d)):
            print(f"      {j}. {title[:34]:36} {delta}")

    if args.dry_run:
        print("\n--dry-run — 적재하지 않았습니다")
        return

    import psycopg2
    from psycopg2.extras import Json, execute_values

    from app.config import settings

    conn = psycopg2.connect(settings.DATABASE_DSN)
    cur = conn.cursor()

    # 버전은 get-or-create. 활성 버전은 하나여야 하므로 나머지를 내린다.
    cur.execute("SELECT id FROM quiz_versions WHERE label = %s", (label,))
    row = cur.fetchone()
    if row:
        version_id = row[0]
    else:
        cur.execute(
            "INSERT INTO quiz_versions (label, is_active) VALUES (%s, false) RETURNING id",
            (label,),
        )
        version_id = cur.fetchone()[0]

    # 문항은 지우고 다시 넣는다. 업서트로 두면 프론트에서 삭제된 문항이
    # DB에 남아 조회 API가 없는 문항을 내보낸다.
    cur.execute("DELETE FROM quiz_questions WHERE version_id = %s", (version_id,))

    for i, (q, d) in enumerate(zip(questions, deltas)):
        cur.execute(
            """INSERT INTO quiz_questions (version_id, code, axis, body, order_no)
               VALUES (%s, %s, %s, %s, %s) RETURNING id""",
            (version_id, f"q{i + 1}", QUESTION_AXES[i], q["q"], i),
        )
        question_id = cur.fetchone()[0]
        execute_values(
            cur,
            "INSERT INTO quiz_options (question_id, label, weights, order_no) VALUES %s",
            [
                (question_id, title, Json(delta), j)
                for j, (title, delta) in enumerate(zip(q["options"], d))
            ],
        )

    # 활성 버전 전환은 마지막에. 중간에 실패하면 옛 버전이 그대로 살아 있다.
    cur.execute("UPDATE quiz_versions SET is_active = (id = %s)", (version_id,))
    conn.commit()

    cur.execute("SELECT count(*) FROM quiz_options WHERE question_id IN "
                "(SELECT id FROM quiz_questions WHERE version_id = %s)", (version_id,))
    option_count = cur.fetchone()[0]
    print(f"\n적재 완료 — quiz_versions.id={version_id} (활성) · "
          f"문항 {len(questions)}개 · 선택지 {option_count}개")
    conn.close()


if __name__ == "__main__":
    main()
