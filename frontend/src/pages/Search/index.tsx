import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { BottomNav } from '../../components/layout/BottomNav';
import { ProductCard } from '../../components/product/ProductCard';
import { SEED_PRODUCTS } from '../../mocks/alternatives';

// 내 화장대(등록·분석한 제품) — 대체품 찾기 기준제품
const MY_SHELF = Object.values(SEED_PRODUCTS);

const RECENT_SEARCHES = ['히알루론산 토너', '세라마이드 크림', '이니스프리'];
const TRENDING = ['선크림', '비타민C 세럼', '클렌징폼', '에센스', '앰플'];

// TODO: Task 6 완료 후 실제 검색 API 연동
const MOCK_RESULTS = [
  { id: 1, name: '수분 밸런싱 토너 200ml', brand: '이니스프리', category: '토너', price: 28000, originalPrice: 35000, discountRate: 20, rating: 4.5, reviewCount: 1203 },
  { id: 2, name: '히알루론산 에센스 50ml', brand: '코스알엑스', category: '에센스', price: 18000, rating: 4.3, reviewCount: 2341 },
];

export default function SearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = (q: string) => {
    setQuery(q);
    setIsSearching(q.length > 0);
  };

  return (
    <PageWrapper hasBottomNav>
      {/* 검색 헤더 */}
      <div className="sticky top-0 z-10 bg-white px-4 py-3 border-b border-gray-20">
        <div className="flex items-center gap-2 h-11 px-4 rounded-full bg-gray-10">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="var(--gray50)" strokeWidth="1.8" />
            <path d="M16.5 16.5L21 21" stroke="var(--gray50)" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            autoFocus
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="제품명, 브랜드, 성분 검색"
            className="flex-1 bg-transparent text-sm text-gray-100 outline-none placeholder:text-gray-50"
          />
          {query && (
            <button onClick={() => handleSearch('')} className="text-gray-50 active:scale-90 transition-transform">✕</button>
          )}
        </div>
      </div>

      <div className="px-4 py-4">
        {!isSearching ? (
          <>
            {/* 이미지 검색 */}
            <div
              className="flex flex-col items-center justify-center h-28 rounded-xl border-2 border-dashed mb-6 active:scale-[.98] transition-transform cursor-pointer"
              style={{ borderColor: 'var(--primary)' }}
            >
              <span className="text-2xl mb-1">📷</span>
              <p className="text-sm font-medium text-primary">사진으로 제품 찾기</p>
              <p className="text-xs text-gray-70 mt-0.5">제품 라벨을 촬영하면 AI가 분석해요</p>
            </div>

            {/* 내 화장대에서 고르기 → 대체품 찾기 */}
            {MY_SHELF.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-bold text-gray-100 mb-1">내 화장대에서 고르기</h3>
                <p className="text-xs text-gray-70 mb-2">등록한 제품의 대체품을 찾아보세요</p>
                <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4">
                  {MY_SHELF.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => navigate(`/alternatives?seed=${p.id}&from=search`)}
                      className="shrink-0 flex items-center gap-2 p-2 pr-3 rounded-xl border border-gray-20 bg-white active:scale-95 transition-transform"
                    >
                      <span className="w-10 h-10 rounded-lg overflow-hidden bg-gray-10 flex items-center justify-center shrink-0">
                        {p.imageUrl ? (
                          <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-lg opacity-40">🧴</span>
                        )}
                      </span>
                      <span className="text-left">
                        <span className="block text-[11px] text-gray-70">{p.brand}</span>
                        <span className="block text-xs font-semibold text-gray-100 truncate max-w-[110px]">
                          {p.name}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 최근 검색어 */}
            {RECENT_SEARCHES.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-gray-100">최근 검색어</h3>
                  <button className="text-xs text-gray-70">전체 삭제</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {RECENT_SEARCHES.map(s => (
                    <button
                      key={s}
                      onClick={() => handleSearch(s)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-10 text-sm text-gray-70 active:scale-95 transition-transform"
                    >
                      🕐 {s}
                      <span className="text-gray-50 text-xs">✕</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 인기 검색어 */}
            <div>
              <h3 className="text-sm font-bold text-gray-100 mb-2">인기 검색어</h3>
              <div className="flex flex-col gap-2">
                {TRENDING.map((s, i) => (
                  <button
                    key={s}
                    onClick={() => handleSearch(s)}
                    className="flex items-center gap-3 text-left active:opacity-60 transition-opacity"
                  >
                    <span className="text-sm font-bold text-primary w-5">{i + 1}</span>
                    <span className="text-sm text-gray-100">{s}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-70 mb-4">
              <span className="font-bold text-gray-100">"{query}"</span> 검색 결과 {MOCK_RESULTS.length}개
            </p>
            <div className="grid grid-cols-2 gap-3">
              {MOCK_RESULTS.map((p, i) => (
                <ProductCard key={p.id} product={p} index={i} />
              ))}
            </div>
          </>
        )}
      </div>

      <BottomNav />
    </PageWrapper>
  );
}
