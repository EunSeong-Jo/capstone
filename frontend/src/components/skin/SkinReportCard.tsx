import { useSkinReport } from '../../hooks/usePersonalAi';
import type { SkinChange } from '../../api/personalAi';

const TREND_STYLE: Record<SkinChange['trend'], string> = {
  up: 'bg-ob-surface text-ob-green-deep',
  down: 'bg-red-50 text-red-500',
  flat: 'bg-gray-5 text-gray-50',
};

function md(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function ChangeRow({ c }: { c: SkinChange }) {
  const sign = c.delta > 0 ? '+' : '';
  return (
    <li className="flex items-center gap-2 py-1.5">
      <span className="w-[72px] shrink-0 text-[12px] font-semibold text-gray-100">{c.name}</span>
      <span className="flex-1 text-[12px] tabular-nums text-gray-50">
        {c.before} → {c.after}
      </span>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${TREND_STYLE[c.trend]}`}>
        {c.trend === 'flat' ? '비슷' : `${sign}${c.delta}`}
      </span>
    </li>
  );
}

/**
 * AI 피부관리 > 피부 변화 리포트 — 최근 사진 분석을 직전 분석과(그리고 처음과) 견주고, 그 사이 화장대에 더한 제품을 나란히 보여 준다.
 * 서버가 문장을 만든다. 원인은 단정하지 않는다("영향이 있었을 수 있어요").
 */
export function SkinReportCard() {
  const { report, loading } = useSkinReport();

  if (loading) return <div className="h-28 animate-pulse rounded-2xl bg-gray-10" aria-hidden />;
  if (!report) return null;

  return (
    <section className="rounded-2xl bg-white px-5 py-4" aria-label="피부 변화 리포트">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-extrabold text-gray-100">피부 변화 리포트</p>
        {report.enough && (
          <span className="text-[11px] text-gray-50">
            {md(report.beforeAt)} → {md(report.afterAt)}
          </span>
        )}
      </div>

      {!report.enough ? (
        <p className="mt-2 text-[12px] leading-relaxed text-gray-50">{report.message}</p>
      ) : (
        <>
          <ul className="mt-2 divide-y divide-gray-10">
            {report.changes.slice(0, 6).map((c) => (
              <ChangeRow key={c.key} c={c} />
            ))}
          </ul>
          <div className="mt-3 flex flex-col gap-1.5 rounded-xl bg-surface-warm px-3 py-2.5">
            {report.notes.map((n, i) => (
              <p key={i} className="text-[12px] leading-relaxed text-gray-70">
                {n}
              </p>
            ))}
          </div>

          {report.firstAt && report.firstChanges.some((c) => c.trend !== 'flat') && (
            <div className="mt-4 border-t border-gray-10 pt-3">
              <p className="text-[12px] font-extrabold text-gray-100">처음({md(report.firstAt)}) 대비</p>
              <ul className="mt-1 divide-y divide-gray-10">
                {report.firstChanges
                  .filter((c) => c.trend !== 'flat')
                  .slice(0, 5)
                  .map((c) => (
                    <ChangeRow key={c.key} c={c} />
                  ))}
              </ul>
              {report.firstNotes.slice(2).length > 0 && (
                <div className="mt-2 flex flex-col gap-1.5 rounded-xl bg-surface-warm px-3 py-2.5">
                  {report.firstNotes.slice(2).map((n, i) => (
                    <p key={i} className="text-[12px] leading-relaxed text-gray-70">
                      {n}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
          <p className="mt-3 text-[11px] text-gray-50">점수는 높을수록 좋아요. 촬영 조건에 따라 몇 점은 달라질 수 있어요.</p>
        </>
      )}
    </section>
  );
}
