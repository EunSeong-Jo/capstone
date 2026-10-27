"""내 제품 성분 분석 (Task 14).

    GET /api/v1/products/{id}/analysis?skinType=samak&closetIds=12,34,56&moisture=3&oil=7&sensitivity=8&pigmentation=4&trouble=6

제품 상세(`GET /products/{id}`)가 "이 상품이 무엇인가"라면, 이 화면은 "**내가 쓰는 이 제품**이 어떤 제품이고 내 피부에
어떤가"를 해석한다: 기능별 강도·핵심 성분·주의 성분·전성분 해부도·내 화장대 안의 위치.

moisture·oil·sensitivity·pigmentation·trouble은 내 피부 진단 5축(0~10, 문답+사진 분석)이다. 다섯 개가 모두 있을 때만
"내 피부 상태와 견주기"를 계산한다. closetIds는 화장대에 있는 제품 id들이다(로그인하면 서버, 비회원이면 기기에 있어 클라이언트가 보낸다). 이 제품과 같은
카테고리인 것만 비교에 쓰고, 나머지와 제품 자신은 무시한다. 응답은 사용자·화장대에 따라 달라 캐시하지 않는다
(계산은 라벨 조회 몇 번이면 끝난다).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.api.recommendations import load_labeled_docs
from app.db.session import get_db
from app.services.option_scope import family_root, options_of
from app.models.recommendation import Similarity
from app.models.product import (
    Ingredient,
    IngredientFunction,
    Product,
    ProductIngredient,
)
from app.schemas.analysis import (
    AnalysisFitOut,
    AnatomyItemOut,
    CautionGroupOut,
    CautionIngredientOut,
    ClosetGapOut,
    ClosetOverlapOut,
    ClosetPositionOut,
    ConcernStateOut,
    ClosetProductRef,
    ClosetSimilarOut,
    FunctionStrengthOut,
    KeyIngredientOut,
    ProductAnalysisOut,
    SkinStateOut,
)
from app.schemas.product import ProductOptionOut
from app.schemas.skin_fit import FitIngredientOut, FitReasonOut
from app.services.product_analysis import (
    cautions,
    caution_kind,
    concern_state,
    concern_summary,
    parse_concerns,
    skin_state,
    skin_state_summary,
    closet_position,
    function_strengths,
    key_ingredients,
)
from app.services.similarity import FUNC_NAMES
from app.services.skin_fit import PREFER, build_flags, classify_ingredient, evaluate

router = APIRouter(prefix="/api/v1/products", tags=["analysis"])

MAX_CLOSET = 100


@router.get("/{product_id}/analysis", response_model=ProductAnalysisOut, summary="내 제품 성분 분석")
async def read_analysis(
    product_id: int = Path(..., ge=1),
    skin_type: str | None = Query(None, alias="skinType", description="피부타입 ID. 주면 궁합·추천 성분·부족한 기능을 낸다"),
    closet_ids: str | None = Query(None, alias="closetIds", description="화장대 제품 id를 쉼표로 (최대 100개)"),
    moisture: int | None = Query(None, ge=0, le=10),
    oil: int | None = Query(None, ge=0, le=10),
    sensitivity: int | None = Query(None, ge=0, le=10),
    pigmentation: int | None = Query(None, ge=0, le=10),
    trouble: int | None = Query(None, ge=0, le=10),
    concerns: str | None = Query(
        None, description="AI 사진 분석 항목 점수 'oiliness:79,moisture:74,…'(0~100, 높을수록 좋음). 주면 분석된 항목 전부를 견준다"
    ),
    db: AsyncSession = Depends(get_db),
) -> ProductAnalysisOut:
    product = await db.scalar(
        select(Product)
        .where(Product.id == product_id)
        .options(joinedload(Product.brand), joinedload(Product.category))
    )
    if product is None:
        raise HTTPException(status_code=404, detail="제품을 찾을 수 없습니다")
    if skin_type is not None and skin_type not in PREFER:
        skin_type = None      # 모르는 타입은 무시한다(다른 조회 API와 같다)
    try:
        owned = sorted({int(x) for x in (closet_ids or "").split(",") if x.strip()} - {product_id})
    except ValueError:
        raise HTTPException(status_code=422, detail="closetIds는 숫자를 쉼표로 이어 주세요") from None
    if len(owned) > MAX_CLOSET:
        raise HTTPException(status_code=422, detail=f"closetIds는 최대 {MAX_CLOSET}개입니다")

    # 전성분 전체(라벨 없는 성분 포함) — 해부도는 모든 칸을 그린다
    rows = (
        await db.execute(
            select(
                ProductIngredient.position, Ingredient.id, Ingredient.name_ko, Ingredient.norm_name,
                IngredientFunction.functions, IngredientFunction.role, IngredientFunction.flags,
                IngredientFunction.confidence, IngredientFunction.allergen_listed,
            )
            .join(Ingredient, Ingredient.id == ProductIngredient.ingredient_id)
            .outerjoin(IngredientFunction, IngredientFunction.ingredient_id == Ingredient.id)
            .where(ProductIngredient.product_id == product_id)
            .order_by(ProductIngredient.position)
        )
    ).all()

    all_docs, all_pos, labels, names = [], [], {}, {}
    doc, positions = [], []        # 라벨이 있는 성분만 (평가 입력)
    for pos, ing, name, norm, funcs, role, flags, conf, listed in rows:
        names[ing] = name
        all_docs.append(ing)
        all_pos.append(pos)
        if role is not None:
            labels[ing] = ("".join(funcs or []), role, build_flags("".join(flags or []), bool(listed), norm), conf)
            doc.append(ing)
            positions.append(pos)

    mine = function_strengths(doc, labels, positions)

    fit = None
    if skin_type:
        f = evaluate(doc, labels, names, skin_type, None, positions)
        fit = AnalysisFitOut(
            verdict=f.verdict,
            score=f.score,
            reasons=[
                FitReasonOut(
                    kind=r.kind, text=r.text,
                    ingredients=[FitIngredientOut(position=p, name=n) for p, n in r.ingredients],
                )
                for r in f.reasons
            ],
        )

    keys = []
    for k in key_ingredients(doc, labels, names, positions):
        keys.append(
            KeyIngredientOut(
                position=k["position"], name=k["name"], functions=k["functions"],
                recommended=classify_ingredient(labels.get(k["ingredient_id"]), skin_type) == "key",
            )
        )

    anatomy = [
        AnatomyItemOut(
            position=pos,
            name=names[ing],
            role=labels[ing][1] if ing in labels else None,
            functions=list(labels[ing][0]) if ing in labels else [],
            caution=caution_kind(labels.get(ing)),
        )
        for ing, pos in zip(all_docs, all_pos)
    ]

    # 내 피부 상태(진단 5축, 문답+사진 분석). 다섯 축이 다 있을 때만 견준다.
    axes = {
        k: v for k, v in (
            ("moisture", moisture), ("oil", oil), ("sensitivity", sensitivity),
            ("pigmentation", pigmentation), ("trouble", trouble),
        ) if v is not None
    }
    state = skin_state(axes, mine, cautions(doc, labels, names, positions)) if len(axes) == 5 else []

    conc = parse_concerns(concerns)
    cstate = concern_state(conc, mine, cautions(doc, labels, names, positions)) if conc else []

    closet = None
    category = product.category.code if product.category else ""
    if owned and category:
        peers = (
            await db.scalars(
                select(Product)
                .where(Product.id.in_(owned), Product.status == "active")
                .options(joinedload(Product.brand), joinedload(Product.category))
            )
        ).unique().all()
        peers = [p for p in peers if p.category and p.category.code == category]
        pdocs, plabels, _pnames, ppos = (
            await load_labeled_docs(db, [p.id for p in peers]) if peers else ({}, {}, {}, {})
        )
        others = [
            (p.id, p.display_name or p.name, function_strengths(pdocs.get(p.id, []), plabels, ppos.get(p.id)))
            for p in peers
        ]
        # 비슷한 정도는 화면 어디서나 같은 hybrid 유사도를 쓴다(저장된 상위 20개 안에 있는 쌍만 점수가 있다)
        rows_sim = (
            await db.execute(
                select(Similarity.product_id, Similarity.similar_id, Similarity.score).where(
                    Similarity.method == "hybrid",
                    ((Similarity.product_id == product_id) & Similarity.similar_id.in_([p.id for p in peers]))
                    | (Similarity.product_id.in_([p.id for p in peers]) & (Similarity.similar_id == product_id)),
                )
            )
        ).all() if peers else []
        scores: dict[int, float] = {}
        for a, b, sc in rows_sim:
            other = b if a == product_id else a
            scores[other] = max(scores.get(other, 0.0), float(sc))
        pos = closet_position(mine, others, skin_type, scores)
        closet = ClosetPositionOut(
            category=category,
            owned_count=pos["owned_count"],
            overlaps=[
                ClosetOverlapOut(
                    function=o["function"], name=o["name"],
                    products=[ClosetProductRef(**x) for x in o["products"]],
                )
                for o in pos["overlaps"]
            ],
            gaps=[ClosetGapOut(**g) for g in pos["gaps"]],
            similar=[ClosetSimilarOut(**s) for s in pos["similar"]],
        )

    root = family_root(product)
    options = [
        ProductOptionOut(id=i, label=label, order_no=order)
        for i, label, order in (await options_of(db, root) if root is not None else [])
    ]

    return ProductAnalysisOut(
        option_label=product.option_label,
        options=options,
        product_id=product.id,
        name=product.display_name or product.name,
        brand=product.brand.name if product.brand else "",
        category=category,
        image_url=product.image_url,
        skin_type=skin_type,
        labeled_count=len(doc),
        total_count=len(all_docs),
        fit=fit,
        skin_state=[SkinStateOut(**x) for x in state],
        skin_state_summary=skin_state_summary(state) if state else None,
        concern_state=[ConcernStateOut(**x) for x in cstate],
        concern_summary=concern_summary(cstate) if cstate else None,
        focus_functions=[
            f for f, w in sorted(PREFER[skin_type].items(), key=lambda kv: -kv[1]) if w >= 0.6
        ] if skin_type else [],
        functions=[
            FunctionStrengthOut(code=c, name=FUNC_NAMES[c], value=v["value"], count=v["count"])
            for c, v in mine.items()
        ],
        key_ingredients=keys,
        cautions=[
            CautionGroupOut(
                kind=g["kind"], label=g["label"],
                ingredients=[CautionIngredientOut(**i) for i in g["ingredients"]],
            )
            for g in cautions(doc, labels, names, positions)
        ],
        anatomy=anatomy,
        closet=closet,
    )
