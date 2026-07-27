import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { OyBottomNav } from '../../components/home/oy/OyBottomNav';
import { RecentTab, LikedTab, FrequentTab } from '../History';
import { VANITY_ITEMS, VANITY_FILTERS, VanityStatus } from '../../mocks/closet';
import { MOCK_REGISTRY } from '../../mocks/home';

type ClosetTab = 'vanity' | 'recent' | 'liked' | 'frequent';

const TABS: [ClosetTab, string][] = [
  ['vanity', '내 화장대'],
  ['recent', '최근 본'],
  ['liked', '좋아요'],
  ['frequent', '자주 구매'],
];

/** 상태별 표시 스타일 (점 색 · 라벨 색 · 액션 뱃지) */
const STATUS_STYLE: Record<VanityStatus, { dot: string; label: string; badge: string }> = {
  replace: { dot: 'bg-primary', label: 'text-primary-dark', badge: 'bg-primary-light text-primary-dark' },
  discontinue: { dot: 'bg-warning', label: 'text-[#C77700]', badge: 'bg-[#FFF4E5] text-warning' },
  scanned: { dot: 'bg-gray-50', label: 'text-gray-50', badge: 'bg-[#F0F1F3] text-gray-70' },
  pending: { dot: 'bg-gray-50', label: 'text-gray-50', badge: 'border border-[#DCE8E1] text-primary-dark' },
};

/** 4c — 내 화장대(보유 제품 상태 관리) */
function VanityView() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | VanityStatus>('all');

  const replaceCount = VANITY_ITEMS.filter((i) => i.status === 'replace').length;
  const countOf = (key: 'all' | VanityStatus) =>
    key === 'all' ? VANITY_ITEMS.length : VANITY_ITEMS.filter((i) => i.status === key).length;
  const items = filter === 'all' ? VANITY_ITEMS : VANITY_ITEMS.filter((i) => i.status === filter);

  return (
    <div className="px-4 pt-1 pb-6">
      {/* 절약 가능 히어로 */}
      <button
        onClick={() => navigate('/alternatives?from=closet')}
        className="flex w-full items-center gap-3 rounded-[20px] bg-primary-dark p-[18px] text-left active:scale-[.99] transition-transform"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold text-white/65">이번 달 절약 가능</span>
          <span className="block text-[22px] font-black tracking-[-0.3px] text-white">
            {MOCK_REGISTRY.totalSavings.toLocaleString()}원
          </span>
          <span className="mt-1 block text-[11px] text-white/75">교체 제안 {replaceCount}건이 기다리고 있어요</span>
        </span>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/[0.16]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 17L17 7M9 7h8v8" />
          </svg>
        </span>
      </button>

      {/* 상태 필터 칩 */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 py-3">
        {VANITY_FILTERS.map(({ key, label }) => {
          const active = filter === key;
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`shrink-0 inline-flex items-center h-8 px-[13px] rounded-full text-xs transition-colors ${
                active ? 'bg-oy-black text-white font-bold' : 'bg-white border border-[#E1E4DD] text-gray-70 font-semibold'
              }`}
            >
              {label} {countOf(key)}
            </button>
          );
        })}
      </div>

      {/* 제품 상태 목록 */}
      <div className="rounded-[20px] bg-white border border-[#ECEEE8] px-4">
        {items.map((item, i) => {
          const s = STATUS_STYLE[item.status];
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.to)}
              className={`flex w-full items-center gap-3 py-[13px] text-left ${
                i < items.length - 1 ? 'border-b border-surface-warm' : ''
              }`}
            >
              <span className="h-[54px] w-[54px] shrink-0 overflow-hidden rounded-[14px] bg-gray-10">
                <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold text-gray-50">{item.brand}</span>
                <span className="block truncate text-[13px] font-semibold text-gray-100">{item.name}</span>
                <span className="mt-0.5 flex items-center gap-1">
                  <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                  <span className={`text-[11px] font-semibold ${s.label}`}>{item.statusLabel}</span>
                </span>
              </span>
              <span className={`shrink-0 inline-flex items-center h-[26px] px-2.5 rounded-full text-[11px] font-extrabold ${s.badge}`}>
                {item.badge}
              </span>
            </button>
          );
        })}
      </div>

      {/* 제품 추가 */}
      <button
        onClick={() => navigate('/scan')}
        className="mt-3 flex w-full items-center justify-center gap-1.5 h-[52px] rounded-2xl border-[1.5px] border-dashed border-[#C9CFC5] active:scale-[.99] transition-transform"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12h14" stroke="#8A8F98" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="text-[13px] font-bold text-gray-70">제품 추가 — 스캔하거나 검색으로</span>
      </button>
    </div>
  );
}

/** 내 화장대 — 보유 제품 상태 관리(4c) + 최근 본/좋아요/자주 구매 히스토리(4b) */
export default function ClosetPage() {
  const [tab, setTab] = useState<ClosetTab>('vanity');

  return (
    <PageWrapper hasBottomNav className="bg-surface-warm">
      <header className="sticky top-0 z-10 bg-surface-warm">
        <div className="flex items-center justify-between h-[52px] px-4">
          <h1 className="text-[22px] font-extrabold tracking-[-0.4px] text-gray-100">내 화장대</h1>
          {tab === 'vanity' && (
            <button onClick={() => alert('준비 중이에요')} className="text-[13px] font-semibold text-gray-50">
              편집
            </button>
          )}
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
