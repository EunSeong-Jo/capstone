import { useState, type ReactNode } from 'react';
import { useCompareLabels } from './compareMode';
import { ingredientKey, type FunctionRow, type IngredientSplit, type CautionCompare, type StateCompareRow, type StateStatus } from '../../utils/compare';
import { FUNC_INFO } from '../analysis/constants';

const A_COLOR = '#BFC4BA';

export function Section({
  title,
  hint,
  info,
  children,
}: {
  title: string;
  hint?: string;
  /** 있으면 제목 옆에 느낌표 버튼이 생기고, 누르면 이 설명이 펼쳐진다 */
  info?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // 섹션마다 스택을 만든다: 안의 버튼·말풍선(z-20)이 위에 고정된 제품 헤더(z-[9])를 뚫지 않게 한다.
  // 열린 섹션은 한 칸 높여, 말풍선이 아래 섹션에 가려지지 않게 한다.
  return (
    <section className={`relative px-4 py-5 ${open ? 'z-[8]' : 'z-[7]'}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-extrabold text-oy-text">{title}</h2>
        {info && (
          <button
            type="button"
            aria-label={`${title} 설명 ${open ? '닫기' : '보기'}`}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className={`relative z-20 flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold leading-none transition-colors ${
              open ? 'bg-primary text-white' : 'bg-oy-chip text-oy-sub'
            }`}
          >
            !
          </button>
        )}
      </div>
      {/* 말풍선: 버튼 아래에 붙고, 바깥을 누르면 닫힌다 */}
      {info && open && (
        <>
          <button
            type="button"
            aria-label="설명 닫기"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div
            role="tooltip"
            className="absolute right-4 top-[3.1rem] z-20 w-[min(18rem,calc(100%-2rem))] rounded-xl bg-oy-text px-3.5 py-3 text-[12px] leading-relaxed text-white shadow-lg"
          >
            <span className="absolute -top-1 right-[6px] h-2.5 w-2.5 rotate-45 bg-oy-text" aria-hidden />
            {info}
          </div>
        </>
      )}
      {hint ? <p className="mt-0.5 mb-3 text-xs text-oy-sub">{hint}</p> : <div className="mb-3" />}
      {children}
    </section>
  );
}

export const Divider = () => <div className="h-2 bg-oy-line" />;

const B_COLOR = '#3D8F6F';

/**
 * 기능 강도를 방사형(레이더) 도형으로 견준다. 기능이 꼭짓점이고, 꼭짓점에 가까울수록 그 기능이 강하다.
 * 기준 제품은 회색, 비교 제품은 초록 도형이다. 두 도형이 겹치면 비슷하고 어긋나면 그 기능에서 차이가 난다.
 * 범례를 눌러 제품을 고르면 그 도형이 진해지고 다른 쪽은 흐려진다(다시 누르면 해제).
 * 꼭짓점이 3개 미만이면 도형이 안 되므로 줄 목록으로 대신한다.
 */
export function FunctionCompare({
  rows,
  focus = [],
}: {
  rows: FunctionRow[];
  /** 내 피부타입이 중요하게 보는 기능 코드(궁합 점수에 반영되는 기능). 도형 아래 안내 문장에서 이름을 강조한다 */
  focus?: string[];
}) {
  const L = useCompareLabels();
  const [picked, setPicked] = useState<'a' | 'b' | null>(null);
  if (rows.length === 0) return <p className="text-sm text-oy-sub">비교할 기능 성분이 아직 충분하지 않아요.</p>;

  const axes = rows;
  const focusRows = rows.filter((r) => focus.includes(r.code));
  const nameOf = (r: FunctionRow) => FUNC_INFO[r.code]?.name ?? r.name;

  const W = 300;
  const H = 250;
  const cx = W / 2;
  const cy = 122;
  const R = 82;
  const n = axes.length;
  const angle = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / n;
  const point = (i: number, ratio: number) => [cx + R * ratio * Math.cos(angle(i)), cy + R * ratio * Math.sin(angle(i))] as const;
  const poly = (ratio: (i: number) => number) => axes.map((_, i) => point(i, ratio(i)).join(',')).join(' ');
  const ratioA = (i: number) => Math.max(axes[i].a, axes[i].a > 0 ? 4 : 0) / 100;
  const ratioB = (i: number) => Math.max(axes[i].b, axes[i].b > 0 ? 4 : 0) / 100;

  return (
    <div>
      {n >= 3 && (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="기능 강도 방사형 비교" className="mx-auto block w-full max-w-[340px]">
          {[0.25, 0.5, 0.75, 1].map((g) => (
            <polygon key={g} points={poly(() => g)} fill="none" stroke="#E4E8E1" strokeWidth={g === 1 ? 1.2 : 1} />
          ))}
          {axes.map((_, i) => {
            const [x, y] = point(i, 1);
            return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#E4E8E1" strokeWidth={1} />;
          })}
          {/* 고른 제품은 진하게, 다른 쪽은 흐리게. 고르지 않았으면 둘 다 보통 */}
          {(
            [
              ['a', ratioA, A_COLOR],
              ['b', ratioB, B_COLOR],
            ] as const
          ).map(([side, ratio, color]) => {
            const on = picked === side;
            const off = picked !== null && !on;
            return (
              <g key={side} opacity={off ? 0.3 : 1}>
                <polygon
                  points={poly(ratio)}
                  fill={color}
                  fillOpacity={on ? 0.55 : 0.28}
                  stroke={color}
                  strokeWidth={on ? 3 : 1.8}
                  strokeLinejoin="round"
                />
                {on &&
                  axes.map((r, i) => {
                    const [x, y] = point(i, ratio(i));
                    return <circle key={r.code} cx={x} cy={y} r={3.2} fill={color} />;
                  })}
              </g>
            );
          })}
          {axes.map((r, i) => {
            const [x, y] = point(i, 1.2);
            const anchor = Math.abs(x - cx) < 6 ? 'middle' : x > cx ? 'start' : 'end';
            // 비교 제품을 고르면 기능 이름 아래에 기준 제품 대비 변화를 적는다.
            // 요약("N개 강해요")과 같은 기준(FUNCTION_GAP)이라, 차이가 작은 기능은 숫자 없이 "비슷"으로 둔다.
            const diff = Math.round(r.b - r.a);
            const showNote = picked === 'b';
            const ty = showNote ? y - 6 : y;
            return (
              <g key={r.code}>
              <text x={x} y={ty} textAnchor={anchor} dominantBaseline="middle" className="fill-oy-text text-[11px] font-bold">
                <tspan x={x}>{nameOf(r)}</tspan>
                {showNote && (
                  <tspan
                    x={x}
                    dy={13}
                    className={r.verdict === 'stronger' ? 'fill-good' : r.verdict === 'weaker' ? 'fill-accent' : 'fill-oy-sub font-semibold'}
                  >
                    {r.verdict === 'stronger' ? `▲ +${diff}점` : r.verdict === 'weaker' ? `▼ −${-diff}점` : '비슷'}
                  </tspan>
                )}
              </text>
              </g>
            );
          })}
        </svg>
      )}

      {focusRows.length > 0 && (
        <p className="mt-1 text-center text-[12px] text-oy-sub">
          내 피부는{' '}
          {focusRows.map((r, i) => (
            <span key={r.code}>
              {i > 0 && ', '}
              <b className="rounded-full bg-good-soft px-2 py-0.5 font-extrabold text-good">{nameOf(r)}</b>
            </span>
          ))}{' '}
          기능을 중요하게 보고 있어요
        </p>
      )}

      <div className="mt-2 flex items-center justify-center gap-2">
        {(
          [
            ['a', L.a, A_COLOR],
            ['b', L.b, B_COLOR],
          ] as const
        ).map(([side, label, color]) => (
          <button
            key={side}
            type="button"
            aria-pressed={picked === side}
            onClick={() => setPicked(picked === side ? null : side)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold active:scale-95 ${
              picked === side ? 'border-oy-text bg-oy-chip text-oy-text' : 'border-oy-line bg-white text-oy-sub'
            }`}
          >
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
            {label}
          </button>
        ))}
      </div>

    </div>
  );
}

