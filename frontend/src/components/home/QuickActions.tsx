import { ReactNode } from 'react';

interface QuickActionButtonProps {
  icon: ReactNode;
  label: string;
  description: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}

function QuickActionButton({
  icon,
  label,
  description,
  onClick,
  disabled = false,
  variant = 'primary',
}: QuickActionButtonProps) {
  const iconBg =
    variant === 'primary' ? 'bg-atelier-primary-light' : 'bg-atelier-secondary-light';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex-1 flex items-center gap-3 bg-white rounded-2xl p-4 shadow-soft text-left active:scale-[.98] transition-transform disabled:opacity-50 disabled:active:scale-100"
    >
      <span className={`w-11 h-11 rounded-xl flex items-center justify-center ${iconBg}`}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-headline text-base font-bold text-atelier-text leading-tight">
          {label}
        </span>
        <span className="block font-body text-xs text-atelier-text-sub mt-0.5 truncate">
          {description}
        </span>
      </span>
    </button>
  );
}

interface QuickActionsProps {
  onScan?: () => void;
  onManual: () => void;
}

export function QuickActions({ onScan, onManual }: QuickActionsProps) {
  return (
    <div className="flex gap-3">
      {/* TODO: /scan 라우트(카메라/OCR) 신설 후 disabled 해제 + onScan 연결 */}
      <QuickActionButton
        variant="primary"
        disabled
        onClick={onScan}
        label="제품 스캔"
        description="준비 중"
        icon={
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2"
              stroke="#5F7D81" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M3 12h18" stroke="#5F7D81" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        }
      />
      <QuickActionButton
        variant="secondary"
        onClick={onManual}
        label="직접 입력"
        description="제품·성분 검색"
        icon={
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M12 20h9" stroke="#9A8B7A" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z"
              stroke="#9A8B7A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        }
      />
    </div>
  );
}
