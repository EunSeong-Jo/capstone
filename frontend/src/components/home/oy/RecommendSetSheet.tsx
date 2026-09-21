import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { RecommendationSet } from '../../../hooks/useRecommendations';

interface RecommendSetSheetProps {
  open: boolean;
  onClose: () => void;
  nickname: string;
  set: RecommendationSet;
  error: string | null;
  onRetry: () => void;
  onAddAll: () => void;
}

/**
 * 피부타입 맞춤 추천 세트 — 우하단 FAB으로 여는 바텀시트.
 *
 * 홈 본문에 인라인으로 있던 섹션을 그대로 옮긴 것이다. 홈 최상단 자리는
 * 교체 제안이 쓰고, 추천 세트는 찾을 때만 꺼내 보는 쪽으로 내렸다.
 *
 * z-40/z-50을 쓰는 이유: FAB이 z-30, OyBottomNav가 z-20이라 그보다 낮으면
 * 시트 위로 버튼들이 비친다.
 */
export function RecommendSetSheet({
  open,
  onClose,
  nickname,
  set,
  error,
  onRetry,
  onAddAll,
}: RecommendSetSheetProps) {
  const navigate = useNavigate();

  // 열려 있는 동안 뒤 배경이 따라 스크롤되지 않게 막는다.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);

    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="맞춤 추천 세트"
        className="fixed bottom-0 left-1/2 z-50 w-full max-w-[430px] -translate-x-1/2 animate-slide-up rounded-t-3xl bg-white px-4 pt-3"
        style={{ paddingBottom: 'calc(var(--safe-bottom) + 16px)' }}
      >
        <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-oy-line" />

        <h2 className="text-[15px] font-extrabold text-oy-text">
          🎯 {nickname}님 맞춤 추천 세트
        </h2>
        <p className="mt-0.5 text-[11px] text-oy-sub">{set.rationale}</p>

        {set.items.length > 0 ? (
          <>
            <div className="mt-3 flex gap-2">
              {set.items.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    onClose();
                    navigate(`/detail/${p.id}`);
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="aspect-square overflow-hidden rounded-lg bg-oy-line">
                    <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
                  </div>
                  <p className="mt-1 truncate text-[10px] font-bold text-oy-sub">{p.brand}</p>
                  <p className="line-clamp-2 text-[11px] font-semibold leading-snug text-oy-text">
                    {p.name}
                  </p>
                  <p className="text-[11px] font-extrabold text-oy-text">
                    {p.price.toLocaleString()}원
                  </p>
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-oy-line pt-3">
              <span className="text-[12px] font-bold text-oy-text">
                세트 합계 {set.total.toLocaleString()}원
              </span>
              <button
                onClick={onAddAll}
                className="rounded-full px-4 py-2 text-[12px] font-bold text-white transition-transform active:scale-95"
                style={{ background: '#00916D' }}
              >
                장바구니에 담기
              </button>
            </div>
          </>
        ) : error ? (
          <div className="py-8 text-center">
            <p className="text-[13px] text-oy-sub">{error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 rounded-full border border-oy-text/20 px-4 py-1.5 text-[13px] font-medium transition-transform active:scale-95"
            >
              다시 시도
            </button>
          </div>
        ) : (
          <div className="mt-3 flex animate-pulse gap-2">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="min-w-0 flex-1">
                <div className="aspect-square rounded-lg bg-oy-line" />
                <div className="mt-2 h-3 w-2/3 rounded bg-oy-line" />
                <div className="mt-1.5 h-3 w-full rounded bg-oy-line" />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
