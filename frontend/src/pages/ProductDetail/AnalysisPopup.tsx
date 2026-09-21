import { Icon } from '../../components/category/Icon';

interface MatchRow {
  label: string;
  percent: number;
  highlight?: boolean;
}

interface IngredientRow {
  name: string;
  description: string;
  badge: '추천' | '주의';
}

interface KeywordRow {
  label: string;
  count: number;
}

const MATCH_ROWS: MatchRow[] = [
  { label: '말랑말랑 인절미 타입의 매칭율', percent: 92, highlight: true },
  { label: '수분팡팡 옹달샘 타입의 매칭율', percent: 88 },
  { label: '조심조심 유리구슬 타입의 매칭율', percent: 82 },
  { label: '반질반질 물개 타입의 매칭율', percent: 64 },
];

const INGREDIENT_ROWS: IngredientRow[] = [
  { name: '히알루론산', description: '고보습ㆍ수분 유지력 우수', badge: '추천' },
  { name: '세라마이드', description: '피부 장벽 강화', badge: '추천' },
  { name: '향료', description: '민감 피부는 소량 주의', badge: '주의' },
];

const KEYWORD_ROWS: KeywordRow[] = [
  { label: '촉촉함', count: 128 },
  { label: '흡수력 좋음', count: 94 },
  { label: '향 약함', count: 61 },
];

interface AnalysisPopupProps {
  skinType: string;
  matchPercent: number;
  onClose: () => void;
}

export function AnalysisPopup({ skinType, matchPercent, onClose }: AnalysisPopupProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6" onClick={onClose}>
      <div
        className="w-full max-w-[354px] max-h-[80dvh] overflow-y-auto rounded-[20px] bg-gray-10 shadow-lg p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 매칭 요약 카드 */}
        <div className="rounded-[15px] bg-white p-4 text-center">
          <p className="text-[11px] font-medium tracking-wide text-gray-100">{skinType}타입의 매칭율</p>
          <p className="mt-1 text-2xl font-medium text-ob-green-deep">{matchPercent}%</p>
          <span className="inline-block mt-1.5 px-3 py-1 rounded-full bg-ob-green-deep/[0.13] text-[8px] text-gray-100">
            추천등급 | 매우 좋음
          </span>
        </div>

        {/* 피부 타입별 매칭도 */}
        <p className="text-[10px] text-gray-100 mt-5 mb-3">피부 타입별 매칭도</p>
        <div className="flex flex-col gap-3.5">
          {MATCH_ROWS.map((row) => (
            <div key={row.label}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] tracking-wide text-gray-100">{row.label}</span>
                <span className="text-xs font-medium text-ob-green-deep">{row.percent}%</span>
              </div>
              <div className="mt-1.5 h-1 rounded bg-[#d9d9d9]">
                <div
                  className={`h-1 rounded ${row.highlight ? 'bg-[#f5c2c7]' : 'bg-ob-green-deep/60'}`}
                  style={{ width: `${row.percent}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* 핵심 성분 분석 */}
        <p className="text-[10px] text-gray-100 mt-5 mb-3">핵심 성분 분석</p>
        <div className="flex flex-col gap-2">
          {INGREDIENT_ROWS.map((row) => (
            <div key={row.name} className="flex items-center justify-between rounded-[7px] border-[0.5px] border-black/30 bg-white px-3.5 py-2">
              <div>
                <p className="text-[10px] font-medium text-gray-100">{row.name}</p>
                <p className="text-[8px] text-gray-70">{row.description}</p>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[8px] ${
                  row.badge === '추천' ? 'bg-ob-green-deep/[0.13] text-ob-green-deep' : 'bg-[#f5c2c7]/30 text-[#f88893]'
                }`}
              >
                {row.badge}
              </span>
            </div>
          ))}
        </div>

        {/* 자주 언급된 키워드 */}
        <p className="text-[10px] text-gray-100 mt-5 mb-3">자주 언급된 키워드</p>
        <div className="flex flex-wrap gap-1.5">
          {KEYWORD_ROWS.map((kw) => (
            <span key={kw.label} className="px-3 py-1 rounded-full bg-[#159e51]/[0.13] text-[8px] text-gray-100">
              {kw.label} {kw.count}
            </span>
          ))}
        </div>

        {/* 닫기 */}
        <div className="flex justify-center mt-5">
          <button type="button" onClick={onClose} className="active:scale-90 transition-transform" aria-label="닫기">
            <Icon name="close" size={24} className="text-gray-70" />
          </button>
        </div>
      </div>
    </div>
  );
}
