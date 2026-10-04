import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { OyBottomNav } from '../../components/home/oy/OyBottomNav';
import { RecentTab, LikedTab, FrequentTab } from '../History';
import { useCloset, ClosetItem } from '../../context/closet';
import { useToast } from '../../context/toast';
import { BudgetCard } from '../../components/closet/BudgetCard';

type ClosetTab = 'vanity' | 'recent' | 'liked' | 'frequent';

const TABS: [ClosetTab, string][] = [
  ['vanity', '내 화장대'],
  ['recent', '최근 본'],
  ['liked', '좋아요'],
  ['frequent', '자주 구매'],
];

const SOURCE_LABEL: Record<ClosetItem['addedVia'], string> = {
  seed: '',
  scan: 'OCR 스캔으로 추가',
  chatbot: '챗봇으로 추가',
  search: '검색으로 추가',
};

type VanityFilter = 'owned' | 'removed';

/** 4c — 내 화장대(보유 제품 · 삭제된 제품 · 예산) */
function VanityView() {
  const navigate = useNavigate();
  const { items, removedItems, removeItem, restoreItem, purgeItem } = useCloset();
  const { showToast } = useToast();
  const [filter, setFilter] = useState<VanityFilter>('owned');

  const shown = filter === 'owned' ? items : removedItems;
  const filters: [VanityFilter, string, number][] = [
    ['owned', '보유 중', items.length],
    ['removed', '삭제된 제품', removedItems.length],
  ];

  const remove = (item: ClosetItem) => {
    removeItem(item.id);
    showToast('삭제된 제품으로 옮겼어요', { label: '되돌리기', onClick: () => restoreItem(item.id) });
  };

  const restore = (item: ClosetItem) => {
    restoreItem(item.id);
    showToast('화장대로 되돌렸어요');
  };

  const purge = (item: ClosetItem) => {
    if (!window.confirm(`'${item.name}'을(를) 완전히 지울까요? 되돌릴 수 없어요.`)) return;
    purgeItem(item.id);
  };

  return (
    <div className="px-4 pt-1 pb-6">
      {/* 요약 히어로 */}
      <button
        onClick={() => navigate('/alternatives?from=closet')}
        className="flex w-full items-center gap-3 rounded-[20px] bg-primary-dark p-[18px] text-left active:scale-[.99] transition-transform"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold text-white/65">내 화장대</span>
          <span className="block text-[22px] font-black tracking-[-0.3px] text-white">
            {items.length}개 등록됨
          </span>
          <span className="mt-1 block text-[11px] text-white/75">
            보유 화장품과 비슷한 대체품을 찾아드려요
          </span>
        </span>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/[0.16]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 17L17 7M9 7h8v8" />
          </svg>
        </span>
      </button>

      <BudgetCard />

      {items.length === 0 && removedItems.length === 0 ? (
        <div className="mt-6 rounded-[20px] border border-dashed border-[#C9CFC5] bg-white px-5 py-10 text-center">
          <p className="text-[13px] font-bold text-gray-70">화장대가 비어 있어요</p>
          <p className="mt-1 text-[11px] text-gray-50">
            성분표를 스캔하거나 챗봇에게 제품명을 알려주면 여기에 담겨요
          </p>
          <button
            onClick={() => navigate('/scan')}
            className="mt-4 inline-flex h-[44px] items-center rounded-xl px-5 text-[13px] font-bold text-white active:scale-95 transition-transform"
            style={{ background: '#00916D' }}
          >
            성분표 스캔하기
          </button>
        </div>
      ) : (
        <>
          {/* 보유 중 / 삭제된 제품 */}
          <div className="flex items-center gap-2 -mx-4 px-4 py-3">
            {filters.map(([key, label, count]) => {
              const active = filter === key;
              return (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`shrink-0 inline-flex items-center h-8 px-[13px] rounded-full text-xs transition-colors ${
                    active ? 'bg-oy-black text-white font-bold' : 'bg-white border border-[#E1E4DD] text-gray-70 font-semibold'
                  }`}
                >
                  {label} {count}
                </button>
              );
            })}
          </div>

          {/* 제품 목록 */}
          <div className="rounded-[20px] bg-white border border-[#ECEEE8] px-4">
            {shown.length === 0 && (
              <p className="py-8 text-center text-xs text-gray-50">
                {filter === 'owned' ? '화장대에 담긴 제품이 없어요' : '삭제된 제품이 없어요'}
              </p>
            )}
            {shown.map((item, i) => {
              const via = SOURCE_LABEL[item.addedVia];
              const removed = filter === 'removed';
              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 py-[13px] ${
                    i < shown.length - 1 ? 'border-b border-surface-warm' : ''
                  }`}
                >
                  <button
                    onClick={() =>
                      navigate(removed ? `/detail/${item.id}` : `/alternatives?seed=${item.id}&from=closet`)
                    }
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span className={`h-[54px] w-[54px] shrink-0 overflow-hidden rounded-[14px] bg-gray-10 ${removed ? 'opacity-50' : ''}`}>
                      <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[10px] font-bold text-gray-50">{item.brand}</span>
                      <span className={`block truncate text-[13px] font-semibold ${removed ? 'text-gray-50' : 'text-gray-100'}`}>
                        {item.name}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1">
                        <span className={`h-1.5 w-1.5 rounded-full ${removed ? 'bg-gray-50' : 'bg-primary'}`} />
                        <span className={`text-[11px] font-semibold ${removed ? 'text-gray-50' : 'text-primary-dark'}`}>
                          {removed ? '삭제됨' : '보유 중'}
                          {via ? ` · ${via}` : ''}
                        </span>
                      </span>
                    </span>
                  </button>

                  {removed ? (
                    <span className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => restore(item)}
                        className="inline-flex h-8 items-center rounded-lg border border-[#DCE8E1] px-3 text-[11px] font-bold text-primary-dark active:scale-95 transition-transform"
                      >
                        복원
                      </button>
                      <button
                        onClick={() => purge(item)}
                        aria-label="완전히 삭제"
                        className="rounded-full p-1.5 active:scale-90 transition-transform"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9AA0A6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3" />
                        </svg>
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => remove(item)}
                      aria-label="화장대에서 빼기"
                      className="shrink-0 rounded-full p-1.5 text-gray-50 active:scale-90 transition-transform"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M6 6l12 12M18 6L6 18" stroke="#9AA0A6" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* 제품 추가 */}
      <button
        onClick={() => navigate('/scan')}
        className="mt-3 flex w-full items-center justify-center gap-1.5 h-[52px] rounded-2xl border-[1.5px] border-dashed border-[#C9CFC5] active:scale-[.99] transition-transform"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12h14" stroke="#8A8F98" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="text-[13px] font-bold text-gray-70">제품 추가 — 스캔하거나 챗봇으로</span>
      </button>
    </div>
  );
}

/** 내 화장대 — 보유 제품 관리·예산(4c) + 최근 본/좋아요/자주 구매 히스토리(4b) */
export default function ClosetPage() {
  const [tab, setTab] = useState<ClosetTab>('vanity');

  return (
    <PageWrapper hasBottomNav className="bg-surface-warm">
      <header className="sticky top-0 z-10 bg-surface-warm">
        <div className="flex items-center justify-between h-[52px] px-4">
          <h1 className="text-[22px] font-extrabold tracking-[-0.4px] text-gray-100">내 화장대</h1>
        </div>
        <div className="flex gap-4 px-4 overflow-x-auto scrollbar-hide">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`shrink-0 px-1 py-2.5 text-sm border-b-2 whitespace-nowrap transition-colors ${
                tab === key ? 'font-extrabold text-primary-dark border-primary' : 'font-semibold text-gray-50 border-transparent'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {tab === 'vanity' && <VanityView />}
      {tab === 'recent' && <RecentTab />}
      {tab === 'liked' && <LikedTab />}
      {tab === 'frequent' && <FrequentTab />}

      <OyBottomNav />
    </PageWrapper>
  );
}
