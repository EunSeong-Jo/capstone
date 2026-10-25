import { useEffect, useRef, useState } from 'react';
import type { ClosetItem } from '../../context/closet';

/**
 * 대체품 화면의 기준 제품 고르기 — 같은 카테고리의 내 화장대 제품 중에서.
 *
 * 홈의 '내 스킨케어 제품과 비슷한 추천' 더보기로 들어오면 기준 제품이 하나로 정해져 있어,
 * 다른 화장대 제품의 대체품을 보려면 뒤로 갔다가 다시 골라야 했다. 이 드롭다운으로 화면 안에서 바꾼다.
 *
 * 후보는 **기준 제품과 같은 카테고리**의 화장대 제품뿐이다(스킨케어 기준이면 스킨케어끼리) —
 * 다른 카테고리로 바꾸면 비교 대상이 달라져 "대체품" 의미가 흐려진다.
 */
export function SeedSwitcher({
  seedId,
  options,
  onPick,
  children,
}: {
  seedId: number;
  options: ClosetItem[];
  onPick: (id: number) => void;
  /** 기준 제품 카드의 내용(썸네일·이름·가격). 이 카드가 드롭다운을 여는 버튼이 된다 */
  children: React.ReactNode;
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

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="기준 제품 바꾸기"
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="min-w-0 flex-1">{children}</span>
        <span className="flex shrink-0 flex-col items-center gap-0.5 text-[10px] font-semibold text-primary">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            className={`transition-transform ${open ? 'rotate-180' : ''}`}
          >
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          바꾸기
        </span>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="내 화장대 제품"
          className="absolute left-0 right-0 top-full z-20 mt-2 max-h-72 overflow-y-auto rounded-xl border border-gray-20 bg-white p-1.5 shadow-lg"
        >
          {options.map((item) => {
            const on = item.id === seedId;
            return (
              <li key={item.id} role="option" aria-selected={on}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    if (!on) onPick(item.id);
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left ${
                    on ? 'bg-primary-light' : 'active:bg-gray-5'
                  }`}
                >
                  <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-gray-10">
                    {item.imageUrl && <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10px] font-bold text-gray-50">{item.brand}</span>
                    <span className="block truncate text-[13px] font-semibold text-gray-100">{item.name}</span>
                  </span>
                  {on && <span className="shrink-0 text-[11px] font-bold text-primary">선택됨</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
