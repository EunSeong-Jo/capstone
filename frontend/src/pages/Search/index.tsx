import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLoginPrompt } from '../../hooks/useLoginPrompt';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { OyBottomNav } from '../../components/home/oy/OyBottomNav';
import { ProductCard } from '../../components/product/ProductCard';
import {
  POPULAR_SEARCH_FILTERS,
  POPULAR_SEARCH_RANKING,
  INGREDIENT_DICTIONARY,
  PopularSearchFilter,
} from '../../mocks/search';
import { useRecentSearches } from '../../hooks/useRecentSearches';
import { useMyIngredients } from '../../hooks/useMyIngredients';
import { useSearchProducts } from '../../hooks/useSearchProducts';
import { useProducts } from '../../hooks/useProducts';
import { useCloset } from '../../context/closet';

type MainTab = 'general' | 'ingredient';
type IngredientSubTab = 'dict' | 'my';

function SearchResultSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="animate-pulse">
          <div className="aspect-square rounded-xl bg-gray-10" />
          <div className="mt-2 h-3 w-2/3 rounded bg-gray-10" />
          <div className="mt-1.5 h-3 w-full rounded bg-gray-10" />
        </div>
      ))}
    </div>
  );
}

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
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="text-[15px] font-extrabold text-gray-100">최근 검색</h3>
        {items.length > 0 && (
          <button onClick={onClearAll} className="text-xs text-gray-50">전체삭제</button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-gray-50">최근 검색 항목이 없습니다.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((s) => (
            <span
              key={s}
              className="flex items-center gap-1.5 pl-3.5 pr-2.5 py-1.5 rounded-full border border-gray-20 bg-white text-[13px] text-gray-70"
            >
              <button onClick={() => onSearch(s)} className="active:opacity-60 transition-opacity">{s}</button>
              <button
                onClick={() => onRemove(s)}
                aria-label={`${s} 삭제`}
                className="text-gray-20 text-[10px] active:scale-90 transition-transform"
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
  const { requireLogin } = useLoginPrompt();
  const [mainTab, setMainTab] = useState<MainTab>('general');
  const [ingredientSubTab, setIngredientSubTab] = useState<IngredientSubTab>('dict');
  const [popularFilter, setPopularFilter] = useState<PopularSearchFilter>(POPULAR_SEARCH_FILTERS[0]);
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const generalSearches = useRecentSearches('general');
  const ingredientSearches = useRecentSearches('ingredient');
  const myIngredients = useMyIngredients();

  // 통합검색은 제품명, 성분검색은 전성분에서 찾는다.
  const {
    products: searchResults,
    total: searchTotal,
    loading: searchLoading,
    error: searchError,
    reload: reloadSearch,
  } = useSearchProducts(query, {}, mainTab === 'general' ? 'name' : 'ingredient');

  // 내 화장대(등록·분석한 제품) — 대체품 찾기 기준제품.
  // 예전에는 mocks/alternatives의 SEED_PRODUCTS를 썼는데, 그 id는 실제
  // 카탈로그와 무관해서 '대체품 찾기'가 엉뚱한 제품으로 갔다.
  const { items: myShelf } = useCloset();
  // 인기 TOP 5 (리뷰수 기준). 예전 REALTIME_BEST 목업을 대체한다.
  const { products: popular } = useProducts({ sort: 'popular', size: 5 });

  const handleSearch = (q: string, tab: MainTab = mainTab) => {
    setQuery(q);
    const searching = q.trim().length > 0;
    setIsSearching(searching);
    if (searching) {
      (tab === 'general' ? generalSearches : ingredientSearches).addSearch(q.trim());
    }
  };

  // 성분 인기 검색어는 성분검색 탭으로 넘겨서 찾는다.
  const handlePopularSearch = (q: string) => {
    if (popularFilter === '성분') {
      setMainTab('ingredient');
      handleSearch(q, 'ingredient');
      return;
    }
    handleSearch(q);
  };

  const searchResultsView =
    query.trim().length < 2 ? (
      <div className="flex flex-col items-center gap-2 pt-16 text-center">
        <p className="text-sm text-gray-50">2자 이상 입력해 주세요.</p>
      </div>
    ) : searchLoading ? (
      <SearchResultSkeleton />
    ) : searchError ? (
      <div className="rounded-lg bg-gray-10/60 px-4 py-10 text-center">
        <p className="text-sm text-gray-70">{searchError}</p>
        <button
          type="button"
          onClick={reloadSearch}
          className="mt-3 rounded-full border border-gray-20 px-4 py-1.5 text-sm font-medium text-gray-70 active:scale-95"
        >
          다시 시도
        </button>
      </div>
    ) : searchResults.length === 0 ? (
      <div className="flex flex-col items-center gap-2 pt-16 text-center">
        <p className="text-sm font-semibold text-gray-100">검색 결과가 없어요</p>
        <p className="text-xs text-gray-50">
          {mainTab === 'general' ? '다른 검색어로 시도해 보세요.' : '성분명을 다르게 입력해 보세요. 예) 나이아신아마이드'}
        </p>
      </div>
    ) : (
      <>
        <p className="text-sm text-gray-70 mb-4">
          <span className="font-bold text-gray-100">"{query}"</span>
          {mainTab === 'general' ? ' 검색 결과 ' : ' 성분이 든 제품 '}
          {searchTotal.toLocaleString()}개
        </p>
        <div className="grid grid-cols-2 gap-3">
          {searchResults.map((p, i) => (
            <ProductCard key={p.id} product={p} index={i} />
          ))}
        </div>
      </>
    );

  return (
    <PageWrapper hasBottomNav className="bg-surface-warm">
      {/* 검색 헤더 — 검색바(카메라 포함) + 통합/성분 탭 */}
      <div className="sticky top-0 z-10 bg-surface-warm px-4 pt-3">
        <div className="flex items-center gap-2 h-12 px-4 rounded-[14px] bg-white border-[1.5px] border-primary shadow-[0_0_0_3px_rgba(61,143,111,.10)]">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="var(--primary)" strokeWidth="2" />
            <path d="M16.5 16.5L21 21" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder={mainTab === 'general' ? '제품명·브랜드·성분으로 검색' : '성분으로 검색해 보세요'}
            className="flex-1 min-w-0 bg-transparent text-sm text-gray-100 outline-none placeholder:text-gray-50"
          />
          {query && (
            <button onClick={() => handleSearch('')} aria-label="검색어 지우기" className="text-gray-50 active:scale-90 transition-transform">✕</button>
          )}
          {/* 검색표시 옆 카메라 → 화장품 스캔(3c) 이동 */}
          <button
            onClick={() => {
              if (requireLogin('화장품 스캔은 로그인하면 쓸 수 있어요')) return;
              navigate('/scan');
            }}
            aria-label="화장품 스캔"
            title="화장품 스캔"
            className="shrink-0 active:scale-90 transition-transform"
          >
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
              <path d="M4 8a2 2 0 012-2h1.5l1.2-1.8A1.5 1.5 0 0110 3.5h4a1.5 1.5 0 011.3.7L16.5 6H18a2 2 0 012 2v9a2 2 0 01-2 2H6a2 2 0 01-2-2V8z" stroke="#6B7280" strokeWidth="1.7" strokeLinejoin="round" />
              <circle cx="12" cy="12.5" r="3.2" stroke="#6B7280" strokeWidth="1.7" />
            </svg>
          </button>
        </div>

        {/* 통합검색 / 성분검색 탭 */}
        <div className="flex mt-1.5">
          {([
            ['general', '통합검색'],
            ['ingredient', '성분검색'],
          ] as [MainTab, string][]).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => { setMainTab(tab); handleSearch(''); }}
              className={`mr-5 px-1 py-2.5 text-sm border-b-2 transition-colors ${
                mainTab === tab ? 'font-extrabold text-primary-dark border-primary' : 'font-semibold text-gray-50 border-transparent'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="-mx-4 h-px bg-gray-10" />
      </div>

      <div className="px-4 py-4">
        {mainTab === 'general' ? (
          isSearching ? (
            searchResultsView
          ) : (
            <>
              {/* 내 화장대에서 대체품 찾기 (핵심 차별화) */}
              {myShelf.length > 0 && (
                <div className="mb-[22px] rounded-2xl bg-primary-light p-3.5">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-sm font-extrabold text-primary-dark">내 화장대에서 대체품 찾기</span>
                    <span className="text-xs font-semibold text-primary">전체 {myShelf.length}개</span>
                  </div>
                  <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-3.5 px-3.5">
                    {myShelf.map((p) => (
                      <div
                        key={p.id}
                        className="shrink-0 w-32 rounded-xl bg-white p-2.5 shadow-[0_1px_4px_rgba(43,107,82,.08)]"
                      >
                        <span className="block w-11 h-11 rounded-[10px] overflow-hidden bg-gray-10 mb-1.5">
                          {p.imageUrl ? (
                            <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-lg opacity-40">🧴</span>
                          )}
                        </span>
                        <span className="block text-[10px] font-semibold text-gray-50">{p.brand}</span>
                        <span className="block text-xs font-bold text-gray-100 truncate mb-2">{p.name}</span>
                        <button
                          onClick={() => navigate(`/alternatives?seed=${p.id}&from=search`)}
                          className="flex items-center justify-center w-full h-7 rounded-lg bg-primary text-[11px] font-extrabold text-white active:scale-95 transition-transform"
                        >
                          대체품 찾기
                        </button>
                      </div>
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
              <div className="mb-[22px]">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[15px] font-extrabold text-gray-100">인기 검색어</h3>
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
                <div className="grid grid-cols-2 gap-x-5 gap-y-2.5">
                  {POPULAR_SEARCH_RANKING[popularFilter].map((s, i) => (
                    <button
                      key={s}
                      onClick={() => handlePopularSearch(s)}
                      className="flex items-center gap-3 text-left active:opacity-60 transition-opacity"
                    >
                      <span className={`text-sm font-extrabold italic w-[18px] ${i < 3 ? 'text-primary' : 'text-gray-50'}`}>{i + 1}</span>
                      <span className="text-sm text-gray-100 truncate">{s}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 마스코트 스캔 배너 → 화장품 스캔(3c) 이동 */}
              <button
                onClick={() => {
                  if (requireLogin('화장품 스캔은 로그인하면 쓸 수 있어요')) return;
                  navigate('/scan');
                }}
                className="flex w-full items-center gap-3.5 rounded-2xl bg-oy-black p-4 mb-[22px] text-left active:scale-[.99] transition-transform"
              >
                <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#2A2A31]">
                  <img src="/mascot/base_face_neutral.png" alt="" className="h-[82%] w-[82%] object-contain" />
                </span>
                <span className="flex-1 min-w-0">
                  {/* 예전 문구는 "AI가 전성분을 읽는다"였지만 /scan은 앞면 사진으로 제품을
                      찾는 기능이다(뒷면 인식은 실사진 평가에서 0건). 전성분은 찾은 제품의
                      상세 화면에서 보인다(QA 12). */}
                  <span className="block text-sm font-extrabold text-white">제품명이 헷갈리면, 찍어보세요</span>
                  <span className="block text-xs text-white/55 mt-0.5">
                    앞면을 찍으면 화장품을 찾아 드려요. 제품을 누르면 전성분을 볼 수 있어요
                  </span>
                </span>
                <span className="shrink-0 inline-flex items-center h-8 px-3.5 rounded-full bg-primary text-xs font-extrabold text-white">
                  스캔
                </span>
              </button>

              {/* 실시간 판매 BEST — 리뷰수 기준 1위. 예전에는 갱신 시각과
                  할인율까지 하드코딩돼 있었는데, 그 값들은 수집 시점의
                  스냅샷일 뿐 실시간이 아니다. */}
              {popular.length > 0 && (
                <div>
                  <h3 className="text-[15px] font-extrabold text-gray-100 mb-3">인기 제품 TOP {popular.length}</h3>
                  <div className="flex flex-col gap-2">
                    {popular.map((p, i) => (
                      <button
                        key={p.id}
                        onClick={() => navigate(`/detail/${p.id}`)}
                        className="w-full flex items-center gap-3 p-3 rounded-[14px] border border-gray-10 bg-white active:scale-[.98] transition-transform"
                      >
                        <span className={`w-4 text-[17px] font-black italic shrink-0 ${i < 3 ? 'text-primary' : 'text-gray-50'}`}>{i + 1}</span>
                        <span className="w-12 h-12 rounded-[10px] bg-gray-10 overflow-hidden shrink-0">
                          {p.imageUrl && <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />}
                        </span>
                        <span className="flex-1 min-w-0 text-left">
                          <span className="block text-xs text-gray-50">{p.brand}</span>
                          <span className="block text-sm font-medium text-gray-100 truncate">{p.name}</span>
                          <span className="flex items-center gap-1.5 mt-0.5">
                            {p.rating != null && <span className="text-xs text-star">⭐ {p.rating}</span>}
                            {!!p.reviewCount && (
                              <span className="text-xs text-gray-50">리뷰 {p.reviewCount.toLocaleString()}</span>
                            )}
                            <span className="text-xs font-semibold text-gray-100">{p.price.toLocaleString()}원</span>
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )
        ) : isSearching ? (
          searchResultsView
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

      <OyBottomNav />
    </PageWrapper>
  );
}
