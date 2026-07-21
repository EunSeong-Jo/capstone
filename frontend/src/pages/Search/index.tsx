import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { BottomNav } from '../../components/layout/BottomNav';
import { ProductCard } from '../../components/product/ProductCard';
import { SEED_PRODUCTS } from '../../mocks/alternatives';
import {
  POPULAR_SEARCH_FILTERS,
  POPULAR_SEARCH_RANKING,
  SEARCH_AD_BANNER,
  REALTIME_BEST,
  INGREDIENT_DICTIONARY,
} from '../../mocks/search';
import { useRecentSearches } from '../../hooks/useRecentSearches';
import { useMyIngredients } from '../../hooks/useMyIngredients';
import { ScannerModal } from './ScannerModal';

// 내 화장대(등록·분석한 제품) — 대체품 찾기 기준제품
const MY_SHELF = Object.values(SEED_PRODUCTS);

// TODO: Task 6 완료 후 실제 검색 API 연동
const MOCK_RESULTS = [
  { id: 1, name: '수분 밸런싱 토너 200ml', brand: '이니스프리', category: '토너', price: 28000, originalPrice: 35000, discountRate: 20, rating: 4.5, reviewCount: 1203 },
  { id: 2, name: '히알루론산 에센스 50ml', brand: '코스알엑스', category: '에센스', price: 18000, rating: 4.3, reviewCount: 2341 },
];

type MainTab = 'general' | 'ingredient';
type IngredientSubTab = 'dict' | 'my';

