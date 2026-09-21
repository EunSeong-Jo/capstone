import { useNavigate } from 'react-router-dom';
import { Alternative } from '../../types';
import { Badge } from '../ui/Badge';
import { ReasonTags } from './ReasonTags';
import { formatUnitPrice } from '../../utils/unitPrice';
import { similarityBadgeType } from '../../utils/alternatives';
import { useCloset } from '../../context/ClosetContext';

interface AlternativeCardProps {
  alt: Alternative;
  /** 기준제품 대비 가격차(절약액) 노출 여부 */
  showSeedDelta?: boolean;
  /** 이유 태그 최대 노출 개수 */
  maxReasons?: number;
  onClick?: () => void;
}

/** 가로 리스트형 대체품 카드 — 결과화면/상품상세 공용 */
export function AlternativeCard({ alt, showSeedDelta = true, maxReasons = 3, onClick }: AlternativeCardProps) {
  const unitPrice = formatUnitPrice(alt.unitPrice, alt.unitLabel);
  const navigate = useNavigate();
  const handle = onClick ?? (() => navigate(`/detail/${alt.id}`));
  const saving = showSeedDelta && alt.priceDelta != null && alt.priceDelta < 0;
  const { hasItem, addItem, removeItem } = useCloset();
  const inCloset = hasItem(alt.id);

  return (
    <div className="flex flex-col gap-2.5 p-3 rounded-xl bg-gray-5 border border-gray-20">
      <div onClick={handle} className="flex items-start gap-3 active:scale-[.98] transition-transform cursor-pointer">
        <div className="w-16 h-16 rounded-lg overflow-hidden bg-gradient-to-br from-sky-50 to-blue-100 flex items-center justify-center shrink-0">
          {alt.imageUrl ? (
            <img src={alt.imageUrl} alt={alt.name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-2xl opacity-40">🧴</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-70">{alt.brand}</p>
          <p className="text-sm font-semibold text-gray-100 truncate">{alt.name}</p>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-sm font-bold text-gray-100">{alt.price.toLocaleString()}원</span>
            {saving && (
              <span className="text-xs font-bold text-accent">{alt.priceDelta!.toLocaleString()}원</span>
            )}
          </div>
          {unitPrice && <p className="text-xs text-gray-50">{unitPrice}</p>}
          {alt.reasonTags && alt.reasonTags.length > 0 && (
            <div className="mt-1.5">
              <ReasonTags reasons={alt.reasonTags} max={maxReasons} />
            </div>
          )}
        </div>

        <Badge type={similarityBadgeType(alt.similarityScore)} label={`${alt.similarityScore}%`} />
      </div>

      <div className="flex gap-1.5 pl-[76px]">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (inCloset) removeItem(alt.id);
            else
              addItem({
                id: alt.id,
                brand: alt.brand,
                name: alt.name,
                category: alt.category,
                price: alt.price,
                imageUrl: alt.imageUrl,
                addedVia: 'search',
              });
          }}
          className={`flex-1 h-8 rounded-lg text-xs font-bold transition-colors ${
            inCloset ? 'bg-gray-10 text-gray-70' : 'bg-primary text-white'
          }`}
        >
          {inCloset ? '화장대에서 삭제' : '화장대에 추가'}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            navigate('/coming-soon');
          }}
          className="flex-1 h-8 rounded-lg border border-gray-20 text-xs font-bold text-gray-70"
        >
          분석 보기
        </button>
      </div>
    </div>
  );
}
