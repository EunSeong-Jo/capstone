import { ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import { ToastAction, ToastContext } from './toast';

/**
 * 화면 하단에 잠깐 떴다 사라지는 안내 배너.
 *
 * "장바구니에 담았어요" 같은 짧은 알림용입니다. 되돌릴 수 없는 일이나
 * 사용자가 반드시 읽어야 하는 오류에는 쓰지 마세요 — 놓치면 그만인 자리입니다.
 */

interface ToastItem {
  id: number;
  message: string;
  action?: ToastAction;
}

/** 링크가 붙은 토스트는 누를 시간이 필요해 더 오래 둡니다. */
const PLAIN_MS = 2200;
const WITH_ACTION_MS = 3500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const showToast = useCallback((message: string, action?: ToastAction) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message, action }]);
    window.setTimeout(
      () => setToasts((prev) => prev.filter((t) => t.id !== id)),
      action ? WITH_ACTION_MS : PLAIN_MS,
    );
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed left-1/2 z-[100] flex w-full max-w-[430px] -translate-x-1/2 flex-col items-center gap-2 px-6"
        style={{ bottom: 'calc(84px + var(--safe-bottom))' }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-center gap-2.5 rounded-full bg-gray-100/95 px-4 py-2.5 text-[13px] font-semibold text-white shadow-lg"
          >
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action?.onClick();
                  setToasts((prev) => prev.filter((x) => x.id !== t.id));
                }}
                className="shrink-0 whitespace-nowrap text-primary-light underline underline-offset-2 active:opacity-70"
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
