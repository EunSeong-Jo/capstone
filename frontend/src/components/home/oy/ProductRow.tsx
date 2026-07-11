import { useNavigate } from 'react-router-dom';
import { Product } from '../../../types';
import { RankBadge } from './RankBadge';
import { TagChip } from './TagChip';

interface ProductRowProps {
  product: Product;
  /** 좌측 순위 뱃지 (블랙 사각). 없으면 미표시 */
  rank?: number;
  /** 우측 액션: 찜 + 장바구니 표시 여부 */
  showCart?: boolean;
}

/** 올리브영식 가로형 상품 행 (순위 리스트 / 행 리스트 공용) */
export function ProductRow({ product, rank, showCart = true }: ProductRowProps) {
  const navigate = useNavigate();
  return (
    <div
      className="flex items-center gap-3 py-3 cursor-pointer"
      onClick={() => navigate(`/detail/${product.id}`)}
    >
      {/* 썸네일 + 순위 */}
      <div className="relative shrink-0 w-[72px] h-[72px] rounded-lg overflow-hidden bg-oy-chip">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xl opacity-30">🧴</div>
        )}
        {rank != null && (
          <span className="absolute top-0 left-0">
            <RankBadge rank={rank} />
          </span>
        )}
      </div>

      {/* 정보 */}
      <div className="min-w-0 flex-1">
        <p className="text-sm text-oy-text leading-tight line-clamp-2">{product.name}</p>
        <div className="flex items-baseline gap-1 mt-1">
          {product.discountRate ? (
            <span className="text-[15px] font-extrabold text-oy-red">{product.discountRate}%</span>
          ) : null}
          <span className="text-[15px] font-extrabold text-oy-text">
            {product.price.toLocaleString()}원~
          </span>
        </div>
        {product.tags && product.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {product.tags.map((t) => (
              <TagChip key={t} label={t} />
            ))}
          </div>
        )}
      </div>

      {/* 액션 */}
      {showCart && (
        <div className="shrink-0 flex flex-col items-center gap-3 self-start pt-1">
          <button onClick={(e) => e.stopPropagation()} aria-label="찜하기" className="active:scale-90 transition-transform">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 20.5C12 20.5 3.5 15 3.5 9.2C3.5 6.6 5.6 4.5 8.2 4.5C9.8 4.5 11.2 5.3 12 6.5C12.8 5.3 14.2 4.5 15.8 4.5C18.4 4.5 20.5 6.6 20.5 9.2C20.5 15 12 20.5 12 20.5Z"
                stroke="#BBBBBB" strokeWidth="1.5" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
