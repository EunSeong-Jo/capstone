import { useEffect, useRef, useState } from 'react';
import type { ProductOption } from '../../api/products';

/**
 * 옵션형 묶음 제품의 옵션 고르기 — '화장발 · 카밍풀 · 모이스처풀…'.
 *
 * 옵션마다 전성분이 달라 옵션이 곧 별개의 제품 행이다(분해 규칙: backend/app/utils/product_options.py). 고르면 그 옵션의
 * 상세·성분 분석으로 이동하므로 전성분·궁합·대체품이 모두 그 옵션 기준으로 바뀐다. 이동은 호출부가 `replace`로 하고
 * (히스토리가 쌓이지 않게) 스크롤 위치를 유지한다(`pickOption`).
 */
export function OptionPicker({
  options,
  currentId,
  onPick,
}: {
  options: ProductOption[];
  currentId: number;
  onPick: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (options.length < 2) return null;
  const current = options.find((o) => o.id === currentId);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-oy-line bg-white px-3.5 py-2.5 text-left active:bg-oy-chip"
      >
        <span className="min-w-0">
          <span className="block text-[10px] font-semibold text-oy-sub">옵션 {options.length}종</span>
          <span className="block truncate text-sm font-bold text-oy-text">{current?.label ?? '옵션 선택'}</span>
        </span>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          className={`shrink-0 text-oy-sub transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="옵션"
          className="absolute left-0 right-0 top-full z-20 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-oy-line bg-white p-1.5 shadow-lg"
        >
          {options.map((o) => {
            const on = o.id === currentId;
            return (
              <li key={o.id} role="option" aria-selected={on}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    if (!on) onPick(o.id);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm ${
                    on ? 'bg-primary-light font-bold text-primary' : 'text-oy-text active:bg-oy-chip'
                  }`}
                >
                  {o.label}
                  {on && <span className="text-[11px] font-bold">선택됨</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
