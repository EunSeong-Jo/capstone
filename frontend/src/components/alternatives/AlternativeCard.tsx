import { useNavigate } from 'react-router-dom';
import { Alternative } from '../../types';
import { Badge } from '../ui/Badge';
import { ReasonTags } from './ReasonTags';

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
  const navigate = useNavigate();
  const handle = onClick ?? (() => navigate(`/detail/${alt.id}`));
  const saving = showSeedDelta && alt.priceDelta != null && alt.priceDelta < 0;

  return (
    <div
      onClick={handle}
      className="flex items-start gap-3 p-3 rounded-xl bg-gray-5 border border-gray-20 active:scale-[.98] transition-transform cursor-pointer"
    >
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
        {alt.reasonTags && alt.reasonTags.length > 0 && (
          <div className="mt-1.5">
            <ReasonTags reasons={alt.reasonTags} max={maxReasons} />
          </div>
        )}
      </div>

      <Badge type={alt.similarityScore >= 80 ? 'sim-high' : 'sim-mid'} label={`${alt.similarityScore}%`} />
    </div>
  );
}
