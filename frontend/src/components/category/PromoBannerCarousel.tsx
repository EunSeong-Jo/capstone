import { useNavigate } from 'react-router-dom';
import { PriceTag } from './PriceTag';
import type { CategoryProduct } from './types';

interface PromoBannerCarouselProps {
  products: CategoryProduct[];
}

/** 프로모션 배너 캐러셀: 사진 / 제목 / 가격 (아이콘 없음) */
export function PromoBannerCarousel({ products }: PromoBannerCarouselProps) {
  const navigate = useNavigate();

  return (
    <div className="flex gap-3 px-4 overflow-x-auto scrollbar-hide">
      {products.map((product) => (
        <div
          key={product.id}
          className="w-[150px] flex-shrink-0 cursor-pointer active:opacity-80 transition-opacity"
          onClick={() => navigate(`/detail/${product.id}`)}
        >
          <div className="w-[150px] h-[150px] rounded-md bg-gray-10 overflow-hidden">
            {product.imageUrl && (
              <img src={product.imageUrl} alt={product.title} className="w-full h-full object-cover" />
            )}
          </div>
          <p className="mt-3 text-sm text-gray-100 leading-snug line-clamp-2">{product.title}</p>
          <div className="mt-1">
            <PriceTag price={product.price} originalPrice={product.originalPrice} discountPercent={product.discountPercent} />
          </div>
        </div>
      ))}
    </div>
  );
}
