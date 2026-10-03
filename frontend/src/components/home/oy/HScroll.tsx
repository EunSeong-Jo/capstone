import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';

interface HScrollProps {
  children: ReactNode;
  /** 좌우 패딩을 부모 바깥으로 빼서 풀블리드 스크롤 (-mx-4 px-4) */
  bleed?: boolean;
  className?: string;
}

/** 드래그로 본다 — 이만큼 넘게 움직였으면 손을 뗄 때의 클릭(카드 열기)을 막는다 */
const DRAG_THRESHOLD = 6;

/**
 * 가로 스크롤 래퍼 (스크롤바 숨김 + peek).
 *
 * 터치는 브라우저가 알아서 민다. **마우스로는 옆으로 갈 방법이 없었다** —
 * 스크롤바를 숨겼고 휠은 세로로만 돈다. 그래서 PC(앱 창)에서 캐러셀이
 * 고정된 것처럼 보였다. 마우스 드래그와, 호버가 되는 기기에서만 보이는
 * 좌우 화살표를 붙인다.
 */
export function HScroll({ children, bleed = true, className = '' }: HScrollProps) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({
      start: el.scrollLeft <= 2,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2,
    });
  }, []);

  // 카드가 늦게 들어오면(조회 후) 폭이 바뀐다 — 크기 변화를 따라 다시 잰다.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    Array.from(el.children).forEach((c) => ro.observe(c));
    return () => ro.disconnect();
  }, [measure, children]);

  const page = (dir: 1 | -1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  return (
    <div className={`group relative ${bleed ? '-mx-4' : ''}`}>
      <div
        ref={ref}
        onScroll={measure}
        onPointerDown={(e) => {
          if (e.pointerType !== 'mouse' || !ref.current) return;
          drag.current = { x: e.clientX, left: ref.current.scrollLeft, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || !ref.current) return;
          const dx = e.clientX - d.x;
          if (Math.abs(dx) > DRAG_THRESHOLD) d.moved = true;
          ref.current.scrollLeft = d.left - dx;
        }}
        onPointerUp={() => {
          // moved는 뒤이어 오는 click 캡처에서 본다.
          window.setTimeout(() => (drag.current = null), 0);
        }}
        onPointerLeave={() => {
          drag.current = null;
        }}
        onClickCapture={(e) => {
          if (drag.current?.moved) {
            e.stopPropagation();
            e.preventDefault();
          }
        }}
        onDragStart={(e) => e.preventDefault()}
        className={`flex gap-3 overflow-x-auto scrollbar-hide select-none ${bleed ? 'px-4' : ''} ${className}`}
      >
        {children}
      </div>

      {/* 좌우 화살표 — 마우스(호버 가능) 기기에서만 */}
      {!edges.start && (
        <button
          type="button"
          aria-label="이전"
          onClick={() => page(-1)}
          className="absolute left-1 top-[38%] z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 shadow-[0_2px_8px_rgba(0,0,0,.18)] active:scale-90 [@media(hover:hover)]:flex"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M15 5l-7 7 7 7" stroke="#17171C" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      {!edges.end && (
        <button
          type="button"
          aria-label="다음"
          onClick={() => page(1)}
          className="absolute right-1 top-[38%] z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 shadow-[0_2px_8px_rgba(0,0,0,.18)] active:scale-90 [@media(hover:hover)]:flex"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M9 5l7 7-7 7" stroke="#17171C" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
