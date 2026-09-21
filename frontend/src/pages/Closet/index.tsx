import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { OyBottomNav } from '../../components/home/oy/OyBottomNav';
import { RecentTab, LikedTab, FrequentTab } from '../History';
import { VANITY_ITEMS, VANITY_FILTERS, VanityItem, VanityStatus } from '../../mocks/closet';
import { useCloset, ClosetItem } from '../../context/ClosetContext';

const STATIC_IDS = new Set(VANITY_ITEMS.map((i) => i.id));

/** 제품 상세에서 "내 화장대에 추가"로 들어온 실제 항목을 데모 목록과 같은 모양으로 맞춘다 */
function toVanityItem(item: ClosetItem): VanityItem {
  return {
    id: item.id,
    brand: item.brand,
    name: item.name,
    imageUrl: item.imageUrl ?? '',
    status: 'pending',
    statusLabel: '분석 대기 중',
    badge: '분석하기',
    to: `/alternatives?seed=${item.id}&from=closet`,
  };
}

type ClosetTab = 'vanity' | 'recent' | 'liked' | 'frequent';

const TABS: [ClosetTab, string][] = [
  ['vanity', '내 화장대'],
  ['recent', '최근 본'],
  ['liked', '좋아요'],
  ['frequent', '자주 구매'],
];

/** 상태별 표시 (점 색 · 우측 뱃지 스타일) */
const STATUS_STYLE: Record<VanityStatus, { dot: string; label: string; badge: string }> = {
  replace: { dot: 'bg-primary', label: 'text-gray-70', badge: 'text-[13px] font-extrabold text-primary-dark' },
  discontinue: { dot: 'bg-warning', label: 'text-gray-70', badge: 'inline-flex h-7 items-center rounded-full bg-warning/15 px-3 text-[11px] font-bold text-[#C77700]' },
  scanned: { dot: 'bg-primary', label: 'text-gray-70', badge: 'inline-flex h-7 items-center rounded-full border border-primary/30 px-3 text-[11px] font-bold text-primary-dark' },
  pending: { dot: 'bg-gray-50', label: 'text-gray-70', badge: 'inline-flex h-7 items-center rounded-full border border-gray-20 px-3 text-[11px] font-bold text-gray-70' },
};

const TOTAL_SAVINGS = 74500;

