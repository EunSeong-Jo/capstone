import { createContext, useContext } from 'react';

/**
 * Context 객체·타입·훅만 담습니다.
 *
 * Provider(`ToastContext.tsx`)와 파일을 나눈 이유는 Fast Refresh 때문입니다 —
 * 자세한 배경은 `closet.ts` 상단 주석을 보세요.
 */

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastContextValue {
  /** action을 주면 토스트 끝에 누를 수 있는 링크가 붙습니다 (예: "장바구니로 이동") */
  showToast: (message: string, action?: ToastAction) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
