import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { OySectionHeader } from '../home/oy/OySectionHeader';
import type { FitVerdict } from '../../api/skinFit';
import { useSkinFit } from '../../hooks/useSkinFit';
import { skinTypes } from '../../data/skinTypes';
import { useSkinType } from '../../hooks/useSkinType';

const VERDICT: Record<FitVerdict, { title: string; box: string; badge: string }> = {
  good: {
    title: '내 피부에 잘 맞아요',
    box: 'border-good-line bg-good-soft',
    badge: 'bg-good-soft text-good',
  },
  ok: {
    title: '무난해요',
    box: 'border-oy-line bg-white',
    badge: 'bg-oy-chip text-oy-sub',
  },
  caution: {
    title: '내 피부엔 주의가 필요해요',
    box: 'border-caution-line bg-caution-soft',
    badge: 'bg-caution-soft text-caution',
  },
  unknown: {
    title: '판단할 근거가 부족해요',
    box: 'border-dashed border-oy-line bg-white',
    badge: 'bg-oy-chip text-oy-sub',
  },
};

/**
 * 이 제품이 내 피부에 맞는지.
 *
 * 서버가 성분 기능 라벨(보습·진정·장벽…)과 기피 성분(향료·건조 알코올·자극)으로 판정하고,
 * 왜 그런지 이유를 함께 준다. 진단을 안 했으면 판정하지 않고 진단을 권한다 — 기본 타입으로
 * 단정하지 않는다. 의학적 판단이 아니라 성분 구성 기준의 참고 정보다.
 */
export function SkinFitCard({
  productId,
  onReasonClick,
  headerAside,
}: {
  productId: number;
  /** 제목 줄 오른쪽에 붙는 버튼(상세 화면의 '화장대 추가') */
  headerAside?: ReactNode;
  /** 이유를 눌렀을 때 — 그 이유를 만든 성분의 전성분 표기 순서들을 넘긴다 */
  onReasonClick?: (positions: number[]) => void;
}) {
  const navigate = useNavigate();
  const { fit, loading, needsDiagnosis, error } = useSkinFit(productId);
  const { skinType } = useSkinType();
  const typeLabel = skinTypes.find((t) => t.id === skinType)?.label;

  return (
    <section className="px-4 py-5">
      <OySectionHeader title="내 피부와의 궁합" aside={headerAside} centerAside bottomClass="mb-4" />

      {needsDiagnosis && (
        <div className="rounded-xl border border-dashed border-oy-line bg-white px-4 py-5 text-center">
          <p className="text-sm leading-relaxed text-oy-sub">
            피부타입 진단을 하면 이 제품이 내 피부에 맞는지 알려드려요.
          </p>
          <button
            type="button"
            onClick={() => navigate('/onboarding')}
            className="mt-3 rounded-full bg-primary px-4 py-2 text-sm font-bold text-white active:scale-[.98]"
          >
            피부타입 진단하러 가기
          </button>
        </div>
      )}

      {!needsDiagnosis && loading && (
        <div className="h-24 animate-pulse rounded-xl bg-oy-chip" aria-label="궁합 확인 중" />
      )}

      {!needsDiagnosis && !loading && error && (
        <p className="rounded-xl border border-oy-line bg-white px-4 py-5 text-center text-sm text-oy-sub">
          궁합을 불러오지 못했어요.
        </p>
      )}

      {!needsDiagnosis && !loading && !error && fit && (
        <div className={`rounded-xl border px-4 py-4 ${VERDICT[fit.verdict].box}`}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-base font-bold text-oy-text">
              {VERDICT[fit.verdict].title}
            </p>
            {fit.score !== null && (
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${VERDICT[fit.verdict].badge}`}>
                {fit.score}점
              </span>
            )}
          </div>
          {typeLabel && <p className="mt-1 text-xs text-oy-sub">{typeLabel} 기준</p>}
          {fit.reasons.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {fit.reasons.map((r, i) => {
                const clickable = !!onReasonClick && r.ingredients.length > 0;
                return (
                  <li key={i}>
                    <button
                      type="button"
                      disabled={!clickable}
                      onClick={() => onReasonClick?.(r.ingredients.map((x) => x.position))}
                      className={`flex w-full gap-1.5 text-left text-sm leading-snug text-oy-text ${
                        clickable ? 'active:opacity-60' : 'cursor-default'
                      }`}
                    >
                      <span className={r.kind === 'plus' ? 'text-primary' : 'text-accent'}>
                        {r.kind === 'plus' ? '＋' : '－'}
                      </span>
                      {/* 눌러서 해당 성분을 볼 수 있는 이유는 점선 밑줄 + 강조색 + 끝 화살표로 알린다 */}
                      <span
                        className={
                          clickable
                            ? `font-semibold underline decoration-dotted decoration-1 underline-offset-4 ${
                                r.kind === 'plus' ? 'text-primary' : 'text-accent'
                              }`
                            : ''
                        }
                      >
                        {r.text}
                        {clickable && <span className="ml-0.5 no-underline">›</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {fit.verdict === 'unknown' && (
            <p className="mt-2 text-xs leading-relaxed text-oy-sub">
              이 제품은 성분 분류가 충분하지 않아 궁합을 말씀드리기 어려워요.
            </p>
          )}
          <p className="mt-3 text-[11px] leading-snug text-oy-sub">
            성분 구성 기준의 참고 정보예요. 피부 상태에 따라 다를 수 있어요.
          </p>
        </div>
      )}
    </section>
  );
}
