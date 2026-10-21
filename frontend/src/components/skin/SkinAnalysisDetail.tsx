import { useState } from 'react';
import type { AnalysisDto } from '../../api/skinPhoto';
import AnalysisImage from './AnalysisImage';
import AnalysisGuideSheet from './AnalysisGuideSheet';
import {
  CONCERN_META,
  CONCERN_ORDER,
  EXTENDED_ONLY,
  EXTENDED_TOTAL,
  SKIN_TYPE_LABEL,
} from '../../data/skinConcerns';

/**
 * 얼굴 사진 분석 상세.
 *
 * 점수는 0~100이고 **높을수록 좋다**(업체 기준) — 막대가 길수록 그 항목이 건강하다.
 * 그래서 낮은 항목이 눈에 띄도록 색으로 구분한다. 의료적 진단이 아니라 사진 한 장으로 본
 * 참고 값이라는 안내는 종합 평가의 느낌표 시트(`AnalysisGuideSheet`)에 있다.
 *
 * 무료 사용자의 분석에는 확장 항목(탄력·광채·피부결·다크서클·눈가 4개)이 없다. `showUpsell`이면
 * 그 자리를 구독 안내로 채운다.
 */
interface SkinAnalysisDetailProps {
  analysis: AnalysisDto;
  /**
   * 바로 앞 분석. 있으면 "분석 이미지 보기"가 **왼쪽 이전 / 오른쪽 현재**로 나란히 보여 준다.
   * 이전 분석에 그 항목 이미지가 없으면(동의 철회·다른 PC의 기록) 현재 것만 보인다.
   */
  previous?: AnalysisDto | null;
  /** 비교 화면의 날짜 표기. `previous`가 있을 때만 쓴다 */
  previousLabel?: string;
  currentLabel?: string;
  showUpsell?: boolean;
  /** 구독 안내를 누르면. 없으면 안내 문구만 보인다 */
  onUpsell?: () => void;
}

const typeLabel = (v: string | null) => (v ? (SKIN_TYPE_LABEL[v] ?? v) : '-');

/**
 * 업체의 피부 분류(`skin_type`)를 3단계로 옮긴다. 문서가 정한 응답값은 8가지다 — Normal,
 * Oily, Dry, Combination, Redness, Dry & Redness, Oily & Redness, Combination & Redness.
 * 좋고 나쁨의 순서는 문서에 없어서, **치우친 문제가 몇 가지인지**로 나눴다:
 * Normal(0가지)은 양호, 한 가지(Oily·Dry·Combination·Redness)는 보통, 둘이 겹친 분류
 * (`… & Redness`)는 부족.
 */
const CLASS_LEVELS = ['부족', '보통', '양호'] as const;
function classLevel(v: string): number {
  if (v === 'Normal') return 2;
  return v.split('&').length >= 2 ? 0 : 1;
}
const CLASS_ACTIVE = ['bg-accent text-white', 'bg-warning text-white', 'bg-primary text-white'];
// 종합 평가 머리말("양호 80")의 글자색 — 막대 블록과 같은 색
const CLASS_TEXT = ['text-accent', 'text-warning', 'text-primary-dark'];

/** 점수 → 막대 색 토큰. 80 이상 양호, 60~79 보통, 그 아래는 신경 쓸 부분 */
function tone(score: number) {
  if (score >= 80) return { bar: 'bg-primary', text: 'text-primary-dark' };
  if (score >= 60) return { bar: 'bg-warning', text: 'text-gray-70' };
  return { bar: 'bg-accent', text: 'text-accent' };
}

/**
 * 항목별 점수를 한 줄 평가로 모은다. 평균과 함께 가장 좋은 항목(80점 이상, 최대 2개)과
 * 신경 쓸 항목(75점 미만 중 낮은 순 최대 2개)을 고른다. 서버가 주는 값이 아니라 화면에서 계산한다.
 */
