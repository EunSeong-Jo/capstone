import { useNavigate } from 'react-router-dom';
import { Product } from '../../../types';
import { TagChip } from './TagChip';

interface ProductCardVProps {
  product: Product;
  /** 카드 너비 (가로 캐러셀에서 고정폭, 그리드에선 미지정) */
  width?: string;
  /** 좌상단 순위 뱃지(블랙 사각) */
  rank?: number;
}

function HeartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M12 20.5C12 20.5 3.5 15 3.5 9.2C3.5 6.6 5.6 4.5 8.2 4.5C9.8 4.5 11.2 5.3 12 6.5C12.8 5.3 14.2 4.5 15.8 4.5C18.4 4.5 20.5 6.6 20.5 9.2C20.5 15 12 20.5 12 20.5Z"
        stroke="#BBBBBB" strokeWidth="1.5" />
    </svg>
  );
}
function CartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M6 7h13l-1.2 9.5a2 2 0 01-2 1.75H9.2a2 2 0 01-2-1.75L6 7zM6 7L5 3.5H3" stroke="#BBBBBB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="21" r="0.6" fill="#BBBBBB" />
    </svg>
  );
}

/** 올리브영식 세로 상품 카드 */
export function ProductCardV({ product, width = 'w-[150px]', rank }: ProductCardVProps) {
  const navigate = useNavigate();
  return (
    <div className={`${width} shrink-0`} onClick={() => navigate(`/detail/${product.id}`)}>
      {/* 이미지 */}
      <div className="relative aspect-square rounded-lg overflow-hidden bg-oy-chip cursor-pointer">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl opacity-30">🧴</div>
        )}
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
            {product.reviewCount != null && (
              <span className="text-xs text-oy-sub">
                ({product.reviewCount > 99999 ? '99,999+' : product.reviewCount.toLocaleString()})
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 mt-2">
          <button onClick={(e) => e.stopPropagation()} aria-label="찜하기" className="active:scale-90 transition-transform">
            <HeartIcon />
          </button>
          <button onClick={(e) => e.stopPropagation()} aria-label="장바구니" className="active:scale-90 transition-transform">
            <CartIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
