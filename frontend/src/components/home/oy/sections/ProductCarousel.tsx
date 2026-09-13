import { ReactNode } from 'react';
import { Product } from '../../../../types';
import { OySectionHeader } from '../OySectionHeader';
import { ChipFilter } from '../ChipFilter';
import { ProductCardV } from '../ProductCardV';
import { HScroll } from '../HScroll';

interface ProductCarouselProps {
  title: ReactNode;
  products: Product[];
  ad?: boolean;
  onMore?: () => void;
  chips?: string[];
  /** 카드 좌상단 순위 뱃지 표시 */
  ranked?: boolean;
}

/** 가로 상품 캐러셀 섹션 (3·10·13·22 공용) */
export function ProductCarousel({ title, products, ad, onMore, chips, ranked }: ProductCarouselProps) {
  return (
    <section className="px-4 py-5">
      <OySectionHeader title={title} ad={ad} onMore={onMore} />
      {chips && <ChipFilter chips={chips} className="mb-4 -mx-4 px-4" />}
      <HScroll>
        {products.map((p, i) => (
          <ProductCardV key={p.id} product={p} rank={ranked ? i + 1 : undefined} />
        ))}
      </HScroll>
    </section>
  );
}