function summarize(analysis: AnalysisDto) {
  const items = analysis.concerns.filter((c) => CONCERN_META[c.key]);
  if (items.length === 0) return null;
  const average = Math.round(items.reduce((sum, c) => sum + c.score, 0) / items.length);
  const label = (key: string) => CONCERN_META[key].label;
  const good = [...items].filter((c) => c.score >= 80).sort((x, y) => y.score - x.score).slice(0, 2).map((c) => label(c.key));
  const focus = [...items].filter((c) => c.score < 75).sort((x, y) => x.score - y.score).slice(0, 2).map((c) => label(c.key));
  const headline =
    average >= 80 ? '전반적으로 좋은 상태예요' : average >= 60 ? '전반적으로 보통이에요' : '관리가 필요한 항목이 많아요';
  return { average, count: items.length, headline, good, focus };
}

/** 직전 대비 점수 변화. 증가는 초록 ▲, 하락은 빨강 ▼, 같으면 회색 – */
function Delta({ diff }: { diff: number }) {
  if (diff === 0) return <span className="mr-1.5 font-medium text-gray-50">–</span>;
  return (
    <span
      className={`mr-1.5 font-bold ${diff > 0 ? 'text-[#22A06B]' : 'text-[#E5484D]'}`}
      aria-label={`이전보다 ${Math.abs(diff)}점 ${diff > 0 ? '올랐어요' : '내려갔어요'}`}
    >
      {diff > 0 ? '▲' : '▼'}
      {Math.abs(diff)}
    </span>
  );
}

