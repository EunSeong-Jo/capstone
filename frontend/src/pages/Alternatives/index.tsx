import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Header } from '../../components/layout/Header';
import { AlternativeCard } from '../../components/alternatives/AlternativeCard';
import { ProductCard } from '../../components/product/ProductCard';
import { toSimilarMethod } from '../../api/similar';
import { useCloset } from '../../context/closet';
import { ClosetSeedPicker } from '../../components/alternatives/ClosetSeedPicker';
import { useProduct } from '../../hooks/useProduct';
import { useProducts } from '../../hooks/useProducts';
import { useSimilarProducts } from '../../hooks/useSimilarProducts';
import type { Product } from '../../types';

type SortKey = 'similarity' | 'price' | 'skin';

const SORTS: { key: SortKey; label: string; disabled?: boolean }[] = [
  { key: 'similarity', label: '유사도순' },
  { key: 'price', label: '가격 낮은순' },
  // 피부 궁합은 서버가 skinMatch를 주지 않아 판단 근거가 없다. 칩을 지우지 않고
  // 비활성으로 두는 이유는, Task 13·14에서 profiles·skin_type_rules가 채워지면
  // 이 한 줄만 지우면 아래 정렬 분기가 그대로 살아나기 때문이다.
  { key: 'skin', label: '내 피부 궁합', disabled: true },
];

