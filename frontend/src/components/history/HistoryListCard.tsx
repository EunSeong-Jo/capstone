import { useNavigate } from 'react-router-dom';
import { Product } from '../../types';

interface HistoryListCardProps {
  product: Product;
  liked: boolean;
  onToggleLike: () => void;
  added?: boolean;
  onAddToCart?: () => void;
  /** 예: "3회 구매" — 자주 구매 탭에서만 사용 */
  extraBadge?: string;
}

export function HistoryListCard({ product, liked, onToggleLike, added, onAddToCart, extraBadge }: HistoryListCardProps) {
  const navigate = useNavigate();

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-2xl bg-white shadow-sm active:scale-[.99] transition-transform cursor-pointer"
      onClick={() => navigate(`/detail/${product.id}`)}
    >
      <div className="w-20 h-20 rounded-xl overflow-hidden bg-gray-10 flex items-center justify-center shrink-0">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-3xl opacity-40">🧴</span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-primary mb-0.5 truncate">{product.brand}</p>
        <p className="text-sm font-medium text-gray-100 leading-snug line-clamp-1 mb-1">{product.name}</p>
        {product.rating !== undefined && (
          <div className="flex items-center gap-1 mb-1">
            <span className="text-star text-xs">★</span>
            <span className="text-xs text-gray-70">{product.rating.toFixed(1)}</span>
            {product.reviewCount && (
              <span className="text-xs text-gray-50">({product.reviewCount.toLocaleString()})</span>
            )}
          </div>
        )}
        <div className="flex items-center gap-1.5 flex-wrap">
          {product.discountRate && <span className="text-sm font-bold text-accent">{product.discountRate}%</span>}
          <span className="text-sm font-bold text-gray-100">{product.price.toLocaleString()}원</span>
          {product.originalPrice && (
            <span className="text-xs text-gray-50 line-through">{product.originalPrice.toLocaleString()}원</span>
          )}
          {extraBadge && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white bg-accent">{extraBadge}</span>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-2 shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); onToggleLike(); }}
          aria-label="찜하기"
          className="active:scale-90 transition-transform"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill={liked ? 'var(--accent)' : 'none'}>
            <path d="M12 21C12 21 3 14.5 3 8.5C3 5.42 5.42 3 8.5 3C10.24 3 11.91 3.81 13 5.08C14.09 3.81 15.76 3 17.5 3C20.58 3 23 5.42 23 8.5C23 14.5 12 21 12 21Z"
              stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {onAddToCart && (
          <button
            onClick={(e) => { e.stopPropagation(); onAddToCart(); }}
            aria-label="장바구니 담기"
            className={`w-8 h-8 rounded-lg flex items-center justify-center active:scale-90 transition-transform ${
              added ? 'bg-primary' : 'bg-gray-20'
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M6 8h12l-1 12H7L6 8z" stroke="white" strokeWidth="1.6" strokeLinejoin="round" />
              <path d="M9 8V6a3 3 0 016 0v2" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
