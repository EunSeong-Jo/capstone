import { SkinType, SKIN_TYPE_META } from '../../types';

interface SkinTypeBadgeProps {
  skinType: SkinType;
  onRediagnose?: () => void;
}

export function SkinTypeBadge({ skinType, onRediagnose }: SkinTypeBadgeProps) {
  const meta = SKIN_TYPE_META[skinType];

  return (
    <div className="flex items-center justify-between px-4 py-3 mx-4 rounded-xl bg-primary-light border border-primary/20">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{meta.emoji}</span>
        <div>
          <p className="text-xs text-primary/70 font-medium">내 피부타입</p>
          <p className="text-base font-bold text-primary">{meta.label}</p>
        </div>
      </div>
      {onRediagnose && (
        <button
          onClick={onRediagnose}
          className="flex items-center gap-0.5 text-xs text-gray-70 active:scale-95 transition-transform"
        >
          재진단
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
