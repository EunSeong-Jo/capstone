import type { AnalysisDto } from '../../api/skinPhoto';
import {
  CONCERN_META,
  CONCERN_ORDER,
  EXTENDED_ONLY,
  SKIN_TYPE_LABEL,
} from '../../data/skinConcerns';

/**
 * 얼굴 사진 분석 상세.
 *
 * 점수는 0~100이고 **높을수록 좋다**(업체 기준) — 막대가 길수록 그 항목이 건강하다.
 * 그래서 낮은 항목이 눈에 띄도록 색으로 구분한다. 의료적 진단이 아니라 사진 한 장으로 본
 * 참고 값이라는 점을 화면에 적는다.
 *
 * 무료 사용자의 분석에는 확장 4개(탄력·광채·피부결·다크서클)가 없다. `showUpsell`이면
 * 그 자리를 구독 안내로 채운다.
 */
interface SkinAnalysisDetailProps {
  analysis: AnalysisDto;
  showUpsell?: boolean;
  /** 구독 안내를 누르면. 없으면 안내 문구만 보인다 */
  onUpsell?: () => void;
}

const typeLabel = (v: string | null) => (v ? (SKIN_TYPE_LABEL[v] ?? v) : '-');

/** 점수 → 막대 색 토큰. 80 이상 양호, 60~79 보통, 그 아래는 신경 쓸 부분 */
function tone(score: number) {
  if (score >= 80) return { bar: 'bg-primary', text: 'text-primary-dark' };
  if (score >= 60) return { bar: 'bg-warning', text: 'text-gray-70' };
  return { bar: 'bg-accent', text: 'text-accent' };
}

export default function SkinAnalysisDetail({
  analysis,
  showUpsell = false,
  onUpsell,
}: SkinAnalysisDetailProps) {
  const byKey = new Map(analysis.concerns.map((c) => [c.key, c.score]));
  const rows = CONCERN_ORDER.filter((k) => byKey.has(k));
  const { whole, tZone, uZone } = analysis.skinTypes;

  return (
    <div className="flex flex-col gap-4">
      {/* 피부 분류 */}
      <div className="rounded-2xl bg-ob-surface px-4 py-3">
        <p className="text-[11px] font-semibold text-ob-green-deep">AI가 본 피부 분류</p>
        <div className="mt-2 flex items-center gap-2">
          <span className="rounded-full bg-white px-3 py-1 text-[13px] font-extrabold text-gray-100">
            {typeLabel(whole)}
          </span>
          {(tZone || uZone) && (
            <p className="text-[11px] leading-relaxed text-gray-70">
              T존 {typeLabel(tZone)} · U존 {typeLabel(uZone)}
            </p>
          )}
        </div>
      </div>

      {/* 항목별 */}
      <ul className="flex flex-col gap-3">
        {rows.map((key) => {
          const score = byKey.get(key) ?? 0;
          const meta = CONCERN_META[key];
          const t = tone(score);
          return (
            <li key={key}>
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] font-semibold text-gray-100">{meta?.label ?? key}</span>
                <span className={`text-[12px] font-bold ${t.text}`}>
                  {score}
                  <span className="ml-1 font-medium text-gray-50">
                    {score < 60 && meta ? meta.low : ''}
                  </span>
                </span>
              </div>
              <div
                className="mt-1 h-2 overflow-hidden rounded-full bg-gray-10"
                role="progressbar"
                aria-label={meta?.label ?? key}
                aria-valuenow={score}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className={`h-full rounded-full ${t.bar}`} style={{ width: `${score}%` }} />
              </div>
            </li>
          );
        })}
      </ul>

      {/* 확장 항목 안내 (무료 분석) */}
      {showUpsell && !analysis.extended && (
        <button
          type="button"
          onClick={onUpsell}
          disabled={!onUpsell}
          className="rounded-2xl border border-dashed border-ob-green/50 bg-white px-4 py-3 text-left disabled:cursor-default"
        >
          <p className="text-[12px] font-bold text-ob-green-deep">
            구독하면 {EXTENDED_ONLY.map((k) => CONCERN_META[k].label).join('·')}까지 12가지를 분석해요
          </p>
          <p className="mt-0.5 text-[11px] text-gray-50">월 4회, 주 1회 AI 피부관리</p>
        </button>
      )}

      <p className="text-[10px] leading-relaxed text-gray-50">
        사진 한 장으로 본 참고 값이에요. 조명·화장·각도에 따라 달라질 수 있고 의료적 진단이
        아니에요.
      </p>
    </div>
  );
}
