import { useMemo, useState } from 'react';
import { TopNavBar } from '../../components/category/TopNavBar';
import { CategoryTabs } from '../../components/category/CategoryTabs';
import { RankedProductCard } from '../../components/category/RankedProductCard';
import { ProductCard } from '../../components/category/ProductCard';
import { PromoBannerCarousel } from '../../components/category/PromoBannerCarousel';
import { Icon } from '../../components/category/Icon';
import placeholderImage from '../../assets/placeholderImage';
import type { CategoryProduct } from '../../components/category/types';
import { useAuth } from '../../context/AuthContext';
import { useDiagnosis } from '../../context/DiagnosisContext';
import { SKIN_TYPE_META, SkinType } from '../../types';

const TABS = ['전체', '스킨/토너', '에센스/세럼/앰플', '크림', '로션', '미스트/오일', '스킨케어세트'];
const DEFAULT_SKIN: SkinType = 'ondalsam';
const SORT_OPTIONS = ['인기순', '가격 낮은순', '가격 높은순'] as const;
type SortOption = (typeof SORT_OPTIONS)[number];

// TODO: 실제 API 연동 전까지 목데이터, 실제 상품 이미지로 교체 필요

// '전체' 탭: BEST 랭킹 + 추천상품 그리드
const BEST_PRODUCTS: CategoryProduct[] = [
  { id: 'b1', imageUrl: placeholderImage, title: 'BEST | [이달의 픽/한정기획] 아누아 피디알엔 히알루론산 수분 앰플 100ml', price: 16900 },
  { id: 'b2', imageUrl: placeholderImage, title: 'BEST | [이달의 픽/한정기획] 아누아 피디알엔 히알루론산 수분 캡슐 미스트 100ml 2입 기획', price: 16900, originalPrice: 70000, discountPercent: 53 },
  { id: 'b3', imageUrl: placeholderImage, title: 'BEST | [2026어워즈1위] 에스트라 아토베리어365 크림 80ml 기획(+하이드로 에센스 25ml + 앰플)', price: 16900 },
  { id: 'b4', imageUrl: placeholderImage, title: 'BEST | [이달의 픽/한정기획] 아누아 피디알엔 히알루론산 수분 앰플 100ml', price: 16900 },
  { id: 'b5', imageUrl: placeholderImage, title: 'BEST | [이달의 픽/한정기획] 아누아 피디알엔 히알루론산 수분 앰플 100ml', price: 16900 },
];

const RECOMMENDED_PRODUCTS: CategoryProduct[] = Array.from({ length: 10 }, (_, i) => ({
  id: `r${i + 1}`,
  imageUrl: placeholderImage,
  title: 'BEST | [이달의 픽/한정기획] 아누아 피디알엔 히알루론산 수분 앰플 100ml',
  price: 16900,
  originalPrice: 70000,
  discountPercent: 53,
}));

// 그 외 탭(스킨/토너 등): 프로모 배너 + 전체상품 그리드
const PROMO_PRODUCTS: CategoryProduct[] = [
  { id: 'p1', imageUrl: placeholderImage, title: 'BEST | [이달의 픽/한정기획] 아누아 피디알엔 히알루론산 수분 앰플 100ml', price: 16900, originalPrice: 70000, discountPercent: 53 },
  { id: 'p2', imageUrl: placeholderImage, title: 'BEST | [이달의 픽/한정기획] 아누아 피디알엔 히알루론산 수분 앰플 100ml', price: 16900, originalPrice: 70000, discountPercent: 53 },
  { id: 'p3', imageUrl: placeholderImage, title: 'BEST | [이달의 픽/한정기획] 아누아 피디알엔 히알루론산 수분 앰플 100ml', price: 16900, originalPrice: 70000, discountPercent: 53 },
];

const ALL_PRODUCTS: CategoryProduct[] = Array.from({ length: 10 }, (_, i) => ({
  id: `a${i + 1}`,
  imageUrl: placeholderImage,
  title: 'BEST | [이달의 픽/한정기획] 아누아 피디알엔 히알루론산 수분 앰플 100ml',
  price: 16900,
  originalPrice: 70000,
  discountPercent: 53,
}));

