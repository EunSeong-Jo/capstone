import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { BottomNav } from '../../components/layout/BottomNav';
import { ProductCard } from '../../components/product/ProductCard';
import { HistoryListCard } from '../../components/history/HistoryListCard';
import { useRecentlyViewed } from '../../hooks/useRecentlyViewed';
import { useLikedProducts } from '../../context/liked';
import { useSimilarProducts } from '../../hooks/useSimilarProducts';
import { FrequentItemDto, fetchFrequent } from '../../api/personal';
import { useAuth } from '../../context/auth';
import { useCart } from '../../context/cart';

type HistoryTab = 'recent' | 'liked' | 'frequent';

const TABS: [HistoryTab, string][] = [
  ['recent', '최근 본'],
  ['liked', '좋아요 상품'],
  ['frequent', '자주 구매'],
];

/**
 * 기준 제품의 성분 유사 제품. 예전에는 이 자리에 mocks/history.ts의
 * 고정 목업(id 401~506)이 있었는데, 그 id가 실재 카탈로그 id와 겹쳐
 * 카드를 탭하면 전혀 다른 제품이 열렸다.
 *
 * 기준이 없거나(목록이 비었거나) 유사도가 아직 없으면 섹션을 그리지 않는다.
 */
function SimilarSection({
  title,
  seedId,
  layout = 'scroll',
}: {
  title: string;
  seedId: number | undefined;
  layout?: 'scroll' | 'grid';
}) {
  const { alternatives } = useSimilarProducts(seedId, { limit: 6 });
  if (!seedId || alternatives.length === 0) return null;

  return (
    <section>
      <h2 className="text-base font-bold text-gray-100 mb-3">{title}</h2>
      {layout === 'grid' ? (
        <div className="grid grid-cols-2 gap-3">
          {alternatives.map((p, i) => (
            <ProductCard key={p.id} product={p} index={i} />
          ))}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-4 px-4">
          {alternatives.map((p, i) => (
            <div key={p.id} className="w-[140px] shrink-0">
              <ProductCard product={p} index={i} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function EmptyState({ emoji, title, subtitle }: { emoji: string; title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <span className="text-5xl">{emoji}</span>
      <p className="text-base font-semibold text-gray-100">{title}</p>
      <p className="text-sm text-gray-50">{subtitle}</p>
    </div>
  );
}

export function RecentTab() {
  const { inCart, addToCart } = useCart();
  const { items: recentlyViewed, clearRecentlyViewed } = useRecentlyViewed();
  const { isLiked, toggleLike } = useLikedProducts();

  return (
    <div className="px-4 py-4">
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
              added={inCart(p.id)}
              onAddToCart={() =>
                addToCart({
                  id: p.id,
                  name: p.name,
                  brand: p.brand,
                  price: p.price,
                  imageUrl: p.imageUrl,
                })
              }
            />
          ))}
        </div>
      )}

      <SimilarSection
        title="최근 본 제품과 성분이 비슷한 제품"
        seedId={recentlyViewed[0]?.id}
      />
    </div>
  );
}

export function LikedTab() {
  const { likedProducts, isLiked, toggleLike, clearLikedProducts } = useLikedProducts();
  const { inCart, addToCart } = useCart();
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
                added={inCart(p.id)}
                onAddToCart={() =>
                  addToCart({
                    id: p.id,
                    name: p.name,
                    brand: p.brand,
                    price: p.price,
                    imageUrl: p.imageUrl,
                  })
                }
              />
            ))}
          </div>
        </>
      )}

      <SimilarSection
        title="찜한 제품과 성분이 비슷한 제품"
        seedId={likedProducts[0]?.id}
        layout="grid"
      />
    </div>
  );
}

export function FrequentTab() {
  // 실제 주문 기록에서 집계한다(GET /me/orders/frequent). 예전에는 이 탭
  // 전체가 mocks/frequentlyBought.ts의 고정 목업이었는데, id 201~303이 실재
  // 카탈로그 id와 겹쳐 "3회 구매"라고 적힌 카드를 탭하면 처음 보는 제품이
  // 열렸다.
  const { isUser, loading: authLoading } = useAuth();
  const { isLiked, toggleLike } = useLikedProducts();
  const { inCart, addToCart } = useCart();
  const [rows, setRows] = useState<FrequentItemDto[] | null>(null);

  useEffect(() => {
    // 비회원은 조회하지 않는다. 주문 기록은 계정에 묶여 있다.
    if (authLoading || !isUser) return;
    fetchFrequent()
      .then(setRows)
      .catch(() => setRows([]));
  }, [isUser, authLoading]);

  // rows가 null이면 아직 응답이 오지 않은 것이다. 비회원은 조회 자체를
  // 하지 않으므로 로딩이 아니라 바로 빈 상태로 간다.
  const loading = isUser && rows === null;

  if (loading) {
    return (
      <div className="animate-pulse space-y-3 px-4 py-4">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-24 rounded-xl bg-white" />
        ))}
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="px-4 py-4">
        <EmptyState
          emoji="🧾"
          title={isUser ? '아직 구매 기록이 없어요' : '로그인하면 볼 수 있어요'}
          subtitle="주문하면 자주 사는 제품을 여기 모아드려요"
        />
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      <div className="mb-3 text-sm text-gray-70">총 {rows.length}개</div>
      <div className="mb-8 flex flex-col gap-3">
        {rows.map((r) => (
          <HistoryListCard
            key={r.product.id}
            product={r.product}
            liked={isLiked(r.product.id)}
            onToggleLike={() => toggleLike(r.product)}
            added={inCart(r.product.id)}
            onAddToCart={() =>
              addToCart({
                id: r.product.id,
                name: r.product.name,
                brand: r.product.brand,
                price: r.product.price,
                imageUrl: r.product.imageUrl,
              })
            }
            extraBadge={`${r.purchaseCount}회 구매`}
          />
        ))}
      </div>

      <SimilarSection
        title="자주 사는 제품과 성분이 비슷한 제품"
        seedId={rows[0]?.product.id}
      />
    </div>
  );
}

export default function HistoryPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get('tab') as HistoryTab) || 'recent';

  return (
    <PageWrapper hasBottomNav className="bg-surface-warm">
      <div className="sticky top-0 z-10 bg-surface-warm border-b border-gray-20">
        <div className="flex items-center justify-between h-14 px-4">
          <h1 className="text-lg font-bold text-gray-100">History</h1>
          <button onClick={() => navigate('/cart')} aria-label="장바구니" className="active:scale-90 transition-transform">
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
