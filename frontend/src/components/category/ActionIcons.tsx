import { Icon } from './Icon';

interface ActionIconsProps {
  direction?: 'row' | 'column';
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onAddToCart?: () => void;
}

export function ActionIcons({ direction = 'row', isFavorite = false, onToggleFavorite, onAddToCart }: ActionIconsProps) {
  return (
    <div className={`flex ${direction === 'row' ? 'flex-row gap-4' : 'flex-col gap-2'}`}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleFavorite?.(); }}
        className={`active:scale-90 transition-transform ${isFavorite ? 'text-accent' : 'text-gray-50'}`}
        aria-label="찜하기"
      >
        <Icon name="favorite" />
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onAddToCart?.(); }}
        className="text-gray-50 active:scale-90 transition-transform"
        aria-label="장바구니 담기"
      >
        <Icon name="local_mall" />
      </button>
    </div>
  );
}
