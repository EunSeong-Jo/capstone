import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { OyBottomNav } from '../../components/home/oy/OyBottomNav';
import { RecentTab, LikedTab, FrequentTab } from '../History';
import { useCloset, ClosetItem } from '../../context/closet';
import { useToast } from '../../context/toast';
import { fetchProduct } from '../../api/products';

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

type AnalysisFilter = 'all' | 'analyzed' | 'pending';

const FILTERS: { key: AnalysisFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'analyzed', label: '분석 완료' },
  { key: 'pending', label: '분석 전' },
];

const isAnalyzed = (item: ClosetItem) => item.status === 'analyzed';

/** '분석 중'이 눈에 보일 만큼은 머문다. 캐시가 맞으면 응답이 수십 ms라 깜빡이고 끝난다 */
const MIN_ANALYZE_MS = 1200;

/** 4c — 내 화장대(보유 제품 분석 상태 관리) */
function VanityView() {
  const navigate = useNavigate();
  const { items, removeItem, setStatus } = useCloset();
  const { showToast } = useToast();
  const [filter, setFilter] = useState<AnalysisFilter>('all');
  const [editing, setEditing] = useState(false);
  // 분석 중인 제품. 서버에 남길 상태가 아니라(중간에 나가면 '분석 중'에 갇힌다) 화면이 든다.
  const [analyzing, setAnalyzing] = useState<Set<number>>(() => new Set());

  const countOf = (key: AnalysisFilter) =>
    key === 'all'
      ? items.length
      : items.filter((i) => (key === 'analyzed' ? isAnalyzed(i) : !isAnalyzed(i))).length;

  const shown = useMemo(
    () =>
      filter === 'all'
        ? items
        : items.filter((i) => (filter === 'analyzed' ? isAnalyzed(i) : !isAnalyzed(i))),
    [items, filter],
  );

  /**
   * 분석 = 전성분을 실제로 불러와 확인하는 것. 대체품은 성분 유사도로 찾으므로
   * 성분표가 없는 제품은 분석 완료로 만들 수 없다.
   */
  const analyze = async (item: ClosetItem) => {
    setAnalyzing((prev) => new Set(prev).add(item.id));
    try {
      const [detail] = await Promise.all([
        fetchProduct(item.id),
        new Promise((r) => window.setTimeout(r, MIN_ANALYZE_MS)),
      ]);
      if (detail.ingredients.length > 0) {
        setStatus(item.id, 'analyzed');
        showToast(`분석 완료! 성분 ${detail.ingredients.length}개를 확인했어요`);
      } else {
        showToast('성분 정보가 없어 분석할 수 없어요');
      }
    } catch {
      showToast('분석하지 못했어요. 다시 시도해 주세요');
    } finally {
      setAnalyzing((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  const openItem = (item: ClosetItem) => {
    if (!isAnalyzed(item)) {
      showToast('아직 분석이 안 됐어요. 분석하기를 눌러 주세요');
      return;
    }
    navigate(`/alternatives?seed=${item.id}&from=closet`);
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
            분석한 제품과 비슷한 대체품을 찾아드려요
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
          {/* 분석 상태 필터 칩 + 편집 */}
          <div className="flex items-center gap-2 -mx-4 px-4 py-3">
            <div className="flex flex-1 items-center gap-2 overflow-x-auto scrollbar-hide">
              {FILTERS.map(({ key, label }) => {
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
            <button
              onClick={() => setEditing((v) => !v)}
              className="shrink-0 text-xs font-semibold text-gray-50 active:opacity-60"
            >
              {editing ? '완료' : '편집'}
            </button>
          </div>

          {/* 제품 목록 */}
          <div className="rounded-[20px] bg-white border border-[#ECEEE8] px-4">
            {shown.length === 0 && (
              <p className="py-8 text-center text-xs text-gray-50">해당하는 제품이 없어요</p>
            )}
            {shown.map((item, i) => {
              const via = SOURCE_LABEL[item.addedVia];
              const done = isAnalyzed(item);
              const busy = analyzing.has(item.id);
              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 py-[13px] ${
                    i < shown.length - 1 ? 'border-b border-surface-warm' : ''
                  }`}
                >
                  <button onClick={() => openItem(item)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <span className="h-[54px] w-[54px] shrink-0 overflow-hidden rounded-[14px] bg-gray-10">
                      <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[10px] font-bold text-gray-50">{item.brand}</span>
                      <span className="block truncate text-[13px] font-semibold text-gray-100">{item.name}</span>
                      <span className="mt-0.5 flex items-center gap-1">
                        <span className={`h-1.5 w-1.5 rounded-full ${done ? 'bg-primary' : busy ? 'bg-warning' : 'bg-gray-50'}`} />
                        <span className={`text-[11px] font-semibold ${done ? 'text-primary-dark' : busy ? 'text-[#C77700]' : 'text-gray-50'}`}>
                          {done ? '분석 완료' : busy ? '분석 중' : '분석 전'}
                          {via ? ` · ${via}` : ''}
                        </span>
                      </span>
                    </span>
                  </button>

                  {editing ? (
                    <button
                      onClick={() => removeItem(item.id)}
                      aria-label="화장대에서 빼기"
                      className="shrink-0 rounded-full p-1.5 text-gray-50 active:scale-90 transition-transform"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M6 6l12 12M18 6L6 18" stroke="#9AA0A6" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </button>
                  ) : done ? (
                    <span className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-primary-light px-2.5 text-[11px] font-bold text-primary-dark">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                        <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      분석 완료
                    </span>
                  ) : busy ? (
                    <span
                      role="status"
                      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[#F1D9B0] bg-[#FFF7EA] px-2.5 text-[11px] font-bold text-[#C77700]"
                    >
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#C77700] border-t-transparent" />
                      분석 중
                    </span>
                  ) : (
                    <button
                      onClick={() => analyze(item)}
                      className="inline-flex h-8 shrink-0 items-center rounded-lg px-3 text-[11px] font-bold text-white active:scale-95 transition-transform"
                      style={{ background: '#00916D' }}
                    >
                      분석하기
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

/** 내 화장대 — 보유 제품 상태 관리(4c) + 최근 본/좋아요/자주 구매 히스토리(4b) */
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
