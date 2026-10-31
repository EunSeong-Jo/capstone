import { useNavigate } from 'react-router-dom';
import { Product } from '../../../types';
import { TagChip } from './TagChip';
import { useCart } from '../../../context/cart';
import { useLikedProducts } from '../../../context/liked';
import { useToast } from '../../../context/toast';
import { CartActionIcon, LikeIcon } from '../../ui/ProductActionIcons';
import { FitBadge } from '../../product/FitBadge';

interface ProductCardVProps {
  product: Product;
  /** 카드 너비 (가로 캐러셀에서 고정폭, 그리드에선 미지정) */
  width?: string;
  /** 좌상단 순위 뱃지(블랙 사각) */
  rank?: number;
}

/** 올리브영식 세로 상품 카드 */
export function ProductCardV({ product, width = 'w-[150px]', rank }: ProductCardVProps) {
  const navigate = useNavigate();
  const { isLiked, toggleLike } = useLikedProducts();
  const { inCart, addToCart, removeLine } = useCart();
  const { showToast } = useToast();
  const liked = isLiked(product.id);
  const carted = inCart(product.id);

  const handleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleLike(product);
    showToast(
      liked ? '좋아요를 취소했어요' : '좋아요에 담았어요',
      liked ? undefined : { label: '보러가기', onClick: () => navigate('/history?tab=liked') },
    );
  };

  // 하트와 같은 토글. 다시 누르면 장바구니에서 뺀다.
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
    <div className={`${width} shrink-0`} onClick={() => navigate(`/detail/${product.id}`)}>
      {/* 이미지 */}
      <div className="relative aspect-square rounded-lg overflow-hidden bg-oy-chip cursor-pointer">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl opacity-30">🧴</div>
        )}
        <FitBadge productId={product.id} className="absolute top-1.5 right-1.5 shadow-sm" />
        {rank != null && (
          <span className="absolute top-0 left-0 inline-flex items-center justify-center w-6 h-6 bg-oy-black text-white text-xs font-bold">
            {rank}
          </span>
        )}
      </div>

      {/* 정보 */}
      <div className="pt-2">
        <p className="text-[13px] font-bold text-oy-text truncate">{product.brand}</p>
        <p className="text-[13px] text-oy-text leading-tight line-clamp-2 mt-0.5">{product.name}</p>

        <div className="flex items-baseline gap-1 mt-1.5">
          {product.discountRate ? (
            <span className="text-[15px] font-extrabold text-oy-red">{product.discountRate}%</span>
          ) : null}
          <span className="text-[15px] font-extrabold text-oy-text">
            {product.price.toLocaleString()}원{product.discountRate ? '' : '~'}
          </span>
        </div>

        {product.tags && product.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {product.tags.map((t) => (
              <TagChip key={t} label={t} />
            ))}
          </div>
        )}

        {product.rating != null && (
          <div className="flex items-center gap-1 mt-1.5">
            <span className="text-oy-text text-xs">★</span>
            <span className="text-xs text-oy-text">{product.rating.toFixed(1)}</span>
            {!!product.reviewCount && (
              <span className="text-xs text-oy-sub">
                ({product.reviewCount > 99999 ? '99,999+' : product.reviewCount.toLocaleString()})
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 mt-2">
          <button onClick={handleLike} aria-label={liked ? '좋아요 취소' : '좋아요'} aria-pressed={liked} className="active:scale-90 transition-transform">
            <LikeIcon on={liked} />
          </button>
          <button onClick={handleCart} aria-label={carted ? '장바구니에서 빼기' : '장바구니 담기'} aria-pressed={carted} className="active:scale-90 transition-transform">
            <CartActionIcon on={carted} />
          </button>
        </div>
      </div>
    </div>
  );
}