type ChangeKey = string; // 기능 이름 또는 CAUTION

const CAUTION = '__caution__';

/** 이름 칩 한 줄 묶음. mark는 칩 앞의 +/−, strike는 취소선 */
function NameChips({
  title,
  names,
  tone,
  mark,
  strike,
  funcsOf,
  onSelect,
}: {
  title: string;
  names: string[];
  tone: 'neutral' | 'caution' | 'good' | 'plain';
  mark?: string;
  strike?: boolean;
  funcsOf?: (name: string) => string[];
  onSelect?: (name: string) => void;
}) {
  if (names.length === 0) return null;
  const cls = {
    neutral: 'bg-oy-chip text-oy-text',
    caution: 'text-caution',
    good: 'bg-good-soft text-good',
    plain: 'bg-oy-chip text-oy-text',
  }[tone];
  return (
    <div className="mt-2.5">
      <p className="text-[11px] font-bold text-oy-sub">
        {title} · {names.length}종
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {names.map((n) => {
          const fns = funcsOf?.(n) ?? [];
          return (
            <li key={n}>
              <button
                type="button"
                onClick={() => onSelect?.(n)}
                className={`rounded-2xl px-2.5 py-1 text-left text-[11px] font-semibold transition-transform active:scale-95 ${cls}`}
              >
                {mark && <span className="mr-0.5 font-extrabold">{mark}</span>}
                <span className={strike ? 'line-through decoration-1' : ''}>{n}</span>
                {fns.length > 0 && <span className="ml-1 font-normal opacity-70">{fns.slice(0, 2).join('·')}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** 펼친 줄의 성분 목록. ＋(새로 생기는 성분)와 －(빠지는 성분)를 한 목록에 두고 2열로 전부 보여 준다 */
function ChangeList({
  plus,
  minus,
  funcsOf,
  focusFn,
  onSelect,
}: {
  plus: string[];
  minus: string[];
  funcsOf: (name: string) => string[];
  /** 지금 펼친 기능 — 성분의 "다른" 기능만 곁에 작게 적는다 */
  focusFn: string;
  onSelect?: (name: string) => void;
}) {
  const rows = [...plus.map((n) => ({ n, plus: true })), ...minus.map((n) => ({ n, plus: false }))];
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 pb-3">
      {rows.map(({ n, plus: isPlus }) => {
        const others = funcsOf(n).filter((f) => f !== focusFn);
        return (
          <li key={`${isPlus ? '+' : '-'}${n}`}>
            <button
              type="button"
              onClick={() => onSelect?.(n)}
              className="flex w-full items-start gap-1.5 rounded-md px-1 py-1 text-left text-[12px] font-semibold leading-snug text-oy-text active:bg-oy-chip"
            >
              <span className={`shrink-0 font-extrabold ${isPlus ? 'text-good' : 'text-danger'}`}>{isPlus ? '＋' : '－'}</span>
              <span className="min-w-0 break-all">
                {n}
                {others.length > 0 && <span className="ml-1 text-[10px] font-normal text-oy-sub">{others.slice(0, 2).join('·')}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * 성분 변화 — 기능마다 한 줄(＋추가 수 · －제거 수), 줄을 누르면 아래에 그 성분들이 ＋/－ 한 목록으로 펼쳐진다(기준 제품에서 비교 제품으로 바꿀 때의 변화).
 * 성분은 접지 않고 전부 보여 준다. 주의 성분도 같은 목록의 마지막 줄이다.
 * 한 번에 한 줄만 펼쳐지고, 같은 줄을 다시 누르면 접힌다.
 */
export function IngredientChanges({
  split,
  cmp,
  onSelect,
}: {
  split: IngredientSplit;
  cmp: CautionCompare;
  onSelect?: (name: string) => void;
}) {
  const L = useCompareLabels();
  const [open, setOpen] = useState<ChangeKey | null>(null);
  const funcsOf = (n: string) => split.functionsOf[ingredientKey(n)] ?? [];
  const hasFn = (name: string) => (n: string) => funcsOf(n).includes(name);
  const toggle = (key: ChangeKey) => setOpen((cur) => (cur === key ? null : key));

  const cautionAll = cmp.newInB.length + cmp.goneInB.length + cmp.both.length;
  const noKeyChange = split.delta.length === 0;

  const rowBtn = 'flex w-full items-center gap-2 py-3 text-left active:opacity-70';
  const chevron = (key: ChangeKey) => <span className="ml-auto text-[12px] text-oy-sub">{open === key ? '▴' : '▾'}</span>;

  return (
    <div className="rounded-xl bg-white px-4 py-3 shadow-sm">
      <p className="text-[13px] font-extrabold text-oy-text">기능별로 이렇게 달라져요</p>
      {noKeyChange && <p className="mt-1.5 text-[12px] font-semibold text-primary">기능 성분 구성이 거의 같아요.</p>}
      <ul className="mt-1 divide-y divide-oy-line">
        {split.delta.map((d) => (
          <li key={d.name}>
            <button type="button" aria-expanded={open === d.name} onClick={() => toggle(d.name)} className={rowBtn}>
              <span className="text-[13px] font-bold text-oy-text">{d.name}</span>
              {/* 순증감이 아니라 새로 생기는 수와 빠지는 수를 따로 적는다(둘 다 있을 때 한쪽이 가려지지 않게) */}
              {d.plus > 0 && <span className="text-[12px] font-bold text-good">＋{d.plus}종</span>}
              {d.minus > 0 && <span className="text-[12px] font-bold text-danger">－{d.minus}종</span>}
              {chevron(d.name)}
            </button>
            {open === d.name && (
              <ChangeList
                plus={split.onlyB.filter(hasFn(d.name))}
                minus={split.onlyA.filter(hasFn(d.name))}
                funcsOf={funcsOf}
                focusFn={d.name}
                onSelect={onSelect}
              />
            )}
          </li>
        ))}
        <li>
          {cautionAll === 0 ? (
            <p className="py-3 text-[13px] font-bold text-good">주의 성분 없음</p>
          ) : (
            <>
              <button type="button" aria-expanded={open === CAUTION} onClick={() => toggle(CAUTION)} className={rowBtn}>
                <span className="text-[13px] font-bold text-oy-text">주의 성분</span>
                {/* 주의 성분은 늘어나는 쪽이 나쁜 소식이라 ＋가 노랑·－가 초록이다 */}
                {cmp.newInB.length > 0 && <span className="text-[12px] font-bold text-caution">＋{cmp.newInB.length}종</span>}
                {cmp.goneInB.length > 0 && <span className="text-[12px] font-bold text-good">－{cmp.goneInB.length}종</span>}
                {cmp.newInB.length === 0 && cmp.goneInB.length === 0 && <span className="text-[12px] font-semibold text-oy-sub">변화 없어요</span>}
                {chevron(CAUTION)}
              </button>
              {open === CAUTION && (
                <div className="pb-3">
                  <NameChips title={`${L.b}에서 늘어나는 주의 성분`} names={cmp.newInB} tone="caution" mark="+" onSelect={onSelect} />
                  <NameChips title={`${L.b}에서 줄어드는 주의 성분`} names={cmp.goneInB} tone="caution" strike onSelect={onSelect} />
                  <NameChips title="두 제품 모두 들어 있는 주의 성분" names={cmp.both} tone="plain" onSelect={onSelect} />
                </div>
              )}
            </>
          )}
        </li>
      </ul>
      <p className="mt-1 text-[11px] text-oy-sub">줄을 누르면 바뀌는 성분을 볼 수 있어요.</p>
    </div>
  );
}

const PILL: Record<StateStatus, { text: string; cls: string }> = {
  good: { text: '도와줘요', cls: 'bg-good-soft text-good' },
  some: { text: '도움이 부족해요', cls: 'bg-caution-soft text-caution' },
  lack: { text: '도움이 많이 부족해요', cls: 'bg-danger-soft text-danger' },
  fine: { text: '해당 적음', cls: 'bg-oy-chip text-oy-sub' },
  na: { text: '해당 적음', cls: 'bg-oy-chip text-oy-sub' },
};

/** 막대 옆에 붙는 짧은 상태 말 */
const SHORT: Record<StateStatus, string> = { good: '도와줘요', some: '부족해요', lack: '많이 부족', fine: '해당 적음', na: '해당 적음' };

/** 항목 한 줄: 이름·내 피부 점수·상태, 두 제품이 돕는 정도를 막대와 점수로 */
function StateRowItem({ r }: { r: StateCompareRow }) {
  const L = useCompareLabels();
  return (
    <li className="py-3">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-bold text-oy-text">{r.name}</span>
        <span className="text-[11px] text-oy-sub">{r.score}점</span>
        <span className="text-[11px] font-semibold text-oy-sub">{r.label}</span>
      </div>
      {([
        [L.a, r.a, r.aScore, A_COLOR],
        [L.b, r.b, r.bScore, B_COLOR],
      ] as const).map(([label, st, value, color]) => (
        <div key={label} className="mt-1.5 flex items-center gap-2">
          <span className="w-14 shrink-0 text-[11px] text-oy-sub">{label}</span>
          <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-oy-chip">
            <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max(value, value > 0 ? 4 : 0)}%`, background: color }} />
          </span>
          <span className="w-7 shrink-0 text-right text-[12px] font-bold text-oy-text">{value}</span>
          <span className={`w-[4.2rem] shrink-0 pr-2 text-right text-[11px] font-semibold ${PILL[st].cls.split(' ').filter((c) => c.startsWith('text-')).join(' ')}`}>
            {SHORT[st]}
          </span>
        </div>
      ))}
    </li>
  );
}

/**
 * 내 피부 항목마다 두 제품이 얼마나 돕는지.
 * 신경 쓸 부분을 먼저 보여 주고, 80점 이상(신경 쓸 필요가 적은) 항목은 칩으로 접어 두었다가 눌러 펼치면 같은 줄로 보여 준다.
 */
export function SkinStateCompare({ rows }: { rows: StateCompareRow[] }) {
  const [showFine, setShowFine] = useState(false);
  const focus = rows.filter((r) => r.concern !== 'fine');
  const fine = rows.filter((r) => r.concern === 'fine');
  return (
    <div>
      {focus.length === 0 ? (
        <p className="rounded-xl bg-primary-light px-4 py-3 text-sm text-primary">신경 쓸 부분이 없어요. 지금 피부 상태가 좋아요.</p>
      ) : (
        <ul className="divide-y divide-oy-line rounded-xl bg-white px-3.5 shadow-sm">
          {focus.map((r) => <StateRowItem key={r.key} r={r} />)}
        </ul>
      )}

      {fine.length > 0 && (
        <div className="mt-3 rounded-xl bg-white px-3.5 py-3 shadow-sm">
          <button
            type="button"
            aria-expanded={showFine}
            onClick={() => setShowFine((v) => !v)}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="text-[13px] font-extrabold text-oy-text">
              신경 쓸 필요가 적어요 <span className="font-normal text-oy-sub">· {fine.length}개</span>
            </span>
            <span className="text-[12px] font-bold text-primary">{showFine ? '접기 ▴' : '펼쳐 보기 ▾'}</span>
          </button>
          {showFine ? (
            <ul className="mt-1 divide-y divide-oy-line">
              {fine.map((r) => <StateRowItem key={r.key} r={r} />)}
            </ul>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {fine.map((r) => (
                <li key={r.key} className="rounded-full bg-primary-light px-2.5 py-1 text-[11px] font-semibold text-primary">
                  {r.name} <span className="font-normal opacity-70">{r.score}점</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
