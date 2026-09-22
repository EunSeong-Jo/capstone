import { useNavigate } from 'react-router-dom';
import { Product } from '../../types';
import { useToast } from '../../context/toast';
import { useLikedProducts } from '../../context/liked';
import { formatUnitPrice } from '../../utils/unitPrice';
import { HeartIcon } from '../ui/OutlineIcons';

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
  const { showToast } = useToast();
  const liked = isLiked(product.id);

  // 하트가 작고 카드 구석에 있어 눌렀는지 확신이 안 선다. 담겼다는 사실을
  // 말로 한 번 더 알린다.
  const handleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleLike(product);
    showToast(liked ? '찜을 해제했어요' : '찜 목록에 추가했어요');
  };
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
          onClick={handleLike}
          aria-label={liked ? '찜 해제' : '찜하기'}
        >
          <HeartIcon size={16} filled={liked} className="text-[var(--accent)]" />
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
