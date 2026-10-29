import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchSkinReport } from '../../api/personalAi';
import type { SkinChange, SkinReportDto } from '../../api/personalAi';
import type { AnalysisDto } from '../../api/skinPhoto';
import { useToast } from '../../context/toast';
import { useSkinReport } from '../../hooks/usePersonalAi';

const TREND_PILL: Record<SkinChange['trend'], string> = {
  up: 'bg-ob-surface text-ob-green-deep',
  down: 'bg-red-50 text-red-500',
  flat: 'bg-gray-5 text-gray-50',
};
const TREND_BAR: Record<SkinChange['trend'], string> = { up: 'bg-primary', down: 'bg-red-400', flat: 'bg-gray-20' };

function md(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** 받침 있으면 '이에요', 없으면 '예요' */
function iyo(word: string): string {
  const c = word.charCodeAt(word.length - 1) - 0xac00;
  return c >= 0 && c % 28 !== 0 ? '이에요' : '예요';
}

function stampOf(iso: string): string {
  const d = new Date(iso);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${hm}`;
}

function PickBox({ label, value, onChange, history }: { label: string; value: string; onChange: (v: string) => void; history: AnalysisDto[] }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[12px] text-gray-50">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-xl border border-gray-20 bg-white pl-2 pr-0 text-[12px] text-gray-100 outline-none focus:border-primary"
      >
        {history.map((a) => (
          <option key={a.analysisId} value={a.analysisId}>
            {stampOf(a.createdAt)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** 이전 점수는 눈금, 이후 점수는 막대 — 얼마나 움직였는지 한눈에 */
function ChangeRow({ c }: { c: SkinChange }) {
  const sign = c.delta > 0 ? '+' : '';
  return (
    <li className="py-3">
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-bold text-gray-100">{c.name}</span>
        <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-extrabold tabular-nums ${TREND_PILL[c.trend]}`}>
          {c.trend === 'flat' ? '비슷' : `${sign}${c.delta}`}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2.5">
        <div className="relative h-2 flex-1 rounded-full bg-gray-10">
          <span className={`absolute inset-y-0 left-0 rounded-full ${TREND_BAR[c.trend]}`} style={{ width: `${c.after}%` }} />
          <span className="absolute -top-1 h-4 w-0.5 rounded bg-gray-70" style={{ left: `${c.before}%` }} aria-hidden />
        </div>
        <span className="w-[64px] shrink-0 text-right text-[12px] tabular-nums text-gray-70">
          {c.before} → {c.after}
        </span>
      </div>
    </li>
  );
}