/** 4c — 내 화장대(교체 제안 · 단종 주의 · 분석 대기 관리) */
function VanityView({ editMode }: { editMode: boolean }) {
  const navigate = useNavigate();
  const { items: closetItems, removeItem: removeClosetItem } = useCloset();
  const [removedStaticIds, setRemovedStaticIds] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<'all' | VanityStatus>('all');
  // 분석하기 → 분석중... → 분석보기 전환. 실제 분석 결과 화면은 아직 없어 /coming-soon으로 보낸다.
  const [analysisPhase, setAnalysisPhase] = useState<Record<number, 'analyzing' | 'done'>>({});

  // 제품 상세의 "내 화장대에 추가"로 새로 들어온 실제 항목(최신순) + 데모 목록을 합친다
  const items = useMemo(() => {
    const extra = closetItems.filter((c) => !STATIC_IDS.has(c.id)).map(toVanityItem);
    const staticItems = VANITY_ITEMS.filter((i) => !removedStaticIds.has(i.id));
    return [...extra, ...staticItems];
  }, [closetItems, removedStaticIds]);

  const replaceReadyCount = items.filter((i) => i.status === 'replace').length;

  const countOf = (key: 'all' | VanityStatus) =>
    key === 'all' ? items.length : items.filter((i) => i.status === key).length;

  const shown = useMemo(
    () => (filter === 'all' ? items : items.filter((i) => i.status === filter)),
    [items, filter],
  );

  const removeItem = (id: number) => {
    if (STATIC_IDS.has(id)) setRemovedStaticIds((prev) => new Set(prev).add(id));
    else removeClosetItem(id);
  };

  const displayStatusLabel = (item: VanityItem) => {
    if (item.status !== 'pending') return item.statusLabel;
    const phase = analysisPhase[item.id];
    if (phase === 'analyzing') return '분석 중...';
    if (phase === 'done') return '분석 완료';
    return item.statusLabel;
  };

  const displayBadge = (item: VanityItem) => {
    if (item.status !== 'pending') return item.badge;
    const phase = analysisPhase[item.id];
    if (phase === 'analyzing') return '분석 중...';
    if (phase === 'done') return '분석보기';
    return item.badge;
  };

  const handleBadgeClick = (item: VanityItem) => {
    if (item.status === 'scanned') {
      navigate('/coming-soon');
      return;
    }
    if (item.status !== 'pending') {
      navigate(item.to);
      return;
    }
    const phase = analysisPhase[item.id];
    if (phase === 'done') {
      navigate('/coming-soon');
      return;
    }
    if (phase === 'analyzing') return;
    setAnalysisPhase((prev) => ({ ...prev, [item.id]: 'analyzing' }));
    window.setTimeout(() => {
      setAnalysisPhase((prev) => ({ ...prev, [item.id]: 'done' }));
    }, 1600);
  };

  return (
    <div className="px-4 pt-1 pb-6">
      {/* 이번 달 절약 가능 배너 */}
      <button
        onClick={() => navigate('/alternatives?from=closet')}
        className="flex w-full items-center gap-3 rounded-[20px] bg-primary-dark p-[18px] text-left active:scale-[.99] transition-transform"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold text-white/65">이번 달 절약 가능</span>
          <span className="block text-[22px] font-black tracking-[-0.3px] text-white">
            {TOTAL_SAVINGS.toLocaleString()}원
          </span>
          <span className="mt-1 block text-[11px] text-white/75">
            교체 제안 {replaceReadyCount}건이 기다리고 있어요
          </span>
        </span>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/[0.16]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 17L17 7M9 7h8v8" />
          </svg>
        </span>
      </button>

      {items.length === 0 ? (
        <div className="mt-6 rounded-[20px] border border-dashed border-[#C9CFC5] bg-white px-5 py-10 text-center">
          <p className="text-[13px] font-bold text-gray-70">화장대가 비어 있어요</p>
          <p className="mt-1 text-[11px] text-gray-50">
            성분표를 스캔하거나 검색해서 제품을 추가해 보세요
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

          {/* 제품 목록 */}
          <div className="rounded-[20px] bg-white border border-[#ECEEE8] px-4">
            {shown.map((item, i) => {
              const s = STATUS_STYLE[item.status];
              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 py-[13px] ${
                    i < shown.length - 1 ? 'border-b border-surface-warm' : ''
                  }`}
                >
                  <button onClick={() => navigate(item.to)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <span className="h-[54px] w-[54px] shrink-0 overflow-hidden rounded-[14px] bg-gray-10">
                      <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[10px] font-bold text-gray-50">{item.brand}</span>
                      <span className="block truncate text-[13px] font-semibold text-gray-100">{item.name}</span>
                      <span className="mt-0.5 flex items-center gap-1">
                        <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                        <span className={`text-[11px] font-semibold ${s.label}`}>{displayStatusLabel(item)}</span>
                      </span>
                    </span>
                  </button>
                  {editMode ? (
                    <button
                      onClick={() => removeItem(item.id)}
                      aria-label="화장대에서 빼기"
                      className="shrink-0 rounded-full p-1.5 text-gray-50 active:scale-90 transition-transform"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M6 6l12 12M18 6L6 18" stroke="#9AA0A6" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleBadgeClick(item)}
                      disabled={analysisPhase[item.id] === 'analyzing'}
                      className={`shrink-0 ${s.badge} disabled:opacity-60`}
                    >
                      {displayBadge(item)}
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
        <span className="text-[13px] font-bold text-gray-70">제품 추가 — 스캔하거나 검색으로</span>
      </button>
    </div>
  );
}

/** 내 화장대 — 교체 제안 · 단종 주의 관리(4c) + 최근 본/좋아요/자주 구매 히스토리(4b) */
export default function ClosetPage() {
  const [tab, setTab] = useState<ClosetTab>('vanity');
  const [editMode, setEditMode] = useState(false);

  return (
    <PageWrapper hasBottomNav className="bg-surface-warm">
      <header className="sticky top-0 z-10 bg-surface-warm">
        <div className="flex items-center justify-between h-[52px] px-4">
          <h1 className="text-[22px] font-extrabold tracking-[-0.4px] text-gray-100">내 화장대</h1>
          {tab === 'vanity' && (
            <button
              onClick={() => setEditMode((v) => !v)}
              className="text-sm font-semibold text-gray-70 active:opacity-60 transition-opacity"
            >
              {editMode ? '완료' : '편집'}
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

      {tab === 'vanity' && <VanityView editMode={editMode} />}
      {tab === 'recent' && <RecentTab />}
      {tab === 'liked' && <LikedTab />}
      {tab === 'frequent' && <FrequentTab />}

      <OyBottomNav />
    </PageWrapper>
  );
}
