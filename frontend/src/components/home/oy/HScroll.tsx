import { ReactNode, useRef } from 'react';

interface HScrollProps {
  children: ReactNode;
  /** 좌우 패딩을 부모 바깥으로 빼서 풀블리드 스크롤 (-mx-4 px-4) */
  bleed?: boolean;
  className?: string;
}

/**
 * 가로 스크롤 래퍼 (스크롤바 숨김 + peek).
 *
 * 터치·트랙패드는 기본 스와이프로 스크롤되지만, 데스크톱 브라우저에서
 * 마우스로 테스트할 땐 클릭+드래그로 스크롤할 방법이 없었다 — 그래서 마우스
 * 드래그 스크롤을 직접 얹는다. 드래그 중 카드 클릭(네비게이션)까지 같이
 * 발동하지 않도록, 일정 거리 이상 움직였을 때만 다음 클릭 한 번을 막는다.
 */
export function HScroll({ children, bleed = true, className = '' }: HScrollProps) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, moved: false, startX: 0, startScroll: 0 });

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || !ref.current) return;
    drag.current = { active: true, moved: false, startX: e.clientX, startScroll: ref.current.scrollLeft };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current.active || !ref.current) return;
    const dx = e.clientX - drag.current.startX;
    if (Math.abs(dx) > 4) drag.current.moved = true;
    ref.current.scrollLeft = drag.current.startScroll - dx;
  };

  const endDrag = () => {
    drag.current.active = false;
  };

  const onClickCapture = (e: React.MouseEvent) => {
    if (drag.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      drag.current.moved = false;
    }
  };

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      onClickCapture={onClickCapture}
      className={`flex gap-3 overflow-x-auto scrollbar-hide cursor-grab active:cursor-grabbing select-none ${
        bleed ? '-mx-4 px-4' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}
