import { useState, type ReactNode } from 'react';
import type { FunctionRow, IngredientSplit, CautionCompare, StateCompareRow, StateStatus } from '../../utils/compare';
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
  return (
    <section className="relative px-4 py-5">
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
  if (rows.length === 0) return <p className="text-sm text-oy-sub">비교할 기능 성분이 아직 충분하지 않아요.</p>;
  return (
    <ul className="space-y-4">
      {rows.map((r) => (
        <li key={r.code}>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-oy-text">{FUNC_INFO[r.code]?.name ?? r.name}</span>
            {r.verdict === 'weaker' && (
              <span className="rounded-full bg-accent-light px-2 py-0.5 text-[11px] font-bold text-accent">대체품이 약해요</span>
            )}
            {r.verdict === 'stronger' && (
              <span className="rounded-full bg-primary-light px-2 py-0.5 text-[11px] font-bold text-primary">대체품이 강해요</span>
            )}
          </div>
          {([
            ['내 제품', r.a, r.aCount, A_COLOR],
            ['대체품', r.b, r.bCount, FUNC_INFO[r.code]?.color ?? '#3D8F6F'],
          ] as const).map(([label, value, count, color]) => (
            <div key={label} className="mt-1.5 flex items-center gap-2">
              <span className="w-11 shrink-0 text-[11px] text-oy-sub">{label}</span>
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

function ChipGroup({
  title,
  hint,
  names,
  tone,
  onSelect,
}: {
  title: string;
  hint: string;
  names: string[];
  tone: 'primary' | 'plain' | 'accent';
  onSelect?: (name: string) => void;
}) {
  if (names.length === 0) return null;
  const chip = {
    primary: 'bg-primary-light text-primary',
    plain: 'bg-oy-chip text-oy-text',
    accent: 'bg-accent-light text-accent',
  }[tone];
  return (
    <div className="rounded-xl bg-white px-4 py-3 shadow-sm">
      <p className="text-[13px] font-extrabold text-oy-text">
        {title} <span className="font-normal text-oy-sub">· {names.length}종</span>
      </p>
      <p className="mt-0.5 text-[11px] text-oy-sub">{hint}</p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {names.map((n) => (
          <li key={n}>
            <button
              type="button"
              onClick={() => onSelect?.(n)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-transform active:scale-95 ${chip}`}
            >
              {n}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 칩을 누르면 onSelect(성분 이름) — 화면이 성분 설명 시트를 연다 */
export function KeyIngredientCompare({ split, onSelect }: { split: IngredientSplit; onSelect?: (name: string) => void }) {
  const empty = split.both.length + split.onlyA.length + split.onlyB.length === 0;
  if (empty) return <p className="text-sm text-oy-sub">비교할 핵심 성분이 아직 충분하지 않아요.</p>;
  return (
    <div className="space-y-3">
      <ChipGroup title="둘 다 들어 있어요" hint="바꿔도 이어지는 성분이에요" names={split.both} tone="primary" onSelect={onSelect} />
      <ChipGroup title="내 제품에만 있어요" hint="대체품으로 바꾸면 빠지는 성분이에요" names={split.onlyA} tone="plain" onSelect={onSelect} />
      <ChipGroup title="대체품에만 있어요" hint="대체품으로 바꾸면 새로 생기는 성분이에요" names={split.onlyB} tone="plain" onSelect={onSelect} />
    </div>
  );
}

export function CautionCompareView({ cmp }: { cmp: CautionCompare }) {
  if (cmp.newInB.length + cmp.goneInB.length + cmp.both.length === 0) {
    return <p className="rounded-xl bg-primary-light px-4 py-3 text-sm text-primary">두 제품 모두 알려진 주의 성분이 없어요.</p>;
  }
  return (
    <div className="space-y-3">
      <ChipGroup title="대체품에서 새로 생겨요" hint="내 제품에는 없던 주의 성분이에요" names={cmp.newInB} tone="accent" />
      <ChipGroup title="대체품에서 사라져요" hint="내 제품에 있던 주의 성분이에요" names={cmp.goneInB} tone="primary" />
      <ChipGroup title="둘 다 들어 있어요" hint="어느 쪽을 써도 같은 주의가 필요해요" names={cmp.both} tone="plain" />
    </div>
  );
}

const PILL: Record<StateStatus, { text: string; cls: string }> = {
  good: { text: '도와줘요', cls: 'bg-primary-light text-primary' },
  some: { text: '도움이 부족해요', cls: 'bg-[#FFF4D6] text-[#9A6B00]' },
  lack: { text: '도움이 많이 부족해요', cls: 'bg-accent-light text-accent' },
  fine: { text: '해당 적음', cls: 'bg-oy-chip text-oy-sub' },
  na: { text: '해당 적음', cls: 'bg-oy-chip text-oy-sub' },
};

/** 항목 한 줄: 이름·점수·상태, 내 제품/대체품의 대응 */
function StateRowItem({ r }: { r: StateCompareRow }) {
  return (
    <li className="py-3">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-bold text-oy-text">{r.name}</span>
        <span className="text-[11px] text-oy-sub">{r.score}점</span>
        <span className={`text-[11px] font-semibold ${r.concern === 'focus' ? 'text-accent' : 'text-oy-sub'}`}>{r.label}</span>
        {r.change !== 'same' && (
          <span className={`ml-auto text-[11px] font-bold ${r.change === 'better' ? 'text-primary' : 'text-accent'}`}>
            {r.change === 'better' ? '▲ 더 좋아요' : '▼ 더 약해요'}
          </span>
        )}
      </div>
      {([['내 제품', r.a], ['대체품', r.b]] as const).map(([label, st]) => (
        <div key={label} className="mt-1.5 flex items-center gap-2">
          <span className="w-11 shrink-0 text-[11px] text-oy-sub">{label}</span>
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
  const better = focus.filter((r) => r.change === 'better').length;
  const worse = focus.filter((r) => r.change === 'worse').length;
  return (
    <div>
      {focus.length === 0 ? (
        <p className="rounded-xl bg-primary-light px-4 py-3 text-sm text-primary">신경 쓸 부분이 없어요. 지금 피부 상태가 좋아요.</p>
      ) : (
        <>
          <p className="mb-2 text-[12px] text-oy-text">
            {better === 0 && worse === 0 ? (
              '두 제품이 내 피부를 돕는 정도가 비슷해요.'
            ) : (
              <>
                대체품이 <b className="text-primary">{better}개 항목에서 더 잘 돕고</b>
                {worse > 0 && <>, <b className="text-accent">{worse}개 항목에서는 덜 도와요</b></>}.
              </>
            )}
          </p>
          <ul className="divide-y divide-oy-line rounded-xl bg-white px-3.5 shadow-sm">
            {focus.map((r) => <StateRowItem key={r.key} r={r} />)}
          </ul>
        </>
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
