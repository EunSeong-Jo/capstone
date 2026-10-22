import { useNavigate } from 'react-router-dom';
import { Alternative } from '../../types';
import { ReasonTags } from './ReasonTags';
import { FitPill } from '../product/FitBadge';
import { similarToState, similarityBadgeType } from '../../utils/alternatives';

interface AlternativeCardVProps {
  alt: Alternative;
  width?: string;
}

/** 세로 대체품 카드 — 홈 캐러셀용 (유사도 뱃지 + 이유 태그) */
export function AlternativeCardV({ alt, width = 'w-[160px]' }: AlternativeCardVProps) {
  const navigate = useNavigate();
  const saving = alt.priceDelta != null && alt.priceDelta < 0;

  return (
    <div
      className={`${width} shrink-0`}
      onClick={() => navigate(`/detail/${alt.id}`, { state: similarToState(alt) })}
    >
      <div className="relative aspect-square rounded-lg overflow-hidden bg-oy-chip cursor-pointer">
        {alt.imageUrl ? (
          <img src={alt.imageUrl} alt={alt.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl opacity-30">🧴</div>
        )}
        {/* 궁합 뱃지 + 바로 아래 유사도 */}
        <div className="absolute top-1.5 right-1.5 flex flex-col items-end gap-1">
          <FitPill verdict={alt.skinMatch?.verdict} className="shadow-sm" />
          <span
            className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white"
            style={{
              backgroundColor:
                similarityBadgeType(alt.similarityScore) === 'sim-high'
                  ? 'var(--primary)'
                  : 'var(--warning)',
            }}
          >
            유사도 {alt.similarityScore}%
          </span>
        </div>
      </div>

      <div className="pt-2">
        <p className="text-[13px] font-bold text-oy-text truncate">{alt.brand}</p>
        <p className="text-[13px] text-oy-text leading-tight line-clamp-2 mt-0.5">{alt.name}</p>

        <div className="flex items-baseline gap-1 mt-1.5">
          <span className="text-[15px] font-extrabold text-oy-text">{alt.price.toLocaleString()}원</span>
          {saving && (
            <span className="text-xs font-bold text-accent">{alt.priceDelta!.toLocaleString()}</span>
          )}
        </div>

        {alt.reasonTags && alt.reasonTags.length > 0 && (
          <div className="mt-1.5">
            <ReasonTags reasons={alt.reasonTags} max={2} />
          </div>
        )}
      </div>
    </div>
  );
}
