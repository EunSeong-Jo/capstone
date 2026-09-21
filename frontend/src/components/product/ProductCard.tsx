import { useNavigate } from 'react-router-dom';
import { Product } from '../../types';
import { useLikedProducts } from '../../context/liked';
import { formatUnitPrice } from '../../utils/unitPrice';

const CARD_BG = [
  'from-green-50 to-emerald-100',
  'from-rose-50 to-pink-100',
  'from-sky-50 to-blue-100',
  'from-amber-50 to-yellow-100',
  'from-purple-50 to-violet-100',
  'from-teal-50 to-cyan-100',
];

interface ProductCardProps {
  product: Product;
  index?: number;
}

export function ProductCard({ product, index = 0 }: ProductCardProps) {
  const unitPrice = formatUnitPrice(product.unitPrice, product.unitLabel);
  const navigate = useNavigate();
  const { isLiked, toggleLike } = useLikedProducts();
  const liked = isLiked(product.id);
  const bg = CARD_BG[index % CARD_BG.length];

  return (
    <div
      className="bg-white rounded-xl shadow-sm overflow-hidden active:scale-[.98] transition-transform cursor-pointer"
      onClick={() => navigate(`/detail/${product.id}`)}
    >
      {/* 이미지 영역 */}
      <div className={`relative aspect-square bg-gradient-to-br ${bg} flex items-center justify-center`}>
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-4xl opacity-40">🧴</span>
        )}

        {/* 배지 */}
        {product.isBest && (
          <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-xs font-bold text-white bg-warning">
            BEST
          </span>
        )}
        {product.isNew && (
          <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-xs font-bold text-white bg-primary">
            NEW
          </span>
        )}

        {/* 찜 버튼 */}
        <button
          className="absolute bottom-2 right-2 w-8 h-8 rounded-lg bg-white/80 flex items-center justify-center shadow-sm active:scale-90 transition-transform"
          onClick={(e) => { e.stopPropagation(); toggleLike(product); }}
          aria-label="찜하기"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill={liked ? 'var(--accent)' : 'none'}>
            <path d="M12 21C12 21 3 14.5 3 8.5C3 5.42 5.42 3 8.5 3C10.24 3 11.91 3.81 13 5.08C14.09 3.81 15.76 3 17.5 3C20.58 3 23 5.42 23 8.5C23 14.5 12 21 12 21Z"
              stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* 정보 영역 */}
      <div className="p-3">
        <p className="text-xs text-gray-70 mb-0.5 truncate">{product.brand}</p>
        <p className="text-sm font-medium text-gray-100 leading-tight line-clamp-2 mb-1.5">{product.name}</p>

        {/* 별점 */}
        {product.rating !== undefined && (
          <div className="flex items-center gap-1 mb-1.5">
            <span className="text-star text-xs">★</span>
            <span className="text-xs text-gray-70">{product.rating.toFixed(1)}</span>
            {product.reviewCount && (
              <span className="text-xs text-gray-50">({product.reviewCount.toLocaleString()})</span>
            )}
          </div>
        )}

        {/* 가격 */}
        <div className="flex items-baseline gap-1.5">
          {product.discountRate && (
            <span className="text-sm font-bold text-accent">{product.discountRate}%</span>
          )}
          <span className="text-base font-bold text-gray-100">
            {product.price.toLocaleString()}원
          </span>
          {product.originalPrice && (
            <span className="text-xs text-gray-50 line-through">
              {product.originalPrice.toLocaleString()}원
            </span>
          )}
        </div>
        {unitPrice && <div className="mt-0.5 text-xs text-gray-50">{unitPrice}</div>}
      </div>
    </div>
  );
}
