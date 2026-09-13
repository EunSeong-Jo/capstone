import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Header } from '../../components/layout/Header';
import { AlternativeCard } from '../../components/alternatives/AlternativeCard';
import { SEED_PRODUCTS, MOCK_ALTERNATIVES } from '../../mocks/alternatives';

type SortKey = 'similarity' | 'price' | 'skin';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'similarity', label: '유사도순' },
  { key: 'price', label: '가격 낮은순' },
  { key: 'skin', label: '내 피부 궁합' },
];

/** 대체품 결과 화면 — 검색/상품상세/내 화장대 3진입점 수렴 (/alternatives?seed=:id) */
export default function AlternativesPage() {
  const [params] = useSearchParams();
  const seedId = Number(params.get('seed')) || 1;
  const seed = SEED_PRODUCTS[seedId];
  const base = MOCK_ALTERNATIVES[seedId] ?? [];

  const [sort, setSort] = useState<SortKey>('similarity');

  const list = useMemo(() => {
    const arr = [...base];
    if (sort === 'similarity') arr.sort((a, b) => b.similarityScore - a.similarityScore);
    if (sort === 'price') arr.sort((a, b) => a.price - b.price);
    if (sort === 'skin') {
      const ok = (v?: { verdict: string }) => (v?.verdict === 'good' ? 1 : 0);
      arr.sort((a, b) => ok(b.skinMatch) - ok(a.skinMatch) || b.similarityScore - a.similarityScore);
    }
    return arr;
  }, [base, sort]);

  return (
    <PageWrapper>
      <Header showBack title="대체품 추천" />

      {/* 기준제품 헤더 */}
      {seed && (
        <div className="px-4 pt-3">
          <p className="text-xs text-gray-70 mb-2">이 제품을 대신할 만한 추천이에요</p>
          <div className="flex items-center gap-3 p-3 rounded-xl bg-primary-light/60 border border-primary/15">
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
              <p className="text-sm font-bold text-gray-100 mt-0.5">{seed.price.toLocaleString()}원</p>
            </div>
          </div>
        </div>
      )}

      {/* 정렬 칩 */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide">
        {SORTS.map((s) => {
          const on = s.key === sort;
          return (
            <button
              key={s.key}
              onClick={() => setSort(s.key)}
              className={`shrink-0 px-3 h-8 rounded-full text-sm font-medium border transition-colors ${
                on ? 'bg-gray-100 text-white border-gray-100' : 'bg-white text-gray-70 border-gray-20'
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {/* 결과 리스트 */}
      <div className="px-4 pb-8">
        {list.length > 0 ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-70">
              총 <span className="font-bold text-gray-100">{list.length}개</span>의 대체품
            </p>
            {list.map((alt) => (
              <AlternativeCard key={alt.id} alt={alt} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <span className="text-4xl mb-3 opacity-40">🔍</span>
            <p className="text-sm text-gray-70">아직 분석된 대체품이 없어요</p>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
