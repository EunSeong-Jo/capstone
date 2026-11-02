"""평가 공통 — 로컬 DB 접속(운영·Neon 거부), 경로, 환경 기록."""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

REPO = Path(__file__).resolve().parents[2]
EVAL_DIR = REPO / "data" / "eval"
sys.path.insert(0, str(REPO / "backend"))
sys.path.insert(0, str(REPO / "scripts"))
sys.path.insert(0, str(Path(__file__).parent))

SEED = 20261101  # PROTOCOL.md 의 고정 seed


def connect():
    """로컬 Postgres 에만 붙는다. DATABASE_DSN 환경변수로 로컬 DSN 을 넘겨야 한다(.env 는 읽지 않는다고 가정하지 않고 호스트로 검증)."""
    import psycopg2

    from app.config import settings

    host = urlparse(settings.DATABASE_DSN).hostname or ""
    if host not in ("localhost", "127.0.0.1", "postgres"):
        raise SystemExit(f"로컬 DB 가 아닙니다(host={host}). DATABASE_DSN 을 로컬로 지정하세요.")
    return psycopg2.connect(settings.DATABASE_DSN)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


def git_commit() -> str:
    try:
        return subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=REPO, capture_output=True, text=True).stdout.strip()
    except Exception:
        return "?"


def results_dir() -> Path:
    d = EVAL_DIR / "results" / date.today().isoformat()
    d.mkdir(parents=True, exist_ok=True)
    return d


def dump_json(name: str, obj: dict) -> Path:
    p = results_dir() / name
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=2, default=float), encoding="utf-8")
    return p


def env_info(cur, data_files: list[Path]) -> dict:
    cur.execute("select version_num from alembic_version")
    alembic = cur.fetchone()[0]
    counts = {}
    for t in ("products", "ingredients", "product_ingredients", "similarities", "product_skin_fit"):
        cur.execute(f"select count(*) from {t}")
        counts[t] = cur.fetchone()[0]
    return {
        "git_commit": git_commit(),
        "alembic": alembic,
        "db_counts": counts,
        "seed": SEED,
        "data_hash": {p.name: sha256(p) for p in data_files if p.exists()},
        "note": "로컬 스냅샷. AWS 운영 DB와 평가 대상 테이블이 행 단위로 동일함(2026-11-01 확인)",
    }
