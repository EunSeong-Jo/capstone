import type { FunctionStrength } from '../../api/analysis';
import { FUNC_INFO } from './constants';

/**
 * 기능별 강도 막대. 이 제품이 보습·진정·피지 같은 기능 중 어디에 강한지가 한눈에 보인다.
 * 내 피부타입이 중요하게 보는 기능에는 ★를 붙인다.
 */
export function FunctionBars({
  functions,
  focus,
}: {
  functions: FunctionStrength[];
  /** 내 피부타입이 중요하게 보는 기능 코드들 */
  focus: ReadonlySet<string>;
}) {
  const sorted = [...functions].sort((a, b) => b.value - a.value);
  const any = sorted.some((f) => f.value > 0);
  if (!any) {
    return <p className="text-sm text-oy-sub">분류된 기능 성분이 아직 충분하지 않아요.</p>;
  }
  return (
    <ul className="space-y-2.5">
      {sorted.map((f) => (
        <li key={f.code} className="flex items-center gap-2.5">
          {/* 이름과 ★은 한 줄에 놓는다(긴 이름 '주름·탄력'에서도 줄바꿈되지 않게 ★ 자리를 따로 둔다) */}
          <span className="flex w-[96px] shrink-0 items-center whitespace-nowrap text-[13px] font-semibold text-oy-text">
            <span>{FUNC_INFO[f.code]?.name ?? f.name}</span>
            <span className="ml-1 w-3 text-center text-[12px] leading-none text-primary">{focus.has(f.code) ? '★' : ''}</span>
          </span>
          <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-oy-chip">
            <span
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${Math.max(f.value, f.value > 0 ? 4 : 0)}%`, background: FUNC_INFO[f.code]?.color }}
            />
          </span>
          <span className="w-[42px] shrink-0 text-right text-[11px] text-oy-sub">
            {f.count > 0 ? `${f.count}종` : '—'}
          </span>
        </li>
      ))}
    </ul>
  );
}
