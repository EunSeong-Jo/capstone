"""리필팩 제품의 hybrid 유사도를 바로잡는 SQL을 만든다(필요하면 로컬 DB에 바로 적용한다).

배경: 제형 감지가 "토너 200ml 리필팩"의 '팩'을 마스크팩으로 읽어, 성분이 똑같은 본품과의 hybrid 점수가
제형 몫(γ/(α+β+γ) = 0.20/1.20)만큼 깎였다(100% → 83%). 제형 감지는 고쳤지만(`services/similarity.py`),
이미 적재한 점수는 그대로라서 리필팩이 낀 쌍만 점수를 보정한다. 전체 재계산은 하지 않는다.

    docker exec -i -e PYTHONPATH=/app -w /app swappy_backend python - > fix.sql < scripts/fix_refill_similarity.py
    docker exec -i -e PYTHONPATH=/app -w /app swappy_backend python - --apply < scripts/fix_refill_similarity.py

SQL은 `WHERE ... AND score = <옛 값>`으로 막아 두어 여러 번 돌려도 한 번만 적용된다.
한계: 점수가 올라서 새로 상위 20에 들 쌍은 추가하지 않는다(적재된 쌍의 점수만 고친다).
"""
import asyncio
import sys

from sqlalchemy import text

from app.db.session import AsyncSessionLocal
from app.services.similarity import DEFAULT_ALPHA, DEFAULT_BETA, DEFAULT_GAMMA, detect_form, detect_form_raw

FORM_SHARE = DEFAULT_GAMMA / (DEFAULT_ALPHA + DEFAULT_BETA + DEFAULT_GAMMA)


def matches(a: str | None, b: str | None) -> bool:
    return a is not None and b is not None and a == b


async def main(apply: bool) -> None:
    async with AsyncSessionLocal() as db:
        affected = (
            await db.execute(
                text("select id, coalesce(display_name, name) from products where name ~ '리필\\s*(팩|파우치|파우춰)'")
            )
        ).all()
        ids = [r[0] for r in affected]
        names = {r[0]: r[1] for r in affected}
        # 쌍의 상대편 이름
        rows = (
            await db.execute(
                text(
                    """
                    select s.product_id, s.similar_id, s.score, coalesce(a.display_name, a.name), coalesce(b.display_name, b.name)
                    from similarities s
                    join products a on a.id = s.product_id
                    join products b on b.id = s.similar_id
                    where s.method = 'hybrid' and (s.product_id = any(:ids) or s.similar_id = any(:ids))
                    """
                ),
                {"ids": ids},
            )
        ).all()

        out = ["BEGIN;"]
        changed = 0
        for pid, sid, score, an, bn in rows:
            old_match = matches(detect_form_raw(an), detect_form_raw(bn))
            new_match = matches(detect_form(an), detect_form(bn))
            if old_match == new_match:
                continue
            new = min(1.0, max(0.0, score + FORM_SHARE * (int(new_match) - int(old_match))))
            out.append(
                f"UPDATE similarities SET score = {new!r} WHERE product_id = {pid} AND similar_id = {sid} "
                f"AND method = 'hybrid' AND score = {score!r}; -- {an[:24]} ↔ {bn[:24]}"
            )
            changed += 1
        out.append("COMMIT;")
        sql = "\n".join(out)
        if apply:
            for line in out[1:-1]:
                await db.execute(text(line.split(" -- ")[0]))
            await db.commit()
            print(f"적용: 제품 {len(ids)}개와 얽힌 쌍 {len(rows)}개 중 {changed}개 점수 보정", file=sys.stderr)
        else:
            print(sql)
            print(f"-- 제품 {len(ids)}개, 보정할 쌍 {changed}개 / 검사한 쌍 {len(rows)}개", file=sys.stderr)


asyncio.run(main("--apply" in sys.argv))
