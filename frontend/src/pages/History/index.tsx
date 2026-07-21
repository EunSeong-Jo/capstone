import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { BottomNav } from '../../components/layout/BottomNav';
import { ProductCard } from '../../components/product/ProductCard';
import { HistoryListCard } from '../../components/history/HistoryListCard';
import { AiInsightBanner } from '../../components/history/AiInsightBanner';
import { useRecentlyViewed } from '../../hooks/useRecentlyViewed';
import { useLikedProducts } from '../../context/LikedProductsContext';
import { AI_INSIGHT, RECENT_INTEREST_RECOMMENDATIONS, LIKED_ALSO_RECOMMENDATIONS } from '../../mocks/history';
import {
  FREQUENT_PURCHASE_CATEGORIES,
  FREQUENTLY_BOUGHT_PRODUCTS,
  FREQUENT_PURCHASE_RECOMMENDATIONS,
} from '../../mocks/frequentlyBought';

type HistoryTab = 'recent' | 'liked' | 'frequent';

const TABS: [HistoryTab, string][] = [
  ['recent', '최근 본'],
  ['liked', '좋아요 상품'],
  ['frequent', '자주 구매'],
];

function EmptyState({ emoji, title, subtitle }: { emoji: string; title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <span className="text-5xl">{emoji}</span>
      <p className="text-base font-semibold text-gray-100">{title}</p>
      <p className="text-sm text-gray-50">{subtitle}</p>
    </div>
  );
}

