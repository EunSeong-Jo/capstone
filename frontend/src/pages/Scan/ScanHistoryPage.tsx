import { useNavigate } from 'react-router-dom';
import { useScanHistory } from '../../hooks/useScanHistory';

function formatWhen(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

/** 스캔 화면 '최근 스캔'의 전체보기 — 지금까지 스캔한 제품 전부. */
export default function ScanHistoryPage() {
  const navigate = useNavigate();
  const { items, loading } = useScanHistory();

  return (
    <div className="min-h-dvh bg-surface-warm">
      <header className="sticky top-0 z-10 flex h-[52px] items-center gap-2 bg-surface-warm px-2">
        <button
          onClick={() => navigate(-1)}
          aria-label="뒤로"
          className="inline-flex h-10 w-10 items-center justify-center active:scale-90 transition-transform"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M15 5l-7 7 7 7" stroke="#17171C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="text-[17px] font-extrabold text-gray-100">스캔 기록</h1>
      </header>

      <div className="px-4 pb-10 pt-2">
        {loading ? (
          <p className="py-16 text-center text-xs text-gray-50">불러오는 중…</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 pt-24 text-center">
            <p className="text-sm font-semibold text-gray-100">아직 스캔한 제품이 없어요</p>
            <p className="text-xs text-gray-50">스캔 화면에서 제품을 찾아 화장대에 담으면 여기에 쌓여요.</p>
          </div>
        ) : (
          <>
            <p className="mb-3 text-sm text-gray-70">총 {items.length}개</p>
            <div className="flex flex-col gap-2">
              {items.map((item) => (
                <button
                  key={item.key}
                  onClick={() => navigate(`/alternatives?seed=${item.id}&from=scan`)}
                  className="flex w-full items-center gap-3 rounded-xl border border-gray-10 bg-white p-3 text-left active:scale-[.99] transition-transform"
                >
                  <span className="h-12 w-12 shrink-0 overflow-hidden rounded-[10px] bg-gray-10">
                    {item.imageUrl && <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] text-gray-50">{item.brand}</span>
                    <span className="block truncate text-sm font-bold text-gray-100">{item.name}</span>
                    <span className="mt-0.5 block text-[11px] text-gray-50">{formatWhen(item.scannedAt)} 스캔</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