export default function SkinAnalysisDetail({
  analysis,
  previous = null,
  previousLabel = '이전',
  currentLabel = '현재',
  showUpsell = false,
  onUpsell,
}: SkinAnalysisDetailProps) {
  const byKey = new Map(analysis.concerns.map((c) => [c.key, c.score]));
  // 바로 앞 분석의 같은 항목 점수 — 현재 점수 왼쪽에 변화(▲3·▼2)로 보여 준다. 양쪽에 있는 항목만 센다.
  const prevByKey = new Map((previous?.concerns ?? []).map((c) => [c.key, c.score]));
  // 항목별 분석 이미지를 한 번에 하나만 펼친다.
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const hasImage = new Set(analysis.images ?? []);
  const rows = CONCERN_ORDER.filter((k) => byKey.has(k));
  const { whole, tZone, uZone } = analysis.skinTypes;
  const summary = summarize(analysis);
  const headLevel = whole ? classLevel(whole) : summary ? (summary.average >= 80 ? 2 : summary.average >= 60 ? 1 : 0) : 1;

  return (
    <div className="flex flex-col gap-4">
      {/* 종합 평가 — 항목별 점수를 모아 한눈에 */}
      {summary && (
        <div className="rounded-2xl bg-ob-surface px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <p className="text-[11px] font-semibold text-ob-green-deep">AI 종합 평가</p>
              <button
                type="button"
                onClick={() => setGuideOpen(true)}
                aria-label="분석 결과 읽는 법 보기"
                className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border border-ob-green-deep text-[11px] font-extrabold leading-none text-ob-green-deep active:scale-90"
              >
                !
              </button>
            </div>
            <p className="text-[11px] text-gray-50">항목 {summary.count}개 평균</p>
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            {/* "양호 80" — 앞은 피부 분류 단계, 뒤는 항목 평균. 분류가 없으면 평균 점수로 단계를 정한다 */}
            <span className={`text-[26px] font-extrabold ${CLASS_TEXT[headLevel]}`}>{CLASS_LEVELS[headLevel]}</span>
            <span className={`text-[26px] font-extrabold ${tone(summary.average).text}`}>{summary.average}</span>
            <span className="text-[12px] font-bold text-gray-100">{summary.headline}</span>
          </div>
          <dl className="mt-2 flex flex-col gap-1.5 text-[12px] leading-relaxed">
            <div className="flex gap-2">
              <dt className="w-[64px] shrink-0 font-semibold text-ob-green-deep">잘 관리됨</dt>
              <dd className="text-gray-70">{summary.good.length ? summary.good.join(' · ') : '아직 뚜렷하게 좋은 항목은 없어요'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-[64px] shrink-0 font-semibold text-accent">신경 쓸 곳</dt>
              <dd className="text-gray-70">{summary.focus.length ? summary.focus.join(' · ') : '특별히 낮은 항목이 없어요'}</dd>
            </div>
          </dl>
        </div>
      )}

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
                  {prevByKey.has(key) && <Delta diff={score - (prevByKey.get(key) ?? score)} />}
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
              {hasImage.has(key) && (
                <>
                  <button
                    type="button"
                    onClick={() => setOpenKey(openKey === key ? null : key)}
                    aria-expanded={openKey === key}
                    className="mt-1.5 text-[11px] font-semibold text-ob-green-deep underline underline-offset-2"
                  >
                    {openKey === key ? '분석 이미지 접기' : '분석 이미지 보기'}
                  </button>
                  {openKey === key && (
                    <div className="mt-2">
                      {previous && (previous.images ?? []).includes(key) ? (
                        // 왼쪽 이전 · 오른쪽 현재
                        <div className="grid grid-cols-2 gap-2">
                          <figure className="min-w-0">
                            <figcaption className="mb-1 truncate text-center text-[11px] font-semibold text-gray-50">
                              이전 · {previousLabel}
                            </figcaption>
                            <AnalysisImage
                              analysisId={previous.analysisId}
                              imageKey={key}
                              label={`${meta?.label ?? key} 이전`}
                            />
                          </figure>
                          <figure className="min-w-0">
                            <figcaption className="mb-1 truncate text-center text-[11px] font-semibold text-ob-green-deep">
                              현재 · {currentLabel}
                            </figcaption>
                            <AnalysisImage
                              analysisId={analysis.analysisId}
                              imageKey={key}
                              label={`${meta?.label ?? key} 현재`}
                            />
                          </figure>
                        </div>
                      ) : (
                        <>
                          <AnalysisImage
                            analysisId={analysis.analysisId}
                            imageKey={key}
                            label={meta?.label ?? key}
                          />
                          {previous && (
                            <p className="mt-1 text-[11px] text-gray-50">이전 분석에는 이 항목 이미지가 없어요.</p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>

      {/* 피부 분류 — 부족|보통|양호 블록 중 해당하는 칸을 칠한다 */}
      {whole && (
        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] font-semibold text-gray-100">피부 분류</span>
            <span className="text-[12px] font-bold text-gray-70">
              {typeLabel(whole)}
              {(tZone || uZone) && (
                <span className="ml-1 font-medium text-gray-50">
                  (T존 {typeLabel(tZone)} · U존 {typeLabel(uZone)})
                </span>
              )}
            </span>
          </div>
          <div
            className="mt-1 grid grid-cols-3 gap-1"
            role="img"
            aria-label={`피부 분류 ${CLASS_LEVELS[classLevel(whole)]}`}
          >
            {CLASS_LEVELS.map((name, i) => (
              <span
                key={name}
                className={`flex h-6 items-center justify-center rounded-md text-[11px] font-semibold ${
                  i === classLevel(whole) ? CLASS_ACTIVE[i] : 'bg-gray-10 text-gray-50'
                }`}
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 확장 항목 안내 (무료 분석) */}
      {showUpsell && !analysis.extended && (
        <button
          type="button"
          onClick={onUpsell}
          disabled={!onUpsell}
          className="rounded-2xl border border-dashed border-ob-green/50 bg-white px-4 py-3 text-left disabled:cursor-default"
        >
          <p className="text-[12px] font-bold text-ob-green-deep">
            구독하면 {EXTENDED_ONLY.slice(0, 4).map((k) => CONCERN_META[k].label).join('·')} 등 눈가까지
            {' '}{EXTENDED_TOTAL}가지를 분석해요
          </p>
          <p className="mt-0.5 text-[11px] text-gray-50">월 4회, 주 1회 AI 피부관리</p>
        </button>
      )}

      {guideOpen && <AnalysisGuideSheet analysis={analysis} onClose={() => setGuideOpen(false)} />}

    </div>
  );
}
