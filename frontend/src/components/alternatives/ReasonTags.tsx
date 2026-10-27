import { AltReasonTag, AltReasonType } from '../../types';

/** 추천 이유 4축별 칩 스타일 (유사도 제외 3축) */
const STYLE: Record<AltReasonType, string> = {
  skinMatch: 'bg-primary-light text-primary',
  priceSave: 'bg-accent-light text-accent',
  situation: 'bg-orange-50 text-warning',
  similarity: 'bg-primary text-white',
};
const ICON: Record<AltReasonType, string> = {
  skinMatch: '💚',
  priceSave: '💰',
  situation: '⚠️',
  similarity: '',
};

interface ReasonTagsProps {
  reasons: AltReasonTag[];
  /** 노출 최대 개수 (초과분은 +N) */
  max?: number;
  /** 유사도(similarity)는 보통 우상단 뱃지로 따로 표시하므로 기본 제외 */
  excludeSimilarity?: boolean;
}

/** 대체품 추천 이유 태그 행 (성분궁합·가격절약·상황대응) */
export function ReasonTags({ reasons, max = 3, excludeSimilarity = true }: ReasonTagsProps) {
  const list = excludeSimilarity ? reasons.filter((r) => r.type !== 'similarity') : reasons;
  if (list.length === 0) return null;
  const shown = list.slice(0, max);
  const rest = list.length - shown.length;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((r, i) => (
        <span
          key={i}
          className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-bold ${STYLE[r.type]}`}
        >
          {ICON[r.type] && <span>{ICON[r.type]}</span>}
          {r.label}
        </span>
      ))}
      {rest > 0 && (
        <span className="inline-flex items-center rounded-md bg-gray-10 px-1.5 py-0.5 text-[11px] font-bold text-gray-70">
          +{rest}
        </span>
      )}
    </div>
  );
}
