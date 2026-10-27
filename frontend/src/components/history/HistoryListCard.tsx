import { useNavigate } from 'react-router-dom';
import { Product } from '../../types';
import { CartActionIcon, LikeIcon } from '../ui/ProductActionIcons';
import { useCart } from '../../context/cart';
import { useToast } from '../../context/toast';

interface HistoryListCardProps {
  product: Product;
  liked: boolean;
  onToggleLike: () => void;
  /** 예: "3회 구매" — 자주 구매 탭에서만 사용 */
  extraBadge?: string;
}

export function HistoryListCard({ product, liked, onToggleLike, extraBadge }: HistoryListCardProps) {
  const navigate = useNavigate();
  const { inCart, addToCart, removeLine } = useCart();
  const { showToast } = useToast();
  const carted = inCart(product.id);

  const handleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleLike();
    showToast(liked ? '좋아요를 취소했어요' : '좋아요에 담았어요');
  };

  // 홈 카드(ProductCardV)와 같은 토글. 예전에는 담긴 상태에서 누르면 수량만
  // 조용히 늘어서 아무 반응이 없는 것처럼 보였다.
  const handleCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (carted) {
      removeLine(product.id);
      showToast('장바구니에서 뺐어요');
      return;
    }
    addToCart({
      id: product.id,
      name: product.name,
      brand: product.brand,
      price: product.price,
      imageUrl: product.imageUrl,
    });
    showToast('장바구니에 담았어요', { label: '장바구니로 이동', onClick: () => navigate('/cart') });
  };

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
            {!!product.reviewCount && (
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
            <span className="px-1.5 py-0.5 rounded text-[11px] font-bold text-white bg-accent">{extraBadge}</span>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 shrink-0">
        <button
          onClick={handleLike}
          aria-label={liked ? '좋아요 취소' : '좋아요'}
          aria-pressed={liked}
          className="active:scale-90 transition-transform"
        >
          <LikeIcon on={liked} />
        </button>
        <button
          onClick={handleCart}
          aria-label={carted ? '장바구니에서 빼기' : '장바구니 담기'}
          aria-pressed={carted}
          className="active:scale-90 transition-transform"
        >
          <CartActionIcon on={carted} />
        </button>
      </div>
    </div>
  );
}