/** 결과 목록 자리를 채우는 로딩 자리표시자. 카드 높이에 맞춘다. */
function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 4 }, (_, i) => (
        <div
          key={i}
          className="flex items-start gap-3 p-3 rounded-xl bg-gray-5 border border-gray-20 animate-pulse"
        >
          <div className="w-16 h-16 shrink-0 rounded-lg bg-gray-10" />
          <div className="flex-1 min-w-0">
            <div className="h-3 w-1/4 rounded bg-gray-10" />
            <div className="mt-2 h-3 w-3/4 rounded bg-gray-10" />
            <div className="mt-2 h-3 w-1/3 rounded bg-gray-10" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** 안내 한 덩어리. 오류·빈 결과·기준제품 없음이 모두 이 모양을 쓴다. */
function Notice({
  emoji,
  title,
  description,
  actionLabel,
  onAction,
}: {
  emoji: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <span className="text-4xl mb-3 opacity-40">{emoji}</span>
      <p className="text-sm font-semibold text-gray-100">{title}</p>
      {description && <p className="mt-1 text-sm text-gray-70">{description}</p>}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 rounded-full border border-gray-20 px-4 py-1.5 text-sm font-medium text-gray-100 active:scale-95 transition-transform"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/**
 * 성분 유사도를 낼 수 없는 기준제품의 대비책.
 *
 * 챗봇으로 직접 등록한 화장품처럼 카탈로그에 없는 제품이 여기 온다. 성분을
 * 모르니 대체품도 계산할 수 없지만, 빈 화면을 내미는 것보다는 같은 분류의
 * 실제 제품을 보여주는 편이 낫다. **유사도 뱃지가 달린 카드를 쓰지 않는
 * 이유가 여기 있다** — 점수가 없는데 카드가 점수 자리를 가지면 지어내게 된다.
 *
 * 폴백이 필요할 때만 마운트되도록 컴포넌트로 뺐다. 페이지 본문에서 훅을
 * 부르면 대체품이 정상인 경우에도 제품 목록을 한 번 더 받아온다.
 */
function CategoryFallback({ category }: { category: string }) {
  const { products, loading } = useProducts({ category, size: 6 });

  if (loading) return <ListSkeleton />;
  if (products.length === 0) {
    return (
      <Notice
        emoji="🔬"
        title="아직 보여드릴 제품이 없어요"
        description="성분 분석이 끝나면 대체품을 추천해 드릴게요."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-bold text-gray-100">같은 분류의 인기 제품</p>
        <p className="text-xs text-gray-70 mt-0.5">
          등록하신 제품은 성분 정보가 없어 유사도를 계산하지 못했어요
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {products.map((p, i) => (
          <ProductCard key={p.id} product={p} index={i} />
        ))}
      </div>
    </div>
  );
}

/** 대체품 결과 화면 — 검색/상품상세/내 화장대 3진입점 수렴 (/alternatives?seed=:id) */
export default function AlternativesPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  // seed가 없으면 없는 대로 다룬다. 예전에는 조용히 1로 떨어뜨렸는데, 실제
  // 데이터가 붙은 지금은 그게 '엉뚱한 제품을 기준제품이라고 우기기'가 된다.
  const rawSeed = params.get('seed');
  const seedId = rawSeed === null ? undefined : Number(rawSeed);
  const hasSeedParam = rawSeed !== null;

  // 방식 비교는 개발용이라 UI로 내지 않는다. 방식마다 점수 척도가 달라
  // ("유사도 61%"가 tfidf와 rbo에서 다른 의미다) 칩으로 노출하면 오해를 부른다.
  // URL로만 바꿀 수 있게 두면 UI 비용 없이 시연·QA에서 비교할 수 있다.
  const method = toSimilarMethod(params.get('method'));

  const { items: closetItems } = useCloset();
  const closetMatch = closetItems.find((c) => c.id === seedId);
  // 화장대 제품은 분석을 마쳐야 대체품을 찾는다. 막힌 동안은 조회도 하지 않는다.
  const notAnalyzed = !!closetMatch && closetMatch.status !== 'analyzed';

  const seedProduct = useProduct(seedId);
  const similar = useSimilarProducts(notAnalyzed ? undefined : seedId, {
    limit: 20,
    method,
    seedProduct: seedProduct.product,
  });

  // 헤더는 화장대 정보로 먼저 채운다 — 네트워크를 기다리지 않는다.
  // 카탈로그 응답이 도착하면 그쪽이 정본이다(가격·이미지가 실제 값이다).
  const seed: Product | undefined =
    seedProduct.product ??
    (closetMatch
      ? {
          id: closetMatch.id,
          brand: closetMatch.brand,
          name: closetMatch.name,
          category: closetMatch.category,
          imageUrl: closetMatch.imageUrl,
          price: closetMatch.price ?? 0,
        }
      : undefined);

  const [sort, setSort] = useState<SortKey>('similarity');

  const list = useMemo(() => {
    const arr = [...similar.alternatives];
    // 서버가 이미 점수 내림차순으로 주지만, 정렬을 오가도 복원되게 명시한다.
    if (sort === 'similarity') arr.sort((a, b) => b.similarityScore - a.similarityScore);
    // 20개 후보 안에서의 최저가다. 카탈로그 전체의 최저가가 아니다.
    if (sort === 'price') arr.sort((a, b) => a.price - b.price);
    if (sort === 'skin') {
      const ok = (v?: { verdict: string }) => (v?.verdict === 'good' ? 1 : 0);
      arr.sort(
        (a, b) => ok(b.skinMatch) - ok(a.skinMatch) || b.similarityScore - a.similarityScore,
      );
    }
    return arr;
  }, [similar.alternatives, sort]);

  // 기준제품 없이 들어온 경우(홈 배너·화장대 요약 카드) — 화장대에서 고르게 한다.
  if (!hasSeedParam) {
    return (
      <PageWrapper>
        <Header showBack title="내 화장대 대체품 찾기" />
        <ClosetSeedPicker />
      </PageWrapper>
    );
  }

  if (notAnalyzed) {
    return (
      <PageWrapper>
        <Header showBack title="대체품 추천" />
        <Notice
          emoji="🔬"
          title="아직 분석이 안 됐어요"
          description={`'${closetMatch.name}'은(는) 분석 전이에요. 내 화장대에서 분석하기를 누르면 대체품을 찾을 수 있어요.`}
          actionLabel="화장대에서 분석하기"
          onAction={() => navigate('/closet')}
        />
      </PageWrapper>
    );
  }

  // 카탈로그에 없고 화장대에도 없으면 정말 모르는 제품이다.
  if (seedProduct.notFound && !closetMatch) {
    return (
      <PageWrapper>
        <Header showBack title="대체품 추천" />
        <Notice
          emoji="🔍"
          title="존재하지 않는 제품이에요"
          description="주소를 다시 확인해 주세요."
          actionLabel="홈으로"
          onAction={() => navigate('/')}
        />
      </PageWrapper>
    );
  }

  // 화장대에만 있는 제품(챗봇 직접 등록 등)은 성분을 모른다 → 분류로 대신한다.
  const useFallback = seedProduct.notFound && !!closetMatch;

  return (
    <PageWrapper>
      <Header showBack title="대체품 추천" />

      {/* 기준제품 헤더 */}
      <div className="px-4 pt-3">
        <p className="text-xs text-gray-70 mb-2">
          {useFallback
            ? '등록하신 화장품과 같은 분류의 제품이에요'
            : '이 제품을 대신할 만한 추천이에요'}
        </p>
        <div className="flex items-center gap-3 p-3 rounded-xl bg-primary-light/60 border border-primary/15">
          {seed ? (
            <>
              <div className="w-14 h-14 rounded-lg overflow-hidden bg-white flex items-center justify-center shrink-0">
                {seed.imageUrl ? (
                  <img src={seed.imageUrl} alt={seed.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl opacity-40">🧴</span>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-70">{seed.brand}</p>
                <p className="text-sm font-bold text-gray-100 truncate">{seed.name}</p>
                {seed.price > 0 && (
                  <p className="text-sm font-bold text-gray-100 mt-0.5">
                    {seed.price.toLocaleString()}원
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="w-14 h-14 shrink-0 rounded-lg bg-white/70 animate-pulse" />
              <div className="flex-1 min-w-0 animate-pulse">
                <div className="h-3 w-1/4 rounded bg-white/70" />
                <div className="mt-2 h-3 w-2/3 rounded bg-white/70" />
                <div className="mt-2 h-3 w-1/3 rounded bg-white/70" />
              </div>
            </>
          )}
        </div>
      </div>

      {/* 정렬 칩 — 폴백은 유사도가 없어 정렬이 의미 없다 */}
      {!useFallback && (
        <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide">
          {SORTS.map((s) => {
            const on = s.key === sort;
            return (
              <button
                key={s.key}
                onClick={() => !s.disabled && setSort(s.key)}
                disabled={s.disabled}
                aria-disabled={s.disabled}
                title={s.disabled ? '준비 중이에요' : undefined}
                className={`shrink-0 px-3 h-8 rounded-full text-sm font-medium border transition-colors ${
                  s.disabled
                    ? 'bg-gray-5 text-gray-40 border-gray-20 cursor-not-allowed'
                    : on
                      ? 'bg-gray-100 text-white border-gray-100'
                      : 'bg-white text-gray-70 border-gray-20'
                }`}
              >
                {s.label}
                {s.disabled && <span className="ml-1 text-[10px]">준비 중</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* 결과 리스트 */}
      <div className={`px-4 pb-8 ${useFallback ? 'pt-3' : ''}`}>
        {useFallback && closetMatch ? (
          <CategoryFallback category={closetMatch.category} />
        ) : similar.loading ? (
          <ListSkeleton />
        ) : similar.error ? (
          <Notice
            emoji="⚠️"
            title="대체품을 불러오지 못했어요"
            description={similar.error}
            actionLabel="다시 시도"
            onAction={similar.reload}
          />
        ) : list.length === 0 && similar.variants.length === 0 ? (
          <Notice
            emoji="🔬"
            title="이 제품은 아직 성분 유사도 분석 전이에요"
            description="분석이 끝나면 대체품을 보여드릴게요."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {/* 성분 구성이 사실상 같은 제품. 대체품이라 부를 수 없어 갈라 둔다.
                용량만 다른 경우가 대부분이라 단가 비교로는 값이 있다. */}
            {similar.variants.length > 0 && (
              <>
                <div>
                  <p className="text-sm font-bold text-gray-100">같은 제품 · 용량만 달라요</p>
                  <p className="text-xs text-gray-70 mt-0.5">단가를 비교해 보세요</p>
                </div>
                {similar.variants.map((alt) => (
                  <AlternativeCard key={alt.id} alt={alt} />
                ))}
                {list.length > 0 && <div className="h-px bg-gray-20 my-1" />}
              </>
            )}

            {list.length > 0 ? (
              <>
                <p className="text-sm text-gray-70">
                  총 <span className="font-bold text-gray-100">{list.length}개</span>의 대체품
                </p>
                {list.map((alt) => (
                  <AlternativeCard key={alt.id} alt={alt} />
                ))}
              </>
            ) : (
              <p className="text-sm text-gray-70 py-4 text-center">
                용량이 다른 같은 제품 외에 비슷한 제품을 찾지 못했어요.
              </p>
            )}
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
