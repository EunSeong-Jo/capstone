import { useState } from 'react';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { BottomNav } from '../../components/layout/BottomNav';
import { SkinTypeBadge } from '../../components/skin/SkinTypeBadge';
import { ProductCard } from '../../components/product/ProductCard';
import { useNavigate } from 'react-router-dom';

type SortBy = 'recommended' | 'price';

// TODO: Task 14 완료 후 실제 API 연동
const MOCK_PRODUCTS = [
  { id: 1, name: '수분 밸런싱 토너 200ml', brand: '이니스프리', category: '토너', imageUrl: 'https://picsum.photos/seed/prod1/200/200', price: 28000, originalPrice: 35000, discountRate: 20, rating: 4.5, reviewCount: 1203, isBest: true },
  { id: 2, name: '세라마이드 수분 크림 60ml', brand: '닥터자르트', category: '크림', imageUrl: 'https://picsum.photos/seed/prod2/200/200', price: 42000, rating: 4.7, reviewCount: 892, isNew: true },
  { id: 3, name: '히알루론산 에센스 50ml', brand: '코스알엑스', category: '에센스', imageUrl: 'https://picsum.photos/seed/prod3/200/200', price: 18000, originalPrice: 22000, discountRate: 18, rating: 4.3, reviewCount: 2341 },
  { id: 4, name: '순한 거품 클렌저 150ml', brand: '아벤느', category: '클렌저', imageUrl: 'https://picsum.photos/seed/prod4/200/200', price: 15000, rating: 4.4, reviewCount: 567 },
];

const CATEGORIES = ['전체', '스킨/토너', '에센스', '크림', '세럼', '선크림', '클렌저'];

export default function HomePage() {
  const navigate = useNavigate();
  const [sortBy, setSortBy] = useState<SortBy>('recommended');

  const sortedProducts = [...MOCK_PRODUCTS].sort((a, b) =>
    sortBy === 'price' ? a.price - b.price : 0
  );

  return (
    <PageWrapper hasBottomNav>
      {/* 헤더 */}
      <header className="sticky top-0 z-10 flex items-center justify-between h-14 px-4 bg-white border-b border-gray-20">
        <h1 className="text-lg font-black text-gray-100">
          대체<span className="text-accent">뭐야</span>
        </h1>
        <div className="flex items-center gap-3">
          <button className="active:scale-90 transition-transform" aria-label="알림">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"
                stroke="var(--gray100)" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          <button className="active:scale-90 transition-transform" aria-label="찜목록">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 21C12 21 3 14.5 3 8.5C3 5.42 5.42 3 8.5 3C10.24 3 11.91 3.81 13 5.08C14.09 3.81 15.76 3 17.5 3C20.58 3 23 5.42 23 8.5C23 14.5 12 21 12 21Z"
                stroke="var(--gray100)" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </header>

      {/* 검색바 */}
      <div className="px-4 py-3">
        <button
          onClick={() => navigate('/search')}
          className="w-full h-11 px-4 rounded-full bg-gray-10 flex items-center gap-2 active:scale-[.98] transition-transform"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="var(--gray50)" strokeWidth="1.8" />
            <path d="M16.5 16.5L21 21" stroke="var(--gray50)" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span className="text-sm text-gray-50">제품명, 브랜드, 성분 검색</span>
          <svg className="ml-auto" width="18" height="18" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="4" width="18" height="2" rx="1" fill="var(--gray50)" />
            <path d="M21 8H9M15 12H3M21 16H9" stroke="var(--gray50)" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* 피부타입 배지 */}
      <div className="mb-3">
        <SkinTypeBadge skinType="ondalsam" onRediagnose={() => navigate('/qna')} />
      </div>

      {/* 카테고리 칩 */}
      <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-hide">
        {CATEGORIES.map((cat, i) => (
          <button
            key={cat}
            className="flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors active:scale-95"
            style={{
              background: i === 0 ? 'var(--primary)' : 'var(--gray10)',
              color: i === 0 ? 'white' : 'var(--gray70)',
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* 내 타입 추천 섹션 */}
      <section className="px-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-gray-100">내 타입 인기 제품</h2>
          <div className="flex items-center gap-2">
            {/* 정렬 옵션 */}
            <div className="flex rounded-full overflow-hidden border border-gray-20">
              {(['recommended', 'price'] as SortBy[]).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setSortBy(opt)}
                  className="px-3 py-1 text-xs font-medium transition-colors"
                  style={{
                    background: sortBy === opt ? 'var(--primary)' : 'white',
                    color: sortBy === opt ? 'white' : 'var(--gray70)',
                  }}
                >
                  {opt === 'recommended' ? '추천순' : '가격순'}
                </button>
              ))}
            </div>
            {/* 장바구니 버튼 */}
            <button
              className="flex items-center gap-1 text-xs text-gray-70 active:scale-95 transition-transform"
              onClick={() => {}}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"
                  stroke="var(--gray70)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M3 6h18M16 10a4 4 0 01-8 0"
                  stroke="var(--gray70)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              장바구니
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {sortedProducts.map((p, i) => (
            <ProductCard key={p.id} product={p} index={i} />
          ))}
        </div>
      </section>

      <BottomNav />
    </PageWrapper>
  );
}