/** 분석별 평균 점수 추이. 비교하는 두 분석을 강조하고 점수·날짜를 적는다 */
function Trend({ timeline, beforeAt, afterAt }: { timeline: SkinReportDto['timeline']; beforeAt: string | null; afterAt: string | null }) {
  if (timeline.length < 2) return null;
  const W = 300;
  const H = 150;
  const top = 22;
  const bottom = 26;
  const vals = timeline.map((t) => t.average);
  const lo = Math.min(...vals) - 4;
  const hi = Math.max(...vals) + 4;
  const pts = timeline.map((t, i) => ({
    x: 30 + (i * (W - 60)) / (timeline.length - 1),
    y: top + (H - top - bottom) * (1 - (t.average - lo) / (hi - lo || 1)),
    on: [beforeAt, afterAt].some((a) => a && new Date(a).getTime() === new Date(t.at).getTime()),
    avg: t.average,
    day: md(t.at),
  }));
  return (
    <div className="mt-3 rounded-xl bg-surface-warm px-3.5 py-3">
      <p className="text-[13px] font-bold text-gray-70">평균 점수 추이</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full" role="img" aria-label="분석별 평균 점수 추이">
        <polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#B5BAC1" strokeWidth="2" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={p.on ? 6 : 4} fill={p.on ? '#2B6B52' : '#B5BAC1'} />
            <text x={p.x} y={p.y - 11} textAnchor="middle" fontSize="12" fontWeight={p.on ? 800 : 500} fill={p.on ? '#2B6B52' : '#8A8F98'}>
              {p.avg}
            </text>
            <text x={p.x} y={H - 6} textAnchor="middle" fontSize="10.5" fill={p.on ? '#1F2937' : '#8A8F98'} fontWeight={p.on ? 700 : 400}>
              {p.day}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/**
 * AI 피부관리 > 피부 변화 리포트 — 기본은 최근 분석과 바로 이전 분석의 비교. 두 날짜를 고르고 "리포트 보기"를 누르면 그 비교가 나온다.
 * 사실(점수 변화·그 기간에 화장대에 더한 제품)을 나란히 보여 줄 뿐 원인은 단정하지 않는다.
 */
export function SkinReportCard({ history }: { history: AnalysisDto[] | null }) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { report: defaultReport, loading } = useSkinReport();
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [custom, setCustom] = useState<SkinReportDto | null>(null);
  const [busy, setBusy] = useState(false);

  const list = history ?? [];
  const canPick = list.length >= 2;
  const from = fromId && list.some((a) => a.analysisId === fromId) ? fromId : (list[1]?.analysisId ?? '');
  const to = toId && list.some((a) => a.analysisId === toId) ? toId : (list[0]?.analysisId ?? '');
  const report = custom ?? defaultReport;

  const view = async () => {
    setBusy(true);
    try {
      setCustom(await fetchSkinReport(from, to));
    } catch {
      showToast('리포트를 불러오지 못했어요. 잠시 뒤에 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="h-28 animate-pulse rounded-2xl bg-gray-10" aria-hidden />;
  if (!report) return null;

  const ups = report.changes.filter((c) => c.trend === 'up').length;
  const downs = report.changes.filter((c) => c.trend === 'down').length;
  const flats = report.changes.length - ups - downs;
  const moved = report.changes.filter((c) => c.trend !== 'flat');

  const names = (t: SkinChange['trend']) => report.changes.filter((c) => c.trend === t).map((c) => c.name).join('·');
  const best = [...moved].filter((c) => c.trend === 'up').sort((x, y) => y.delta - x.delta)[0];
  const worst = [...moved].filter((c) => c.trend === 'down').sort((x, y) => x.delta - y.delta)[0];
  const flow =
    ups > downs ? '전반적으로 좋아지는 흐름이에요.' : downs > ups ? '조금 신경 써서 관리하면 좋은 흐름이에요.' : moved.length === 0 ? '피부 상태가 안정적으로 유지되고 있어요.' : '좋아진 항목과 신경 쓸 항목이 함께 있어요.';

  return (
    <section className="rounded-2xl bg-white px-5 py-5" aria-label="피부 변화 리포트">
      <div className="flex items-center justify-between">
        <p className="text-[16px] font-extrabold text-gray-100">피부 변화 리포트</p>
        {report.enough && <span className="text-[12px] text-gray-50">{report.days > 0 ? `${report.days}일 사이` : '같은 날'}</span>}
      </div>

      {report.enough && <Trend timeline={report.timeline} beforeAt={report.beforeAt} afterAt={report.afterAt} />}

      {canPick && (
        <div className="mt-3">
          <div className="grid grid-cols-2 gap-2">
            <PickBox label="비교할 이전 분석" value={from} onChange={setFromId} history={list} />
            <PickBox label="비교할 이후 분석" value={to} onChange={setToId} history={list} />
          </div>
          <button
            type="button"
            onClick={view}
            disabled={busy || from === to}
            className="mt-2.5 h-11 w-full rounded-xl bg-primary text-[13px] font-bold text-white active:scale-[.98] disabled:bg-gray-20 disabled:text-gray-50"
          >
            {busy ? '불러오는 중…' : '리포트 보기'}
          </button>
        </div>
      )}

      {!report.enough ? (
        <p className="mt-4 text-[13px] leading-relaxed text-gray-70">{report.message}</p>
      ) : (
        <>
          <p className="mt-5 text-[14px] font-extrabold text-gray-100">항목별 점수</p>
          {moved.length === 0 ? (
            <details className="mt-1">
              <summary className="cursor-pointer py-1 text-[13px] font-semibold text-gray-70">모두 보기</summary>
              <ul className="divide-y divide-gray-10">
                {report.changes.slice(0, 6).map((c) => (
                  <ChangeRow key={c.key} c={c} />
                ))}
              </ul>
            </details>
          ) : (
            <ul className="divide-y divide-gray-10">
              {report.changes.slice(0, 6).map((c) => (
                <ChangeRow key={c.key} c={c} />
              ))}
            </ul>
          )}
          <p className="mt-1 text-[12px] text-gray-50">눈금은 이전 점수, 막대는 이후 점수예요. 높을수록 좋아요.</p>

          {/* 한눈에 */}
          <div className="mt-5 rounded-2xl bg-ob-surface px-4 py-4">
            <p className="text-[17px] font-extrabold leading-snug text-gray-100">{moved.length === 0 ? '눈에 띄는 변화가 없어요' : flow}</p>
            <p className="mt-0.5 text-[12px] text-gray-70">
              {md(report.beforeAt)} → {md(report.afterAt)}
            </p>
          </div>

          {/* 해설 */}
          <div className="mt-3 rounded-2xl bg-surface-warm px-4 py-4">
            <p className="text-[14px] font-extrabold text-gray-100">해설</p>
            <ul className="mt-2 flex flex-col gap-1.5 text-[13px] leading-relaxed text-gray-100">
              <li>
                · 좋아짐 <b className="text-ob-green-deep">{ups}개</b>
                {ups > 0 && ` (${names('up')})`}, 비슷 <b>{flats}개</b>
                {flats > 0 && ` (${names('flat')})`}, 신경 쓸 항목 <b className={downs > 0 ? 'text-red-500' : ''}>{downs}개</b>
                {downs > 0 && ` (${names('down')})`}예요.
              </li>
              {best && (
                <li>
                  · 가장 많이 좋아진 항목은 <b>{best.name}</b>{iyo(best.name)}. {best.before}점에서 {best.after}점으로 {best.delta}점 올랐어요.
                </li>
              )}
              {worst && (
                <li>
                  · 신경 쓸 항목은 <b>{worst.name}</b>{iyo(worst.name)}. {worst.before}점에서 {worst.after}점으로 {-worst.delta}점 내려갔어요.
                </li>
              )}
              {report.overall != null && (
                <li>
                  · 비교한 항목의 평균 변화는 <b>{report.overall > 0 ? '+' : ''}{report.overall}점</b>이에요.
                </li>
              )}
            </ul>
            <p className="mt-2 text-[12px] leading-snug text-gray-50">촬영 조건에 따라 점수가 몇 점은 달라질 수 있어요. 3점 미만 차이는 '비슷'으로 봐요.</p>
          </div>

          {report.links.length > 0 && (
            <div className="mt-3 rounded-2xl border border-[#DCEBE3] px-4 py-4">
              <p className="text-[14px] font-extrabold text-gray-100">그 기간에 화장대에 더한 제품</p>
              <ul className="mt-2 flex flex-col gap-3">
                {report.links.map((l) => (
                  <li key={`${l.productId}-${l.concern}`}>
                    <button type="button" onClick={() => navigate(`/analysis/${l.productId}`)} className="block w-full text-left active:opacity-70">
                      <span className="block text-[13px] font-bold leading-snug text-gray-100">{l.productName}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="text-[12px] text-gray-50">{md(l.addedAt)}에 더함</span>
                        <span className="rounded-full bg-ob-surface px-2.5 py-0.5 text-[12px] font-semibold text-ob-green-deep">
                          {l.concern} {l.trend === 'up' ? '↑' : '↓'} · {l.function} 성분이 강해요
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[12px] leading-snug text-gray-50">영향이 있었을 수 있어요. 날씨·수면·촬영 조건 같은 다른 요인도 있어요.</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
