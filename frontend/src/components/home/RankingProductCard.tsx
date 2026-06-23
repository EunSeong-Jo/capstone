import { Product } from '../../types';

interface RankingProductCardProps {
  product: Product;
  rank: number; // 1-based
  onClick?: () => void;
}

const RANK_BADGE: Record<number, string> = {
  1: 'bg-atelier-gold text-white',
  2: 'bg-atelier-silver text-white',
  3: 'bg-atelier-bronze text-white',
};

export function RankingProductCard({ product, rank, onClick }: RankingProductCardProps) {
  const badgeClass = RANK_BADGE[rank] ?? 'bg-atelier-neutral text-atelier-text-sub';

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 bg-white rounded-2xl p-3 shadow-soft text-left active:scale-[.98] transition-transform"
    >
      {/* 순위 배지 */}
      <span
        className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center font-headline text-sm font-bold ${badgeClass}`}
      >
        {rank}
      </span>

      {/* 썸네일 */}
      <span className="shrink-0 w-14 h-14 rounded-xl overflow-hidden bg-atelier-secondary-light flex items-center justify-center">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-2xl opacity-40">🧴</span>
        )}
      </span>

      {/* 정보 */}
      <span className="min-w-0 flex-1">
        <span className="block font-body text-xs text-atelier-text-sub truncate">
          {product.brand}
        </span>
        <span className="block font-body text-sm font-medium text-atelier-text leading-tight line-clamp-2">
          {product.name}
        </span>
        <span className="flex items-center gap-1 mt-1">
          {product.rating !== undefined && (
            <>
              <span className="text-atelier-star text-xs">★</span>
              <span className="font-body text-xs text-atelier-text-sub">
                {product.rating.toFixed(1)}
              </span>
            </>
          )}
          <span className="font-headline text-sm font-bold text-atelier-text ml-auto">
            {product.price.toLocaleString()}원
          </span>
        </span>
      </span>
    </button>
  );
}
