import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { TopNavBar } from '../../components/category/TopNavBar';
import { CategoryTabs } from '../../components/category/CategoryTabs';
import { RankedProductCard } from '../../components/category/RankedProductCard';
import { ProductCard } from '../../components/category/ProductCard';
import { Icon } from '../../components/category/Icon';
import { OyBottomNav } from '../../components/home/oy/OyBottomNav';
import { findCategory } from '../../data/categories';
import { useProducts } from '../../hooks/useProducts';
import { useCart } from '../../context/cart';
import { useLikedProducts } from '../../context/liked';
import type { ProductSort } from '../../api/products';
import type { CategoryProduct } from '../../components/category/types';
import type { Product } from '../../types';

/**
 * 카테고리 상품 목록 — `/category/:code`.
 *
 * 예전에는 화면 전체가 목업이었다. 상품 4벌(BEST/추천/프로모/전체)이 전부
 * 같은 문구의 복제였고 id가 `'b1'`,`'r1'` 같은 문자열이라, 카드를 탭하면
 * `/detail/b1` → `Number('b1')=NaN`으로 "없는 제품" 화면이 떴다.
 *
 * 탭은 소분류가 아니라 **정렬**이다. DB의 스킨케어 1,281건에 토너/세럼/크림
 * 소분류가 없어(categories.parent_id 미적재) 소분류 탭을 그리면 누를 때마다
 * 같은 목록이 나오기 때문이다.
 */

const SORTS: { key: ProductSort; label: string }[] = [
  { key: 'popular', label: '인기순' },
  { key: 'rating', label: '평점순' },
  { key: 'priceAsc', label: '가격 낮은순' },
  { key: 'priceDesc', label: '가격 높은순' },
];

const PAGE_SIZE = 20;

/** 카탈로그 제품 → 카테고리 카드가 읽는 모양. */
function toCard(p: Product, isFavorite: boolean): CategoryProduct {
  return {
    id: p.id,
    imageUrl: p.imageUrl,
    title: p.name,
    price: p.price,
    isFavorite,
  };
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 animate-pulse">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i}>
          <div className="aspect-square w-full rounded-md bg-gray-10" />
          <div className="mt-3 h-3 w-full rounded bg-gray-10" />
          <div className="mt-1.5 h-3 w-2/3 rounded bg-gray-10" />
        </div>
      ))}
    </div>
  );
}

export default function CategoryPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [sort, setSort] = useState<ProductSort>('popular');
  const [page, setPage] = useState(1);

  const { addToCart } = useCart();
  const { isLiked, toggleLike } = useLikedProducts();

  const category = findCategory(code);

  const { products, total, loading, error, reload } = useProducts(
    category ? { category: category.label, sort, page, size: PAGE_SIZE } : { size: 0 },
  );

  // 알 수 없는 카테고리로 들어온 경우. 빈 목록을 그리는 대신 바로 알린다.
  if (!category) {
    return (
      <div className="min-h-dvh bg-white">
        <TopNavBar title="카테고리" />
        <div className="px-4 py-16 text-center">
          <p className="text-sm text-gray-70">없는 카테고리예요.</p>
          <button
            type="button"
            onClick={() => navigate('/category')}
            className="mt-3 rounded-full border border-gray-20 px-4 py-1.5 text-sm font-medium active:scale-95"
          >
            카테고리로 돌아가기
          </button>
        </div>
        <OyBottomNav />
      </div>
    );
  }

  const onSortChange = (label: string) => {
    const next = SORTS.find((s) => s.label === label);
    if (!next) return;
    setSort(next.key);
    setPage(1);
  };

  // 인기순 1페이지에서만 상위 5개를 랭킹 카드로 띄운다. 다른 정렬에서는
  // "BEST"라고 부를 근거가 없다.
  const showRanking = sort === 'popular' && page === 1;
  const ranked = showRanking ? products.slice(0, 5) : [];
  const grid = showRanking ? products.slice(5) : products;

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div
      className="min-h-dvh bg-white"
      style={{ paddingBottom: 'calc(var(--bottom-nav-h) + var(--safe-bottom))' }}
    >
      <TopNavBar title={category.label} />
      <CategoryTabs
        tabs={SORTS.map((s) => s.label)}
        active={SORTS.find((s) => s.key === sort)!.label}
        onChange={onSortChange}
      />

      <div className="flex items-center justify-between px-4 mt-5 mb-4">
        <span className="text-sm text-gray-70">총 {total.toLocaleString()}개</span>
        <span className="flex items-center gap-0.5 text-sm text-gray-100">
          {SORTS.find((s) => s.key === sort)!.label}
          <Icon name="arrow_drop_down" size={24} />
        </span>
      </div>

      {error ? (
        <div className="px-4 py-16 text-center">
          <p className="text-sm text-gray-70">{error}</p>
          <button
            type="button"
            onClick={reload}
            className="mt-3 rounded-full border border-gray-20 px-4 py-1.5 text-sm font-medium active:scale-95"
          >
            다시 시도
          </button>
        </div>
      ) : loading && products.length === 0 ? (
        <section className="px-4 pb-8">
          <GridSkeleton />
        </section>
      ) : (
        <>
          {ranked.length > 0 && (
            <section className="px-4">
              <h2 className="text-lg font-bold text-gray-100 mb-4">
                {category.label} 인기 상품
              </h2>
              <div className="flex flex-col gap-4">
                {ranked.map((p, i) => (
                  <RankedProductCard
                    key={p.id}
                    rank={i + 1}
                    product={toCard(p, isLiked(p.id))}
                    onToggleFavorite={() => toggleLike(p)}
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
            </section>
          )}

          <section className="px-4 mt-8 pb-8">
            <div className="grid grid-cols-2 gap-x-4 gap-y-8">
              {grid.map((p) => (
                <ProductCard
                  key={p.id}
                  product={toCard(p, isLiked(p.id))}
                  onToggleFavorite={() => toggleLike(p)}
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

            {lastPage > 1 && (
              <div className="mt-8 flex items-center justify-center gap-4">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((n) => n - 1)}
                  className="rounded-full border border-gray-20 px-4 py-1.5 text-sm font-medium disabled:opacity-40 active:scale-95"
                >
                  이전
                </button>
                <span className="text-sm text-gray-70">
                  {page} / {lastPage}
                </span>
                <button
                  type="button"
                  disabled={page >= lastPage}
                  onClick={() => setPage((n) => n + 1)}
                  className="rounded-full border border-gray-20 px-4 py-1.5 text-sm font-medium disabled:opacity-40 active:scale-95"
                >
                  다음
                </button>
              </div>
            )}
          </section>
        </>
      )}

      <OyBottomNav />
    </div>
  );
}
