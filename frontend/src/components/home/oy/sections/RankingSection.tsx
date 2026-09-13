import { useState, ReactNode } from 'react';
import { Product } from '../../../../types';
import { OySectionHeader } from '../OySectionHeader';
import { ChipFilter } from '../ChipFilter';
import { ProductRow } from '../ProductRow';
import { Pagination } from '../Pagination';

interface RankingSectionProps {
  title: ReactNode;
  chips: string[];
  products: Product[];
  onMore?: () => void;
}

/** 8·23. 칩 필터 + 순위 리스트(블랙 사각 뱃지) + 페이지네이션 */
export function RankingSection({ title, chips, products, onMore }: RankingSectionProps) {
  const [page, setPage] = useState(1);
  const total = 20;
  return (
    <section className="px-4 py-5">
      <OySectionHeader title={title} onMore={onMore} />
      <ChipFilter chips={chips} className="mb-2 -mx-4 px-4" />
      <div className="divide-y divide-oy-line">
        {products.map((p, i) => (
          <ProductRow key={p.id} product={p} rank={i + 1} />
        ))}
      </div>
      <Pagination
        current={page}
        total={total}
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => Math.min(total, p + 1))}
      />
    </section>
  );
}
