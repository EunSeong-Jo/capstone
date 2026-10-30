import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { IngredientSheet } from '../../components/product/IngredientSheet';
import type { ProductIngredient } from '../../api/products';
import { skinTypes } from '../../data/skinTypes';
import { PageWrapper } from '../../components/layout/PageWrapper';
import {
  Divider,
  FunctionCompare,
  IngredientChanges,
  Section,
  SkinStateCompare,
} from '../../components/compare/CompareSections';
import { CompareModeContext, useCompareLabels } from '../../components/compare/compareMode';
import { loadAnalysis, type ProductAnalysis } from '../../api/analysis';
import { useCart } from '../../context/cart';
import { useToast } from '../../context/toast';
import { useProduct } from '../../hooks/useProduct';
import { useSkinStateSource } from '../../hooks/useSkinStateSource';
import { useSkinType } from '../../hooks/useSkinType';
import { compareCautions, compareFunctions, compareKeyIngredients, compareSkinState } from '../../utils/compare';
import { readSimilarTo } from '../../utils/alternatives';

const VERDICT_LABEL = { good: '잘 맞아요', ok: '무난해요', caution: '주의', unknown: '근거 부족' } as const;

/** 궁합은 점수로 보여 준다. 근거가 부족해 점수가 없으면 판정 문구로 */
const fitText = (fit: { verdict: keyof typeof VERDICT_LABEL; score: number | null }) =>
  fit.score !== null ? `${fit.score}점` : VERDICT_LABEL[fit.verdict];

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3 px-4 py-5">
      <div className="h-28 rounded-xl bg-oy-chip" />
      <div className="h-48 rounded-xl bg-oy-chip" />
      <div className="h-32 rounded-xl bg-oy-chip" />
    </div>
  );
}

/** 위에 붙는 두 제품 머리. 스크롤해도 어느 쪽이 어느 제품인지 보이게 고정한다 */
function ProductPair({ a, b }: { a: ProductAnalysis; b: ProductAnalysis }) {
  const labels = useCompareLabels();
  const cell = (p: ProductAnalysis, label: string, tone: string) => (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <span className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-xl bg-oy-chip">
        {p.imageUrl && <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />}
      </span>
      <span className="min-w-0">
        <span className={`block text-[11px] font-bold ${tone}`}>{label}</span>
        <span className="block truncate text-[11px] text-oy-sub">{p.brand}</span>
        <span className="line-clamp-2 block text-xs font-semibold leading-snug text-oy-text">{p.name}</span>
      </span>
    </div>
  );
  return (
    <div className="sticky top-14 z-[9] flex gap-3 border-b border-oy-line bg-white px-4 py-3">
      {cell(a, labels.a, 'text-oy-sub')}
      <span className="self-center text-xs text-oy-sub">→</span>
      {cell(b, labels.b, 'text-primary')}
    </div>
  );
}

/**
 * 성분 비교 — 내가 쓰는 제품(a)과 대체품(b)의 성분 분석을 나란히 견준다 (`/compare?a=&b=`).
 *
 * 서버는 제품마다 같은 모양의 분석(`/products/{id}/analysis`)을 주므로 두 번 받아 프론트에서 견준다.
 * 홈 교체 제안·상세 페이지의 "비교" 버튼이 들어오는 곳이다.
 */
