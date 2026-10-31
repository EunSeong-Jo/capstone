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

/** 기능마다 기준(회색)과 대체품(기능 색) 막대를 위아래로 */
export function FunctionCompare({ rows }: { rows: FunctionRow[] }) {
  const L = useCompareLabels();
  if (rows.length === 0) return <p className="text-sm text-oy-sub">비교할 기능 성분이 아직 충분하지 않아요.</p>;
  return (
    <ul className="space-y-4">
      {rows.map((r) => (
        <li key={r.code}>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-oy-text">{FUNC_INFO[r.code]?.name ?? r.name}</span>
            {r.verdict === 'weaker' && (
              <span className="rounded-full bg-accent-light px-2 py-0.5 text-[11px] font-bold text-accent">{L.b}이 약해요</span>
            )}
            {r.verdict === 'stronger' && (
              <span className="rounded-full bg-primary-light px-2 py-0.5 text-[11px] font-bold text-primary">{L.b}이 강해요</span>
            )}
          </div>
          {([
            [L.a, r.a, r.aCount, A_COLOR],
            [L.b, r.b, r.bCount, FUNC_INFO[r.code]?.color ?? '#3D8F6F'],
          ] as const).map(([label, value, count, color]) => (
            <div key={label} className="mt-1.5 flex items-center gap-2">
              <span className="w-14 shrink-0 text-[11px] text-oy-sub">{label}</span>
              <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-oy-chip">
                <span
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${Math.max(value, value > 0 ? 4 : 0)}%`, background: color }}
                />
              </span>
              <span className="w-9 shrink-0 text-right text-[11px] text-oy-sub">{count > 0 ? `${count}종` : '—'}</span>
            </div>
          ))}
        </li>
      ))}
    </ul>
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
    caution: 'bg-caution-soft text-caution',
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

/**
 * 성분 변화 — "기능별로 이렇게 달라져요" 칩 한 줄에 주의 성분 칩을 함께 두고,
 * 칩을 누르면 그 기능(또는 주의 성분)에서 추가되거나 빠지는 성분을 펼친다. 같은 칩을 다시 누르면 접힌다.
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

  const cautionAll = cmp.newInB.length + cmp.goneInB.length + cmp.both.length;
  const cautionNet = cmp.newInB.length - cmp.goneInB.length;
  // 칩 바탕은 모두 중립. 늘고 줄어드는 숫자(+N종 / −N종)만 글자색으로 말한다.
  // 기능 칩은 +가 초록·−가 빨강이다. 주의 성분은 늘어나는 쪽이 나쁜 소식이라 +가 노랑·−가 초록이다.
  const cautionChip: { label: string; delta: string; deltaCls: string; expandable: boolean } =
    cautionAll === 0
      ? { label: '주의 성분 없음', delta: '', deltaCls: '', expandable: false }
      : cautionNet > 0
        ? { label: '주의 성분', delta: `+${cautionNet}종`, deltaCls: 'text-caution', expandable: true }
        : cautionNet < 0
          ? { label: '주의 성분', delta: `−${-cautionNet}종`, deltaCls: 'text-good', expandable: true }
          : cmp.newInB.length > 0
            ? { label: '주의 성분 교체', delta: '', deltaCls: '', expandable: true }
            : { label: '주의 성분 변화 없어요', delta: '', deltaCls: '', expandable: true };

  const chipBase = 'rounded-full px-2.5 py-1 text-[11px] font-bold transition-transform active:scale-95';
  const ring = (key: ChangeKey) => (open === key ? ' ring-2 ring-oy-text/30' : '');
  const toggle = (key: ChangeKey) => setOpen((cur) => (cur === key ? null : key));

  const fnDetail = open && open !== CAUTION ? open : null;
  const noKeyChange = split.delta.length === 0;

  return (
    <div className="rounded-xl bg-white px-4 py-3 shadow-sm">
      <p className="text-[13px] font-extrabold text-oy-text">기능별로 이렇게 달라져요</p>
      {noKeyChange && <p className="mt-1.5 text-[12px] font-semibold text-primary">핵심 성분 구성이 거의 같아요.</p>}
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {split.delta.map((d) => {
          const net = d.plus - d.minus;
          const text = net > 0 ? `+${net}종` : net < 0 ? `−${-net}종` : '성분만 교체';
          const textCls = net > 0 ? 'text-good' : net < 0 ? 'text-danger' : '';
          return (
            <li key={d.name}>
              <button
                type="button"
                aria-expanded={open === d.name}
                onClick={() => toggle(d.name)}
                className={`${chipBase} bg-oy-chip text-oy-text${ring(d.name)}`}
              >
                {d.name} <span className={textCls}>{text}</span>
              </button>
            </li>
          );
        })}
        <li>
          {cautionChip.expandable ? (
            <button
              type="button"
              aria-expanded={open === CAUTION}
              onClick={() => toggle(CAUTION)}
              className={`${chipBase} bg-oy-chip text-oy-text${ring(CAUTION)}`}
            >
              {cautionChip.label} <span className={cautionChip.deltaCls}>{cautionChip.delta}</span>
            </button>
          ) : (
            <span className={`inline-block ${chipBase} bg-oy-chip text-good`}>{cautionChip.label}</span>
          )}
        </li>
      </ul>

      {fnDetail && (
        <div className="mt-1 border-t border-oy-line pt-0.5">
          <NameChips
            title={`${L.b}에만 있는 ${fnDetail} 성분`}
            names={split.onlyB.filter(hasFn(fnDetail))}
            tone="neutral"
            mark="+"
            funcsOf={funcsOf}
            onSelect={onSelect}
          />
          <NameChips
            title={`${L.a}에만 있는 ${fnDetail} 성분`}
            names={split.onlyA.filter(hasFn(fnDetail))}
            tone="neutral"
            mark="−"
            funcsOf={funcsOf}
            onSelect={onSelect}
          />
        </div>
      )}
      {open === CAUTION && (
        <div className="mt-1 border-t border-oy-line pt-0.5">
          <NameChips title={`${L.b}에서 늘어나는 주의 성분`} names={cmp.newInB} tone="caution" mark="+" onSelect={onSelect} />
          <NameChips title={`${L.b}에서 줄어드는 주의 성분`} names={cmp.goneInB} tone="caution" strike onSelect={onSelect} />
          <NameChips title="두 제품 모두 들어 있는 주의 성분" names={cmp.both} tone="plain" onSelect={onSelect} />
        </div>
      )}
      <p className="mt-2 text-[11px] text-oy-sub">칩을 누르면 추가되거나 빠지는 성분을 볼 수 있어요.</p>
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

/** 항목 한 줄: 이름·점수·상태, 내 제품/대체품의 대응 */
function StateRowItem({ r }: { r: StateCompareRow }) {
  const L = useCompareLabels();
  return (
    <li className="py-3">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-bold text-oy-text">{r.name}</span>
        <span className="text-[11px] text-oy-sub">{r.score}점</span>
        <span className="text-[11px] font-semibold text-oy-sub">{r.label}</span>
        {r.change !== 'same' && (
          <span className={`ml-auto text-[11px] font-bold ${r.change === 'better' ? 'text-primary' : 'text-accent'}`}>
            {r.change === 'better' ? '▲ 더 좋아요' : '▼ 더 약해요'}
          </span>
        )}
      </div>
      {([[L.a, r.a], [L.b, r.b]] as const).map(([label, st]) => (
        <div key={label} className="mt-1.5 flex items-center gap-2">
          <span className="w-14 shrink-0 text-[11px] text-oy-sub">{label}</span>
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${PILL[st].cls}`}>{PILL[st].text}</span>
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
