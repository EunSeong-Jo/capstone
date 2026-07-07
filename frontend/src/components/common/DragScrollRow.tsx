import { useRef } from 'react';
import type { PointerEvent, ReactNode } from 'react';

interface DragScrollRowProps {
  children: ReactNode;
  className?: string;
}

/** 마우스로도 좌우 드래그해서 스크롤할 수 있는 가로 스크롤 컨테이너 (터치 스와이프는 기본 지원) */
export function DragScrollRow({ children, className = '' }: DragScrollRowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({ isDown: false, startX: 0, startScrollLeft: 0, moved: false });

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    drag.current = { isDown: true, startX: e.clientX, startScrollLeft: el.scrollLeft, moved: false };
    el.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current.isDown || !ref.current) return;
    const dx = e.clientX - drag.current.startX;
    if (Math.abs(dx) > 3) drag.current.moved = true;
    ref.current.scrollLeft = drag.current.startScrollLeft - dx;
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    drag.current.isDown = false;
    el?.releasePointerCapture(e.pointerId);

    // 드래그가 있었다면 뒤이어 발생하는 click(카드 이동 등)을 한 번만 무시
    if (drag.current.moved && el) {
      const blockClick = (ev: MouseEvent) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      el.addEventListener('click', blockClick, { capture: true, once: true });
    }
  };

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={`overflow-x-auto scrollbar-hide cursor-grab active:cursor-grabbing select-none ${className}`}
      style={{ touchAction: 'pan-y' }}
    >
      {children}
    </div>
  );
}