export default function ComparePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { addToCart } = useCart();
  const { showToast } = useToast();
  const aId = Number(params.get('a'));
  const bId = Number(params.get('b'));
  // 사용자가 두 제품을 직접 고른 비교(교체 제안이 아님): 문구를 '기준 제품 · 비교 제품'으로
  const direct = params.get('direct') === '1';
  const valid = Number.isInteger(aId) && aId > 0 && Number.isInteger(bId) && bId > 0 && aId !== bId;
  // 라우터 state로 온 유사도·절약액(있으면 요약에 쓴다)
  const similarTo = readSimilarTo(useLocation().state, bId);

  const { skinType, loading: typeLoading } = useSkinType();
  // 내 피부 상태(사진 분석 우선, 없으면 문답)를 서버에 보내면 분석에 "내 피부와 견주기"가 채워진다
  const { axes, photo, loading: stateLoading } = useSkinStateSource();
  const concerns = useMemo(
    () => (photo ? photo.concerns.map((c) => `${c.key}:${Math.round(c.score)}`).join(',') : ''),
    [photo],
  );
  const axesKey = axes ? Object.values(axes).join(',') : '';
  const prodA = useProduct(valid ? aId : undefined);
  const prodB = useProduct(valid ? bId : undefined);

  // 핵심 성분 칩을 누르면 성분 설명 시트. 설명은 두 제품의 상세 응답에 이미 실려 있다.
  const [pickedName, setPickedName] = useState<string | null>(null);
  const picked: ProductIngredient | null = useMemo(() => {
    if (!pickedName) return null;
    const norm = (n: string) => n.trim().toLowerCase();
    const all = [...(prodB.product?.ingredients ?? []), ...(prodA.product?.ingredients ?? [])];
    return all.find((i) => norm(i.name) === norm(pickedName)) ?? { id: 0, name: pickedName, position: 0 };
  }, [pickedName, prodA.product, prodB.product]);
  const skinTypeLabel = skinTypes.find((t) => t.id === skinType)?.label ?? null;

  const [loaded, setLoaded] = useState<{ key: string; a: ProductAnalysis | null; b: ProductAnalysis | null; failed: boolean } | null>(null);
  const key = `${aId}:${bId}:${skinType ?? ''}:${axesKey}:${concerns}`;
  useEffect(() => {
    if (!valid || typeLoading || stateLoading) return;
    let alive = true;
    Promise.all([loadAnalysis(aId, skinType, [], axes, concerns), loadAnalysis(bId, skinType, [], axes, concerns)])
      .then(([a, b]) => alive && setLoaded({ key, a, b, failed: false }))
      .catch(() => alive && setLoaded({ key, a: null, b: null, failed: true }));
    return () => {
      alive = false;
    };
    // axes는 key에 값으로 들어 있다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, valid, typeLoading, stateLoading, aId, bId, skinType]);

  const current = loaded?.key === key ? loaded : null;
  const a = current?.a ?? null;
  const b = current?.b ?? null;

  const view = useMemo(() => {
    if (!a || !b) return null;
    const functions = compareFunctions(a.functions, b.functions);
    return {
      functions,
      weaker: functions.filter((r) => r.verdict === 'weaker').length,
      stronger: functions.filter((r) => r.verdict === 'stronger').length,
      keys: compareKeyIngredients(a, b),
      cautions: compareCautions(a, b),
      state: compareSkinState(a, b),
    };
  }, [a, b]);

  const priceA = prodA.product?.price;
  const priceB = prodB.product?.price;
  const priceDiff = priceA !== undefined && priceB !== undefined ? priceB - priceA : undefined;

  if (!valid) {
    return (
      <PageWrapper>
        <Header showBack title="성분 비교" />
        <p className="px-4 py-16 text-center text-sm text-oy-sub">비교할 두 제품을 알 수 없어요.</p>
      </PageWrapper>
    );
  }

  const addToCartAndToast = () => {
    if (!prodB.product) return;
    addToCart({
      id: prodB.product.id,
      name: prodB.product.name,
      brand: prodB.product.brand,
      price: prodB.product.price,
      imageUrl: prodB.product.imageUrl,
    });
    showToast('장바구니에 담았어요', { label: '장바구니로', onClick: () => navigate('/cart') });
  };

  return (
    <PageWrapper>
      <CompareModeContext.Provider value={direct ? 'direct' : 'swap'}>
      <Header showBack title="성분 비교" />
      {!current && <Skeleton />}
      {current?.failed && (
        <p className="px-4 py-16 text-center text-sm text-oy-sub">비교 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>
      )}
      {a && b && view && (
        <>
          <ProductPair a={a} b={b} />
          <div className="flex-1">
            {/* 1. 한 줄 요약 — "바꿔도 되나"를 먼저 */}
            <Section title={direct ? '한눈에 비교' : '바꿔도 될까요?'}>
              <ul className="space-y-2 rounded-xl bg-white px-4 py-3 text-[13px] shadow-sm">
                {similarTo && (
                  <li className="flex justify-between">
                    <span className="text-oy-sub">성분 유사도</span>
                    <b className="text-primary">{similarTo.score}%</b>
                  </li>
                )}
                {priceDiff !== undefined && (
                  <li className="flex justify-between">
                    <span className="text-oy-sub">가격</span>
                    <b className={priceDiff < 0 ? 'text-accent' : 'text-oy-text'}>
                      {priceDiff === 0 ? '같아요' : `${Math.abs(priceDiff).toLocaleString()}원 ${priceDiff < 0 ? '저렴해요' : '비싸요'}`}
                    </b>
                  </li>
                )}
                <li className="flex justify-between">
                  <span className="text-oy-sub">기능 강도</span>
                  <b className="text-oy-text">
                    {view.weaker === 0 && view.stronger === 0
                      ? '비슷해요'
                      : [view.weaker > 0 && `${view.weaker}개 약해요`, view.stronger > 0 && `${view.stronger}개 강해요`].filter(Boolean).join(' · ')}
                  </b>
                </li>
                {skinType && a.fit && b.fit && (
                  <li className="flex justify-between">
                    <span className="text-oy-sub">내 피부 궁합</span>
                    <b className="text-oy-text">
                      {fitText(a.fit)} → {fitText(b.fit)}
                    </b>
                  </li>
                )}
              </ul>
              {!skinType && <p className="mt-2 text-[11px] text-oy-sub">피부 진단을 하면 내 피부 궁합도 견줘 드려요.</p>}
            </Section>
            <Divider />

            {/* 2. 기능 강도 */}
            <Section
              title="기능 강도"
              hint="두 제품이 보습·진정 같은 기능을 얼마나 내는지 견줬어요"
              info={
                <>
                  <p>막대 길이는 성분 개수가 아니라 <b>그 기능을 가진 성분이 전성분표의 어디쯤 있는지</b>로 정해져요.</p>
                  <p className="mt-1.5">전성분표는 많이 든 성분부터 적기 때문에 앞쪽에 있을수록 더 많이 든 것으로 보고 막대를 길게 그려요. 오른쪽의 "1종"은 그 기능을 가진 성분의 수예요.</p>
                  <p className="mt-1.5">그래서 같은 1종이어도 성분표 앞쪽에 있는 쪽이 막대가 더 길어요.</p>
                </>
              }
            >
              <FunctionCompare rows={view.functions} />
            </Section>
            <Divider />

            {/* 3. 성분 변화 — 기능별 증감 칩 + 주의 성분 칩, 눌러서 추가·제거되는 성분 확인 */}
            <Section title="성분 변화" hint={direct ? '두 제품의 핵심 성분이 기능별로 어떻게 다른지 보여 드려요' : '바꾸면 핵심 성분이 기능별로 어떻게 달라지는지 보여 드려요'}>
              <IngredientChanges split={view.keys} cmp={view.cautions} onSelect={setPickedName} />
            </Section>
            <Divider />

            {/* 5. 내 피부 기준 — 신경 쓸 부분마다 두 제품이 얼마나 돕는지 */}
            <Section title="내 피부에는 어떨까요?" hint="내가 신경 쓰는 부분을 두 제품이 얼마나 돕는지 견줬어요">
              {view.state.length > 0 || a.concernState.length > 0 || a.skinState.length > 0 ? (
                <SkinStateCompare rows={view.state} />
              ) : (
                <div className="rounded-xl border border-dashed border-oy-line bg-white px-4 py-5 text-center">
                  <p className="text-sm text-oy-sub">
                    {skinType ? '피부 상태를 알면 내가 신경 쓰는 부분을 두 제품이 얼마나 돕는지 견줘 드려요.' : '로그인하고 피부 진단을 하면 내 피부 기준으로 견줘 드려요.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate(skinType ? '/analysis/' + aId : '/login')}
                    className="mt-3 rounded-full bg-primary px-4 py-2 text-sm font-bold text-white active:scale-95"
                  >
                    {skinType ? '내 피부 분석하러 가기' : '로그인하기'}
                  </button>
                </div>
              )}
            </Section>

          </div>

          {/* 하단 액션 */}
          <div className="sticky bottom-0 z-10 flex gap-2 border-t border-oy-line bg-white px-4 pt-3 pb-[calc(0.75rem+var(--safe-bottom))]">
            <button
              type="button"
              onClick={() => navigate(`/detail/${bId}`, { state: similarTo ? { similarTo } : undefined })}
              className="flex-1 rounded-xl border border-oy-line bg-white py-3 text-[13px] font-bold text-oy-text active:scale-[.98]"
            >
              {direct ? '비교 제품 상세 보기' : '대체품 상세 보기'}
            </button>
            <button
              type="button"
              onClick={addToCartAndToast}
              disabled={!prodB.product}
              className="flex-[1.4] rounded-xl bg-primary py-3 text-[13px] font-bold text-white disabled:opacity-50 active:scale-[.98]"
            >
              장바구니에 담기
            </button>
          </div>
        </>
      )}
      <IngredientSheet ingredient={picked} onClose={() => setPickedName(null)} skinTypeLabel={skinTypeLabel} />
      </CompareModeContext.Provider>
    </PageWrapper>
  );
}
