interface PaginationProps {
  current: number;
  total: number;
  onPrev?: () => void;
  onNext?: () => void;
}

/** `< 19 | 20 >` 형태의 숫자 페이지네이션 */
export function Pagination({ current, total, onPrev, onNext }: PaginationProps) {
  return (
    <div className="flex items-center justify-center gap-3 py-3 text-sm text-oy-sub">
      <button onClick={onPrev} aria-label="이전" className="active:scale-90 transition-transform">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <span>
        <span className="text-oy-text font-bold">{current}</span>
        <span className="mx-1">|</span>
        {total}
      </span>
      <button onClick={onNext} aria-label="다음" className="active:scale-90 transition-transform">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}

interface NumberIndicatorProps {
  current: number;
  total: number;
}

/** `01 | 17 +` 형태의 배너 인디케이터 */
export function NumberIndicator({ current, total }: NumberIndicatorProps) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <div className="inline-flex items-center gap-2 text-sm text-oy-text/70">
      <span className="font-bold text-oy-text">{pad(current)}</span>
      <span>|</span>
      <span>{pad(total)}</span>
      <span className="ml-1 text-base leading-none">+</span>
    </div>
  );
}

interface DotsProps {
  count: number;
  active: number;
}

/** 점 인디케이터 */
export function Dots({ count, active }: DotsProps) {
  return (
    <div className="flex items-center justify-center gap-1.5 py-3">
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className={`h-1.5 rounded-full transition-all ${
            i === active ? 'w-4 bg-oy-black' : 'w-1.5 bg-oy-line'
          }`}
        />
      ))}
    </div>
  );
}
