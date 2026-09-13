#!/usr/bin/env python3
"""데모/테스트용 사용자 시드 — personas.json → users / profiles / diagnoses / diagnosis_ranks

    python scripts/seed_test_users.py
    python scripts/seed_test_users.py --dry-run     # 적재 없이 계획만 출력

멱등하다. 이메일이 이미 있으면 비밀번호·닉네임·프로필을 갱신하고, 진단 기록은
사용자별로 지운 뒤 다시 넣는다. 여러 번 돌려도 행수가 늘지 않는다.

원본은 프론트와 공유하는 `frontend/src/data/personas.json` 한 곳이다.
같은 사람이 프론트 데모 로그인(AuthContext)과 이 DB 시드에 동일하게 존재한다.

주의: 이 스크립트는 데이터를 넣기만 한다. 백엔드에 로그인 API가 아직 없어
(Task 12) 프론트가 이 계정으로 실제 인증하지는 않는다 — 프론트 데모는
personas.json 대조로 로그인한다. 이 시드는 논문/발표에서 "통합 DB에 진단까지
들어간 실사용자"를 보여주기 위한 것이다.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# psycopg2 / passlib 는 백엔드 의존성이다. --dry-run 은 DB 없이도 돌 수 있도록
# 실제 적재 직전에 지연 import 한다.

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "backend"))

from app.config import settings  # noqa: E402

PERSONAS_JSON = REPO / "frontend" / "src" / "data" / "personas.json"


def hash_password(raw: str) -> str:
    """백엔드 인증 스택과 동일하게 bcrypt. passlib 우선, 없으면 bcrypt 직접."""
    try:
        from passlib.context import CryptContext

        return CryptContext(schemes=["bcrypt"], deprecated="auto").hash(raw)
    except ImportError:
        import bcrypt

        return bcrypt.hashpw(raw.encode(), bcrypt.gensalt()).decode()


def load_personas() -> tuple[str, list[dict]]:
    data = json.loads(PERSONAS_JSON.read_text(encoding="utf-8"))
    return data["quizVersion"], data["personas"]


def get_or_create_quiz_version(cur, label: str) -> int:
    cur.execute("SELECT id FROM quiz_versions WHERE label = %s LIMIT 1", (label,))
    row = cur.fetchone()
    if row:
        return row[0]
    # 실제 문항 세트가 없더라도 diagnoses.version_id 외래키를 만족시키기 위한 자리.
    # is_active=false 로 두어 운영 진단 흐름에 영향을 주지 않는다.
    cur.execute(
        "INSERT INTO quiz_versions (label, is_active) VALUES (%s, false) RETURNING id",
        (label,),
    )
    return cur.fetchone()[0]


def upsert_user(cur, persona: dict) -> str:
    cur.execute(
        """
        INSERT INTO users (email, password_hash, nickname, provider, is_active)
        VALUES (%s, %s, %s, 'local', true)
        ON CONFLICT (email) DO UPDATE
          SET password_hash = EXCLUDED.password_hash,
              nickname      = EXCLUDED.nickname,
              provider      = 'local',
              is_active     = true
        RETURNING id
        """,
        (persona["email"], hash_password(persona["password"]), persona["nickname"]),
    )
    return cur.fetchone()[0]


def upsert_profile(cur, Json, user_id: str, persona: dict) -> None:
    budget = persona.get("budget") or {}
    cur.execute(
        """
        INSERT INTO profiles (user_id, skin_type, scores, budget_min, budget_max)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (user_id) DO UPDATE
          SET skin_type  = EXCLUDED.skin_type,
              scores     = EXCLUDED.scores,
              budget_min = EXCLUDED.budget_min,
              budget_max = EXCLUDED.budget_max
        """,
        (
            user_id,
            persona["skinType"],
            Json(persona["scores"]),
            budget.get("min"),
            budget.get("max"),
        ),
    )


def replace_diagnosis(cur, Json, user_id: str, version_id: int, persona: dict) -> int:
    cur.execute("DELETE FROM diagnoses WHERE user_id = %s", (user_id,))
    cur.execute(
        """
        INSERT INTO diagnoses (user_id, version_id, answers, scores)
        VALUES (%s, %s, %s, %s)
        RETURNING id
        """,
        (user_id, version_id, Json({}), Json(persona["scores"])),
    )
    diag_id = cur.fetchone()[0]
    for rank in persona["ranks"]:
        cur.execute(
            """
            INSERT INTO diagnosis_ranks (diagnosis_id, rank, skin_type, score)
            VALUES (%s, %s, %s, %s)
            """,
            (diag_id, rank["rank"], rank["skinType"], rank["score"]),
        )
    return diag_id


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="적재 없이 계획만 출력")
    args = parser.parse_args()

    quiz_label, personas = load_personas()
    print(f"페르소나 {len(personas)}명 · quizVersion={quiz_label}")
    for p in personas:
        print(
            f"  - {p['nickname']:8s} {p['email']:20s} "
            f"skin={p['skinType']:10s} owned={len(p['ownedCosmetics'])}개 "
            f"budget={p['budget']['min']:,}~{p['budget']['max']:,}"
        )

    if args.dry_run:
        print("\n--dry-run: DB에 쓰지 않고 종료")
        return

    if not settings.DATABASE_DSN:
        sys.exit("DATABASE_DSN이 비어 있습니다. .env에 Neon 연결 문자열을 넣으세요.")

    import psycopg2
    from psycopg2.extras import Json

    with psycopg2.connect(settings.DATABASE_DSN) as conn, conn.cursor() as cur:
        version_id = get_or_create_quiz_version(cur, quiz_label)
        for p in personas:
            user_id = upsert_user(cur, p)
            upsert_profile(cur, Json, user_id, p)
            diag_id = replace_diagnosis(cur, Json, user_id, version_id, p)
            print(f"✓ {p['nickname']} → user={user_id} diagnosis={diag_id}")
        conn.commit()

    print(f"\n완료 — {len(personas)}명 적재 (quiz_versions.id={version_id})")


if __name__ == "__main__":
    main()
