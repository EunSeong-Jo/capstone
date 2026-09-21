import { createContext, ReactNode, useCallback, useContext, useRef, useState } from 'react';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastItem {
  id: number;
  message: string;
  action?: ToastAction;
}

interface ToastContextValue {
  /** action을 주면 토스트 끝에 클릭 가능한 링크가 붙는다 (예: "장바구니로 이동하기") */
  showToast: (message: string, action?: ToastAction) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** 화면 하단에 잠깐 떴다 사라지는 안내 배너 — "장바구니에 담겼어요" 같은 짧은 알림용 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const showToast = useCallback((message: string, action?: ToastAction) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message, action }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, action ? 3500 : 2200);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className="fixed left-1/2 z-[100] flex w-full max-w-[430px] -translate-x-1/2 flex-col items-center gap-2 px-6"
        style={{ bottom: 'calc(84px + var(--safe-bottom))' }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-2.5 rounded-full bg-gray-100/95 px-4 py-2.5 text-[13px] font-semibold text-white shadow-lg"
          >
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action!.onClick();
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

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