export default function CategoryPage() {
  const { user: persona } = useAuth();
  const { skinType: diagType } = useDiagnosis();
  const skinType: SkinType = diagType ?? persona?.skinType ?? DEFAULT_SKIN;
  const skinTypeLabel = SKIN_TYPE_META[skinType].label;

  const [tab, setTab] = useState('전체');
  const [bestProducts, setBestProducts] = useState(BEST_PRODUCTS);
  const [recommended, setRecommended] = useState(RECOMMENDED_PRODUCTS);
  const [promoProducts, setPromoProducts] = useState(PROMO_PRODUCTS);
  const [allProducts, setAllProducts] = useState(ALL_PRODUCTS);
  const [sortOpen, setSortOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('인기순');

  const isOverview = tab === '전체';

  const sortedProducts = useMemo(() => {
    if (sortBy === '가격 낮은순') return [...allProducts].sort((a, b) => a.price - b.price);
    if (sortBy === '가격 높은순') return [...allProducts].sort((a, b) => b.price - a.price);
    return allProducts;
  }, [allProducts, sortBy]);

  const toggleFavorite = (id: string) => {
    setBestProducts((prev) => prev.map((p) => (p.id === id ? { ...p, isFavorite: !p.isFavorite } : p)));
    setRecommended((prev) => prev.map((p) => (p.id === id ? { ...p, isFavorite: !p.isFavorite } : p)));
    setPromoProducts((prev) => prev.map((p) => (p.id === id ? { ...p, isFavorite: !p.isFavorite } : p)));
    setAllProducts((prev) => prev.map((p) => (p.id === id ? { ...p, isFavorite: !p.isFavorite } : p)));
  };
  const addToCart = (id: string) => console.log('add to cart', id);

  return (
    <div className="min-h-dvh bg-white">
      <TopNavBar title="스킨케어" />
      <CategoryTabs tabs={TABS} active={tab} onChange={setTab} />

      {isOverview ? (
        <>
          <div className="mx-4 mt-4 aspect-[378/302] rounded-md overflow-hidden bg-gray-10">
            <img src={placeholderImage} alt="배너" className="w-full h-full object-cover" />
          </div>
          <div className="flex justify-center gap-3 mt-2">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-100" />
            <span className="w-1.5 h-1.5 rounded-full bg-gray-20" />
            <span className="w-1.5 h-1.5 rounded-full bg-gray-20" />
          </div>

          <section className="px-4 mt-6">
            <h2 className="text-lg font-bold text-gray-100 mb-4">{skinTypeLabel} 타입의 스킨케어 BEST</h2>
            <div className="flex flex-col gap-4">
              {bestProducts.map((p, i) => (
                <RankedProductCard
                  key={p.id}
                  rank={i + 1}
                  product={p}
                  onToggleFavorite={toggleFavorite}
                  onAddToCart={addToCart}
                />
              ))}
            </div>
            <button
              type="button"
              className="mt-4 w-full h-[38px] rounded-md border border-gray-20 text-sm text-gray-70"
            >
              인기 상품 더보기
            </button>
          </section>

          <section className="px-4 mt-8 pb-8">
            <h2 className="text-lg font-bold text-gray-100 mb-4">{skinTypeLabel} 타입이 많이 본 상품이에요</h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-8">
              {recommended.map((p) => (
                <ProductCard key={p.id} product={p} onToggleFavorite={toggleFavorite} onAddToCart={addToCart} />
              ))}
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="mt-6">
            <h2 className="px-4 text-lg font-bold text-gray-100 mb-4">{skinTypeLabel} 타입의 스킨케어 BEST</h2>
            <PromoBannerCarousel products={promoProducts} />
          </section>

          <div className="relative flex items-center justify-between px-4 mt-8 mb-4">
            <span className="text-sm text-gray-70">총 {allProducts.length * 34 + 5}개</span>
            <button
              type="button"
              onClick={() => setSortOpen((v) => !v)}
              className="flex items-center gap-0.5 text-sm text-gray-100"
            >
              {sortBy}
              <Icon name="arrow_drop_down" size={24} className={`transition-transform ${sortOpen ? 'rotate-180' : ''}`} />
            </button>
            {sortOpen && (
              <>
                <button
                  aria-label="닫기"
                  onClick={() => setSortOpen(false)}
                  className="fixed inset-0 z-10 cursor-default"
                />
                <div className="absolute top-full right-4 z-20 w-32 overflow-hidden rounded-xl bg-white shadow-lg border border-gray-10">
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => { setSortBy(opt); setSortOpen(false); }}
                      className={`w-full px-4 py-2.5 text-left text-sm border-b border-gray-10 last:border-b-0 ${
                        opt === sortBy ? 'font-bold text-primary' : 'text-gray-100'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <section className="px-4 pb-8">
            <div className="grid grid-cols-2 gap-x-4 gap-y-8">
              {sortedProducts.map((p) => (
                <ProductCard key={p.id} product={p} onToggleFavorite={toggleFavorite} onAddToCart={addToCart} />
              ))}
            </div>
          </section>
        </>
      )}

      {/* 페이지 끝을 나타내는 자리 표시자 — 실제 이미지 아님, 의도적으로 회색 도형 유지 */}
      <div className="aspect-[402/308] bg-gray-10" />
    </div>
  );
}
