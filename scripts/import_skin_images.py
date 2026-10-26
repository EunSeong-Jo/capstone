"""디스크에 있던 사진 분석 이미지(`<dir>/<user_id>/<analysis_id>/<항목>.png`)를 DB로 올린다.

마이그레이션 e3f5a7b9c1d2 이전에 만들어진 분석을 옮길 때 한 번 쓴다. 이미 있는 행은 건너뛴다.
백엔드 컨테이너 안에서:  python scripts/import_skin_images.py /data/skin_images
(`scripts/`는 컨테이너에 없으니 `docker exec -i swappy_backend python - /data/skin_images < scripts/import_skin_images.py`)
"""
import asyncio
import sys
import uuid
from pathlib import Path

from sqlalchemy.dialects.postgresql import insert

from app.db.session import AsyncSessionLocal
from app.models.skin_photo import SkinAnalysis, SkinAnalysisImage
from app.services.skin_images import valid_images
from sqlalchemy import select


async def main(root: Path) -> None:
    async with AsyncSessionLocal() as db:
        owner = dict((await db.execute(select(SkinAnalysis.id, SkinAnalysis.user_id))).all())
        added = skipped = 0
        for f in sorted(root.glob("*/*/*.png")):
            try:
                aid = uuid.UUID(f.parent.name)
            except ValueError:
                continue
            if aid not in owner or not valid_images({f.stem: f.read_bytes()}):
                skipped += 1
                continue
            res = await db.execute(
                insert(SkinAnalysisImage)
                .values(analysis_id=aid, key=f.stem, user_id=owner[aid], png=f.read_bytes())
                .on_conflict_do_nothing()
            )
            added += res.rowcount
        await db.commit()
    print(f"올림 {added}장, 건너뜀 {skipped}장")


asyncio.run(main(Path(sys.argv[1] if len(sys.argv) > 1 else "/data/skin_images")))
