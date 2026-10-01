import { ReactNode } from 'react';

interface HScrollProps {
  children: ReactNode;
  /** 좌우 패딩을 부모 바깥으로 빼서 풀블리드 스크롤 (-mx-4 px-4) */
  bleed?: boolean;
  className?: string;
}

/** 가로 스크롤 래퍼 (스크롤바 숨김 + peek) */
export function HScroll({ children, bleed = true, className = '' }: HScrollProps) {
  return (
    <div
      className={`flex gap-3 overflow-x-auto scrollbar-hide ${
        bleed ? '-mx-4 px-4' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}
