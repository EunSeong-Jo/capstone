"""조은성 데모 계정에 16항목(확장) 사진 분석을 하나 더 만든다. 로컬 백엔드 컨테이너 안에서 실행한다:

    docker exec -i -e PYTHONPATH=/app -w /app swappy_backend python - < scripts/seed_demo_analysis.py

조은성은 구독 계정이라 화면이 "16가지"를 약속하는데, 실제로 찍어 둔 분석은 8항목(무료)뿐이다.
가장 최근의 **실제** 분석(8항목·이미지 포함)을 그대로 복사하고, 모자란 8항목(탄력·광채·피부결·다크서클·눈가 4개)은
저장해 둔 모의 응답의 점수와 모의 이미지로 채운다(services/skin_sample.py와 같은 방식).
실제 이미지는 복사하지 않고 원본 분석에서 읽는다(`metrics.sample_of`) — 모의 이미지 8개만 저장해서 운영에 올리는 덤프가 커지지 않는다.
이미 16항목 분석이 있으면 아무것도 하지 않는다. Perfect Corp은 부르지 않는다(유닛 0).
"""
import asyncio
import uuid
from datetime import datetime, timezone

from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.skin_photo import SkinAnalysis, SkinAnalysisImage
from app.models.user import User
from app.services import skin_images
from app.services.skin_photo import mock_masks, mock_output, parse_output
from app.services.skin_quota import EXTENDED_CONCERNS

EMAIL = "eunseong@swappy.app"


async def main() -> None:
    async with AsyncSessionLocal() as db:
        user = await db.scalar(select(User).where(User.email == EMAIL))
        rows = list(
            await db.scalars(
                select(SkinAnalysis).where(SkinAnalysis.user_id == user.id).order_by(SkinAnalysis.created_at.desc())
            )
        )
        if any(r.concern_set == "extended" for r in rows):
            print("이미 16항목 분석이 있습니다")
            return
        src = next(r for r in rows if "sample_of" not in r.metrics)
        m = src.metrics
        concerns = dict(m.get("concerns", {}))
        missing = tuple(k for k in EXTENDED_CONCERNS if k not in concerns and k != "skin_type")
        parsed = parse_output(mock_output(missing))
        for k, v in parsed["concerns"].items():
            concerns.setdefault(k, v)
        fake = skin_images.valid_images(mock_masks(tuple(k for k in missing if k in concerns)))
        real = set(
            await db.scalars(select(SkinAnalysisImage.key).where(SkinAnalysisImage.analysis_id == src.id))
        )
        keys = sorted({*real, *fake})
        new_id = uuid.uuid4()
        db.add(
            SkinAnalysis(
                id=new_id,
                user_id=user.id,
                quota_kind=src.quota_kind,
                concern_set="extended",
                provider_mode=src.provider_mode,
                metrics={"axes": m["axes"], "skin_types": m.get("skin_types", {}), "concerns": concerns, "images": keys, "sample_of": str(src.id)},
                created_at=datetime.now(timezone.utc),
            )
        )
        await db.flush()
        skin_images.add_images(db, user.id, new_id, fake)
        await db.commit()
        print(f"16항목 분석 추가: 항목 {len(concerns)}개, 이미지 {len(keys)}개 (원본에서 {len(real)} + 모의 저장 {len(fake)})")


asyncio.run(main())
