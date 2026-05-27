import { ReactNode } from 'react';

interface PageWrapperProps {
  children: ReactNode;
  className?: string;
  /** 하단 네비게이션 높이만큼 패딩 추가 (탭이 있는 화면에서 사용) */
  hasBottomNav?: boolean;
}

export function PageWrapper({ children, className = '', hasBottomNav = false }: PageWrapperProps) {
  return (
    <div
      className={`flex flex-col min-h-dvh bg-surface ${hasBottomNav ? 'pb-[calc(64px+var(--safe-bottom))]' : ''} ${className}`}
    >
      {children}
    </div>
  );
}
