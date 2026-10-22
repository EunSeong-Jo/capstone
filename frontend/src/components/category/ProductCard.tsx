import { useNavigate } from 'react-router-dom';
import { PriceTag } from './PriceTag';
import { ActionIcons } from './ActionIcons';
import type { CategoryProduct } from './types';
import { FitBadge } from '../product/FitBadge';

interface ProductCardProps {
  product: CategoryProduct;
  onToggleFavorite?: (id: number) => void;
  onAddToCart?: (id: number) => void;
}

/** 그리드 상품 카드: 사진 / 제목 / 가격 / 찜·장바구니 아이콘(가로) */
export function ProductCard({ product, onToggleFavorite, onAddToCart }: ProductCardProps) {
  const navigate = useNavigate();

  return (
    <div
      className="flex flex-col h-full cursor-pointer active:opacity-80 transition-opacity"
      onClick={() => navigate(`/detail/${product.id}`)}
    >
      <div className="relative aspect-square w-full rounded-md bg-gray-10 overflow-hidden">
        {product.imageUrl && (
          <img src={product.imageUrl} alt={product.title} className="w-full h-full object-cover" />
        )}
        <FitBadge productId={product.id} className="absolute top-1.5 right-1.5 shadow-sm" />
      </div>

      <p className="mt-3 text-sm text-gray-100 leading-snug line-clamp-3">{product.title}</p>

      <div className="mt-1 mb-5">
        <PriceTag price={product.price} originalPrice={product.originalPrice} discountPercent={product.discountPercent} />
      </div>

      {/* 카드마다 가격 줄 수가 달라도 아이콘 줄은 항상 카드 하단에 맞춰 정렬 */}
      <div className="mt-auto">
        <ActionIcons
          direction="row"
          isFavorite={product.isFavorite}
          onToggleFavorite={() => onToggleFavorite?.(product.id)}
          onAddToCart={() => onAddToCart?.(product.id)}
        />
      </div>
    </div>
  );
}
