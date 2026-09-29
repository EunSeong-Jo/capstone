import { useNavigate } from 'react-router-dom';
import { PriceTag } from './PriceTag';
import { ActionIcons } from './ActionIcons';
import type { CategoryProduct } from './types';

interface RankedProductCardProps {
  rank: number;
  product: CategoryProduct;
  onToggleFavorite?: (id: number) => void;
  onAddToCart?: (id: number) => void;
}

/** BEST 랭킹 카드: 썸네일+순위뱃지(겹침) / 제목+가격(가로 정보블록) / 찜·장바구니 아이콘(세로) */
export function RankedProductCard({ rank, product, onToggleFavorite, onAddToCart }: RankedProductCardProps) {
  const navigate = useNavigate();

  return (
    <div
      className="flex items-center gap-[9px] cursor-pointer active:opacity-80 transition-opacity"
      onClick={() => navigate(`/detail/${product.id}`)}
    >
      <div className="relative w-14 h-14 flex-shrink-0 rounded-md bg-gray-10 overflow-hidden">
        {product.imageUrl && (
          <img src={product.imageUrl} alt={product.title} className="w-full h-full object-cover" />
        )}
        <span className="absolute top-0 left-0 min-w-[13px] h-[13px] px-0.5 flex items-center justify-center rounded-sm bg-gray-100 text-white text-[9px] font-bold leading-none">
          {rank}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-100 leading-snug line-clamp-2">{product.title}</p>
        <div className="mt-1">
          <PriceTag
            layout={product.originalPrice !== undefined ? 'inline' : 'stacked'}
            price={product.price}
            originalPrice={product.originalPrice}
            discountPercent={product.discountPercent}
          />
        </div>
      </div>

      <ActionIcons
        direction="column"
        isFavorite={product.isFavorite}
        onToggleFavorite={() => onToggleFavorite?.(product.id)}
        onAddToCart={() => onAddToCart?.(product.id)}
      />
    </div>
  );
}