function RecentSearchChips({
  items,
  onSearch,
  onRemove,
  onClearAll,
}: {
  items: string[];
  onSearch: (q: string) => void;
  onRemove: (q: string) => void;
  onClearAll: () => void;
}) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-gray-100">최근 검색 항목</h3>
        {items.length > 0 && (
          <button onClick={onClearAll} className="text-xs text-gray-70">전체삭제</button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-gray-50">최근 검색 항목이 없습니다.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((s) => (
            <span
              key={s}
              className="flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full bg-gray-10 text-sm text-gray-70"
            >
              <button onClick={() => onSearch(s)} className="active:opacity-60 transition-opacity">{s}</button>
              <button
                onClick={() => onRemove(s)}
                aria-label={`${s} 삭제`}
                className="text-gray-50 text-xs active:scale-90 transition-transform"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  const navigate = useNavigate();
  const [mainTab, setMainTab] = useState<MainTab>('general');
  const [ingredientSubTab, setIngredientSubTab] = useState<IngredientSubTab>('dict');
  const [popularFilter, setPopularFilter] = useState<(typeof POPULAR_SEARCH_FILTERS)[number]>(POPULAR_SEARCH_FILTERS[0]);
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const generalSearches = useRecentSearches('general');
  const ingredientSearches = useRecentSearches('ingredient');
  const myIngredients = useMyIngredients();

  const handleSearch = (q: string) => {
    setQuery(q);
    const searching = q.trim().length > 0;
    setIsSearching(searching);
    if (searching) {
      (mainTab === 'general' ? generalSearches : ingredientSearches).addSearch(q.trim());
    }
  };

  return (
    <PageWrapper hasBottomNav>
      {/* 검색 헤더 */}
      <div className="sticky top-0 z-10 bg-white px-4 py-3 border-b border-gray-20">
        {/* 통합검색 / 성분검색 토글 */}
        <div className="flex p-1 mb-3 rounded-full bg-gray-10">
          {([
            ['general', '통합검색'],
            ['ingredient', '성분검색'],
          ] as [MainTab, string][]).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => { setMainTab(tab); handleSearch(''); }}
              className={`flex-1 py-1.5 rounded-full text-sm font-bold transition-colors ${
                mainTab === tab ? 'bg-primary text-white shadow-sm' : 'text-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 h-11 px-4 rounded-full bg-gray-10">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="var(--gray50)" strokeWidth="1.8" />
              <path d="M16.5 16.5L21 21" stroke="var(--gray50)" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <input
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder={mainTab === 'general' ? '제품명이나 성분명으로 찾아보세요' : '성분으로 검색해 보세요'}
              className="flex-1 bg-transparent text-sm text-gray-100 outline-none placeholder:text-gray-50"
            />
            {query && (
              <button onClick={() => handleSearch('')} className="text-gray-50 active:scale-90 transition-transform">✕</button>
            )}
          </div>
          {mainTab === 'general' ? (
            <button
              onClick={() => alert('준비 중이에요')}
              aria-label="사진으로 제품 찾기"
              title="사진으로 제품 찾기"
              className="shrink-0 w-11 h-11 rounded-xl bg-primary-light flex items-center justify-center text-xl active:scale-95 transition-transform"
            >
              📷
            </button>
          ) : (
            <button
              onClick={() => setShowScanner(true)}
              aria-label="스마트 성분 스캔"
              title="스마트 성분 스캔"
              className="shrink-0 w-11 h-11 rounded-xl bg-primary-light flex items-center justify-center text-xl active:scale-95 transition-transform"
            >
              📸
            </button>
          )}
        </div>
      </div>

      <div className="px-4 py-4">
        {mainTab === 'general' ? (
          isSearching ? (
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
          ) : (
            <>
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

              <RecentSearchChips
                items={generalSearches.items}
                onSearch={handleSearch}
                onRemove={generalSearches.removeSearch}
                onClearAll={generalSearches.clearSearches}
              />

              {/* 인기 검색어 */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-gray-100">인기 검색어</h3>
                </div>
                <div className="flex gap-2 mb-3">
                  {POPULAR_SEARCH_FILTERS.map((f) => (
                    <button
                      key={f}
                      onClick={() => setPopularFilter(f)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                        popularFilter === f
                          ? 'border-primary text-primary bg-primary-light'
                          : 'border-gray-20 text-gray-50 bg-white'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {POPULAR_SEARCH_RANKING.map((s, i) => (
                    <button
                      key={s}
                      onClick={() => handleSearch(s)}
                      className="flex items-center gap-3 text-left active:opacity-60 transition-opacity"
                    >
                      <span className={`text-sm font-bold w-5 ${i < 8 ? 'text-primary' : 'text-gray-50'}`}>{i + 1}</span>
                      <span className="text-sm text-gray-100 truncate">{s}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 배너 */}
              <div className="flex items-center gap-3 p-4 rounded-xl bg-primary-light mb-6">
                <span className="text-3xl">🎁</span>
                <div>
                  <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold text-white bg-primary mb-1">
                    {SEARCH_AD_BANNER.label}
                  </span>
                  <p className="text-sm font-semibold text-gray-100 leading-snug">
                    {SEARCH_AD_BANNER.title}
                    <br />
                    {SEARCH_AD_BANNER.subtitle}
                  </p>
                </div>
              </div>

              {/* 실시간 판매 BEST */}
              <div>
                <div className="flex items-center gap-1 mb-3">
                  <h3 className="text-sm font-bold text-gray-100">실시간 판매 BEST</h3>
                  <span className="text-xs text-gray-50">ⓘ {REALTIME_BEST.updatedAt}</span>
                </div>
                <button
                  onClick={() => navigate(`/detail/${REALTIME_BEST.product.rank}`)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-20 active:scale-[.98] transition-transform"
                >
                  <span className="text-lg font-black text-primary shrink-0">{REALTIME_BEST.product.rank}</span>
                  <span className="w-12 h-12 rounded-lg bg-gray-10 flex items-center justify-center text-xl shrink-0">💧</span>
                  <span className="flex-1 min-w-0 text-left">
                    <span className="block text-xs text-gray-70">{REALTIME_BEST.product.brand}</span>
                    <span className="block text-sm font-medium text-gray-100 truncate">{REALTIME_BEST.product.name}</span>
                    <span className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs text-star">⭐ {REALTIME_BEST.product.rating}</span>
                      <span className="text-xs font-bold text-accent">{REALTIME_BEST.product.discountRate}%</span>
                      <span className="text-xs font-semibold text-gray-100">{REALTIME_BEST.product.price.toLocaleString()}원</span>
                    </span>
                  </span>
                </button>
              </div>
            </>
          )
        ) : (
          <>
            <RecentSearchChips
              items={ingredientSearches.items}
              onSearch={handleSearch}
              onRemove={ingredientSearches.removeSearch}
              onClearAll={ingredientSearches.clearSearches}
            />

            {/* 성분 사전 / 마이 성분 서브탭 */}
            <div className="flex border-b border-gray-20 mb-4">
              {([
                ['dict', '성분 사전'],
                ['my', '마이 성분'],
              ] as [IngredientSubTab, string][]).map(([tab, label]) => (
                <button
                  key={tab}
                  onClick={() => setIngredientSubTab(tab)}
                  className={`px-4 py-2 text-sm border-b-2 ${
                    ingredientSubTab === tab ? 'font-bold text-primary border-primary' : 'text-gray-50 border-transparent'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {ingredientSubTab === 'dict' ? (
              <div className="flex flex-col">
                {INGREDIENT_DICTIONARY.map((cat) => (
                  <div
                    key={cat.id}
                    className="flex items-center justify-between py-3.5 border-b border-gray-10 last:border-0"
                  >
                    <button className="flex items-center gap-3 flex-1 text-left active:opacity-60 transition-opacity">
                      <span className="text-xl">{cat.emoji}</span>
                      <span className="text-sm text-gray-100">{cat.label}</span>
                    </button>
                    <button
                      onClick={() => myIngredients.addIngredient(cat.label)}
                      aria-label={`${cat.label} 마이 성분에 추가`}
                      className={`w-7 h-7 rounded-lg border flex items-center justify-center text-sm font-light transition-colors ${
                        myIngredients.items.includes(cat.label)
                          ? 'border-primary text-primary bg-primary-light'
                          : 'border-gray-20 text-gray-50'
                      }`}
                    >
                      +
                    </button>
                  </div>
                ))}
              </div>
            ) : myIngredients.items.length === 0 ? (
              <div className="flex flex-col items-center gap-3 pt-12 text-center">
                <span className="w-12 h-12 rounded-full border border-gray-20 flex items-center justify-center text-lg font-bold text-gray-50">!</span>
                <p className="text-sm font-semibold text-gray-100">즐겨찾는 성분이 없어요</p>
                <p className="text-xs text-gray-50 leading-relaxed">
                  성분 사전에서 + 버튼을 눌러
                  <br />
                  나만의 성분을 관리해 보세요.
                </p>
              </div>
            ) : (
              <div className="flex flex-col">
                {myIngredients.items.map((name) => (
                  <div key={name} className="flex items-center justify-between py-3.5 border-b border-gray-10 last:border-0">
                    <span className="text-sm text-gray-100">{name}</span>
                    <button
                      onClick={() => myIngredients.removeIngredient(name)}
                      aria-label={`${name} 삭제`}
                      className="text-gray-50 text-sm active:scale-90 transition-transform"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {showScanner && <ScannerModal onClose={() => setShowScanner(false)} />}

      <BottomNav />
    </PageWrapper>
  );
}