function RecentTab() {
  const { addedIds, toggleAdded } = useCart();
  const { items: recentlyViewed, clearRecentlyViewed } = useRecentlyViewed();
  const { isLiked, toggleLike } = useLikedProducts();

  return (
    <div className="px-4 py-4">
      <AiInsightBanner
        headline={AI_INSIGHT.headline}
        subtext={AI_INSIGHT.subtext}
        onAnalyze={() => alert('준비 중이에요')}
      />

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-gray-100">최근 본 상품</h2>
        {recentlyViewed.length > 0 && (
          <button onClick={clearRecentlyViewed} className="text-xs text-gray-70">전체삭제</button>
        )}
      </div>

      {recentlyViewed.length === 0 ? (
        <EmptyState emoji="🕐" title="아직 본 제품이 없어요" subtitle="제품을 둘러보면 여기에 기록돼요" />
      ) : (
        <div className="flex flex-col gap-3 mb-8">
          {recentlyViewed.map((p) => (
            <HistoryListCard
              key={p.id}
              product={p}
              liked={isLiked(p.id)}
              onToggleLike={() => toggleLike(p)}
              added={addedIds.has(p.id)}
              onAddToCart={() => toggleAdded(p.id)}
            />
          ))}
        </div>
      )}

      <section>
        <div className="flex items-center gap-1.5 mb-3">
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white bg-primary">AI추천</span>
          <h2 className="text-base font-bold text-gray-100">최근 관심 기반 추천</h2>
        </div>
        <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-4 px-4">
          {RECENT_INTEREST_RECOMMENDATIONS.map((p, i) => (
            <div key={p.id} className="w-[140px] shrink-0">
              <ProductCard product={p} index={i} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function LikedTab() {
  const { likedProducts, isLiked, toggleLike, clearLikedProducts } = useLikedProducts();
  const { addedIds, toggleAdded } = useCart();
  const [category, setCategory] = useState('전체');
  const [discountOnly, setDiscountOnly] = useState(false);

  const categories = useMemo(
    () => ['전체', ...Array.from(new Set(likedProducts.map((p) => p.category)))],
    [likedProducts],
  );

  const filtered = likedProducts
    .filter((p) => category === '전체' || p.category === category)
    .filter((p) => !discountOnly || p.discountRate);

  return (
    <div className="px-4 py-4">
      {likedProducts.length === 0 ? (
        <EmptyState emoji="🤍" title="아직 찜한 제품이 없어요" subtitle="마음에 드는 제품을 찜해보세요" />
      ) : (
        <>
          <div className="flex gap-2 mb-3 overflow-x-auto scrollbar-hide">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`shrink-0 px-3.5 py-1.5 rounded-full border text-sm font-medium transition-colors ${
                  category === c ? 'border-primary bg-primary text-white' : 'border-gray-20 text-gray-70 bg-white'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-70">총 {filtered.length}개</span>
              <label className="flex items-center gap-1.5 text-sm text-gray-70">
                <input
                  type="checkbox"
                  checked={discountOnly}
                  onChange={(e) => setDiscountOnly(e.target.checked)}
                  className="accent-primary"
                />
                할인 상품
              </label>
            </div>
            <button onClick={clearLikedProducts} className="text-xs text-gray-70">전체삭제</button>
          </div>

          <div className="flex flex-col gap-3 mb-8">
            {filtered.map((p) => (
              <HistoryListCard
                key={p.id}
                product={p}
                liked={isLiked(p.id)}
                onToggleLike={() => toggleLike(p)}
                added={addedIds.has(p.id)}
                onAddToCart={() => toggleAdded(p.id)}
              />
            ))}
          </div>
        </>
      )}

      <section>
        <h2 className="text-base font-bold text-gray-100 mb-3">이런 상품도 있어요!</h2>
        <div className="grid grid-cols-2 gap-3">
          {LIKED_ALSO_RECOMMENDATIONS.map((p, i) => (
            <ProductCard key={p.id} product={p} index={i} />
          ))}
        </div>
      </section>
    </div>
  );
}

function FrequentTab() {
  const { isLiked, toggleLike } = useLikedProducts();
  const { addedIds, toggleAdded } = useCart();
  const [category, setCategory] = useState(FREQUENT_PURCHASE_CATEGORIES[0]);
  const [sort, setSort] = useState<'purchase' | 'recent'>('purchase');

  const filtered = (
    category === '전체' ? FREQUENTLY_BOUGHT_PRODUCTS : FREQUENTLY_BOUGHT_PRODUCTS.filter((p) => p.category === category)
  ).slice();

  if (sort === 'purchase') {
    filtered.sort((a, b) => (b.purchaseCount ?? 0) - (a.purchaseCount ?? 0));
  }

  return (
    <div className="px-4 py-4">
      <div className="flex gap-2 mb-3 overflow-x-auto scrollbar-hide">
        {FREQUENT_PURCHASE_CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`shrink-0 px-3.5 py-1.5 rounded-full border text-sm font-medium transition-colors ${
              category === c ? 'border-primary bg-primary text-white' : 'border-gray-20 text-gray-70 bg-white'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-70">총 {filtered.length}개</span>
        <button
          onClick={() => setSort((s) => (s === 'purchase' ? 'recent' : 'purchase'))}
          className="text-sm text-gray-70"
        >
          {sort === 'purchase' ? '구매 많은순' : '최근 구매순'}
        </button>
      </div>

      <div className="flex flex-col gap-3 mb-8">
        {filtered.map((p) => (
          <HistoryListCard
            key={p.id}
            product={p}
            liked={isLiked(p.id)}
            onToggleLike={() => toggleLike(p)}
            added={addedIds.has(p.id)}
            onAddToCart={() => toggleAdded(p.id)}
            extraBadge={p.purchaseCount !== undefined ? `${p.purchaseCount}회 구매` : undefined}
          />
        ))}
      </div>

      <section>
        <h2 className="text-base font-bold text-gray-100 mb-3">재구매가 많은 다른 상품도 있어요!</h2>
        <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-4 px-4">
          {FREQUENT_PURCHASE_RECOMMENDATIONS.map((p, i) => (
            <div key={p.id} className="w-[140px] shrink-0">
              <ProductCard product={p} index={i} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// 장바구니 백엔드가 없어 세션 내에서만 "담김" 표시를 유지하는 임시 상태
function useCart() {
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());
  const toggleAdded = (id: number) => {
    setAddedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  return { addedIds, toggleAdded };
}

export default function HistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get('tab') as HistoryTab) || 'recent';

  return (
    <PageWrapper hasBottomNav>
      <div className="sticky top-0 z-10 bg-white border-b border-gray-20">
        <div className="flex items-center justify-between h-14 px-4">
          <h1 className="text-lg font-bold text-gray-100">History</h1>
          <button onClick={() => alert('준비 중이에요')} aria-label="장바구니" className="active:scale-90 transition-transform">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M6 8h12l-1 12H7L6 8z" stroke="var(--gray100)" strokeWidth="1.6" strokeLinejoin="round" />
              <path d="M9 8V6a3 3 0 016 0v2" stroke="var(--gray100)" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="flex px-4">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSearchParams({ tab: key })}
              className={`px-3 py-2.5 text-sm border-b-2 whitespace-nowrap ${
                tab === key ? 'font-bold text-primary border-primary' : 'text-gray-50 border-transparent'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'recent' && <RecentTab />}
      {tab === 'liked' && <LikedTab />}
      {tab === 'frequent' && <FrequentTab />}

      <BottomNav />
    </PageWrapper>
  );
}
