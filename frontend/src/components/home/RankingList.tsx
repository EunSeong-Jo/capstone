import { useNavigate } from 'react-router-dom';
import { Product } from '../../types';
import { RankingProductCard } from './RankingProductCard';
import { SectionHeader } from './SectionHeader';

interface RankingListProps {
  products: Product[];
  title?: string;
  updatedAt?: string;
}

export function RankingList({ products, title = '실시간 인기 제품', updatedAt }: RankingListProps) {
  const navigate = useNavigate();

  return (
    <section>
      <SectionHeader
        overline="Ranking"
        title={title}
        action={
          updatedAt ? (
            <span className="font-body text-xs text-atelier-text-sub">{updatedAt}</span>
          ) : undefined
        }
      />
      <div className="flex flex-col gap-2">
        {products.map((product, i) => (
          <RankingProductCard
            key={product.id}
            product={product}
            rank={i + 1}
            onClick={() => navigate(`/detail/${product.id}`)}
          />
        ))}
      </div>
    </section>
  );
}
