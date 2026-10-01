import { useNavigate } from 'react-router-dom';
import { useCloset } from '../../context/closet';

/**
 * 대체품을 찾을 기준 제품 고르기 — 내 화장대 목록.
 *
 * 홈의 '내 화장대 대체품 찾기' 배너와 화장대 요약 카드가 기준 제품 없이
 * `/alternatives`로 들어온다. 예전에는 여기서 "검색하러 가기" 안내만
 * 떴다. 이제 화장대 제품을 보여 주고 고르게 한다.
 *
 * 분석 완료된 제품만 고를 수 있다(대체품은 분석한 제품 기준). 분석 전
 * 제품은 목록에 두되 화장대에서 분석하도록 안내한다.
 */
export function ClosetSeedPicker() {
  const navigate = useNavigate();
  const { items, loading } = useCloset();
  // 분석 완료를 위로. 그 안에서는 화장대 순서(최근 담은 것 먼저)를 지킨다.
  const sorted = [...items].sort(
    (a, b) => Number(b.status === 'analyzed') - Number(a.status === 'analyzed'),
  );
  const analyzedCount = items.filter((i) => i.status === 'analyzed').length;

  if (loading) {
    return (
      <div className="animate-pulse space-y-2 p-4">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-[76px] rounded-2xl bg-gray-10" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="px-8 py-20 text-center">
        <span className="text-4xl">🧴</span>
        <p className="mt-3 text-base font-semibold text-gray-100">화장대가 비어 있어요</p>
        <p className="mt-1 text-sm text-gray-50">쓰는 제품을 담으면 비슷한 대체품을 찾아드려요</p>
        <button
          onClick={() => navigate('/scan')}
          className="mt-4 rounded-xl px-5 py-2.5 text-sm font-bold text-white active:scale-95"
          style={{ background: '#00916D' }}
        >
          제품 담으러 가기
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 pb-8 pt-3">
      <p className="text-[15px] font-extrabold text-gray-100">어떤 제품의 대체품을 찾을까요?</p>
      <p className="mt-1 text-xs text-gray-50">
        내 화장대 {items.length}개 중 분석 완료 {analyzedCount}개 · 분석한 제품만 고를 수 있어요
      </p>

      <div className="mt-3 flex flex-col gap-2">
        {sorted.map((item) => {
          const ready = item.status === 'analyzed';
          return (
            <button
              key={item.id}
              onClick={() =>
                ready
                  ? navigate(`/alternatives?seed=${item.id}&from=closet`)
                  : navigate('/closet')
              }
              className={`flex w-full items-center gap-3 rounded-2xl border bg-white p-3 text-left active:scale-[.99] transition-transform ${
                ready ? 'border-[#DCE8E1]' : 'border-gray-10'
              }`}
            >
              <span className={`h-[52px] w-[52px] shrink-0 overflow-hidden rounded-xl bg-gray-10 ${ready ? '' : 'opacity-60'}`}>
                {item.imageUrl && <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold text-gray-50">{item.brand}</span>
                <span className={`block truncate text-[13px] font-semibold ${ready ? 'text-gray-100' : 'text-gray-50'}`}>
                  {item.name}
                </span>
                {item.price != null && item.price > 0 && (
                  <span className="block text-[11px] text-gray-50">{item.price.toLocaleString()}원</span>
                )}
              </span>
              {ready ? (
                <span
                  className="shrink-0 rounded-lg px-3 py-2 text-[11px] font-bold text-white"
                  style={{ background: '#00916D' }}
                >
                  대체품 찾기
                </span>
              ) : (
                <span className="shrink-0 rounded-lg border border-gray-20 px-2.5 py-2 text-[11px] font-bold text-gray-50">
                  분석 전 · 분석하기
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
