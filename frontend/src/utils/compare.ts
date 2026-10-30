/**
 * 두 제품의 성분 분석(`ProductAnalysis`)을 견주는 순수 함수들.
 * 서버가 제품마다 같은 모양으로 주는 분석을 그대로 받아 계산한다 — 비교 전용 API는 없다.
 */
import type { FunctionStrength, ProductAnalysis } from '../api/analysis';

export interface FunctionRow {
  code: string;
  name: string;
  a: number;
  b: number;
  aCount: number;
  bCount: number;
  /** 대체품(b)이 기준(a)보다 이 값 이상 약하면 weaker, 강하면 stronger */
  verdict: 'weaker' | 'stronger' | 'same';
}

/** 이 차이(0~100 척도)보다 작으면 비슷하다고 본다 */
export const FUNCTION_GAP = 12;

/** 두 제품 중 어느 한쪽이라도 가진 기능만, 둘 중 큰 값 순으로 */
export function compareFunctions(a: FunctionStrength[], b: FunctionStrength[]): FunctionRow[] {
  const byCode = new Map<string, FunctionRow>();
  const put = (f: FunctionStrength, side: 'a' | 'b') => {
    const row =
      byCode.get(f.code) ??
      { code: f.code, name: f.name, a: 0, b: 0, aCount: 0, bCount: 0, verdict: 'same' as const };
    row[side] = f.value;
    row[side === 'a' ? 'aCount' : 'bCount'] = f.count;
    byCode.set(f.code, row);
  };
  a.forEach((f) => put(f, 'a'));
  b.forEach((f) => put(f, 'b'));
  return [...byCode.values()]
    .filter((r) => r.a > 0 || r.b > 0)
    .map((r) => ({
      ...r,
      verdict: r.b - r.a <= -FUNCTION_GAP ? ('weaker' as const) : r.b - r.a >= FUNCTION_GAP ? ('stronger' as const) : ('same' as const),
    }))
    .sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b));
}

const norm = (s: string) => s.trim().toLowerCase();

export interface IngredientSplit {
  both: string[];
  onlyA: string[];
  onlyB: string[];
  /** 성분 이름(소문자·공백 정리) → 그 성분의 기능 이름들 */
  functionsOf: Record<string, string[]>;
  /** 기능별로 빠지는 성분 수(minus)와 새로 생기는 성분 수(plus). 변화가 없는 기능은 없다 */
  delta: { name: string; plus: number; minus: number }[];
}

/** 성분 이름으로 그 성분의 기능을 찾는 키 */
export const ingredientKey = norm;

/** 핵심 성분을 "둘 다 / 기준에만 / 대체품에만"으로 나눈다. 순서는 각 제품의 함량 순서를 따른다 */
export function compareKeyIngredients(a: ProductAnalysis, b: ProductAnalysis): IngredientSplit {
  const inB = new Set(b.keyIngredients.map((k) => norm(k.name)));
  const inA = new Set(a.keyIngredients.map((k) => norm(k.name)));
  const onlyAList = a.keyIngredients.filter((k) => !inB.has(norm(k.name)));
  const onlyBList = b.keyIngredients.filter((k) => !inA.has(norm(k.name)));

  const functionsOf: Record<string, string[]> = {};
  [...a.keyIngredients, ...b.keyIngredients].forEach((k) => {
    functionsOf[norm(k.name)] = k.functions;
  });

  const tally = new Map<string, { name: string; plus: number; minus: number }>();
  const bump = (fn: string, side: 'plus' | 'minus') => {
    const row = tally.get(fn) ?? { name: fn, plus: 0, minus: 0 };
    row[side] += 1;
    tally.set(fn, row);
  };
  onlyBList.forEach((k) => k.functions.forEach((f) => bump(f, 'plus')));
  onlyAList.forEach((k) => k.functions.forEach((f) => bump(f, 'minus')));

  return {
    both: a.keyIngredients.filter((k) => inB.has(norm(k.name))).map((k) => k.name),
    onlyA: onlyAList.map((k) => k.name),
    onlyB: onlyBList.map((k) => k.name),
    functionsOf,
    delta: [...tally.values()].sort((x, y) => y.plus + y.minus - (x.plus + x.minus)),
  };
}

export interface CautionCompare {
  /** 대체품에서 새로 생기는 주의 성분 */
  newInB: string[];
  /** 기준에는 있었지만 대체품에는 없는 주의 성분 */
  goneInB: string[];
  /** 둘 다 있는 주의 성분 */
  both: string[];
}

export function compareCautions(a: ProductAnalysis, b: ProductAnalysis): CautionCompare {
  const names = (p: ProductAnalysis) => [...new Set(p.cautions.flatMap((g) => g.ingredients.map((i) => i.name)))];
  const an = names(a);
  const bn = names(b);
  const aSet = new Set(an.map(norm));
  const bSet = new Set(bn.map(norm));
  return {
    newInB: bn.filter((n) => !aSet.has(norm(n))),
    goneInB: an.filter((n) => !bSet.has(norm(n))),
    both: bn.filter((n) => aSet.has(norm(n))),
  };
}

export type StateStatus = 'good' | 'some' | 'lack' | 'fine' | 'na';

export interface StateCompareRow {
  key: string;
  name: string;
  /** 내 피부 상태 표현('수분이 부족해요') */
  label: string;
  /** 내 피부 점수 0~100(높을수록 좋음) */
  score: number;
  concern: 'focus' | 'mild' | 'fine';
  a: StateStatus;
  b: StateStatus;
  /** 대체품이 기준보다 더 잘 돕는가 */
  change: 'better' | 'worse' | 'same';
}

const STATUS_RANK: Record<StateStatus, number> = { good: 3, some: 2, lack: 1, fine: 0, na: 0 };

interface StateItem {
  key: string;
  name: string;
  label: string;
  score: number;
  concern: 'focus' | 'mild' | 'fine';
  status: StateStatus;
  /** 괜찮은 항목도 제품이 돕는 정도를 말할 수 있게 status(fine)와 따로 둔다 */
  help: StateStatus;
}

/** 사진 분석 항목이 있으면 그것, 없으면 문답 5축. 둘 다 없으면 빈 배열 */
function stateItems(p: ProductAnalysis): StateItem[] {
  if (p.concernState.length > 0) {
    return p.concernState.map((c) => ({ key: c.key, name: c.name, label: c.level, score: c.score, concern: c.concern, status: c.status, help: c.help ?? c.status }));
  }
  return p.skinState.map((s) => ({ key: s.axis, name: s.name, label: s.level, score: s.health, concern: s.concern, status: s.status, help: s.help ?? s.status }));
}

/**
 * 내 피부 항목마다 두 제품이 얼마나 돕는지 견준다.
 * 성분으로 바뀌기 어려운 항목(na)은 뺀다. 신경 쓸 부분(focus·mild)이 위, 같은 정도 안에서는 차이가 큰 것이 위.
 * 신경 쓸 필요가 적은 항목(fine)도 담아 두고(맨 아래), 화면이 접어서 보여 줄지 정한다.
 */
export function compareSkinState(a: ProductAnalysis, b: ProductAnalysis): StateCompareRow[] {
  const bByKey = new Map(stateItems(b).map((i) => [i.key, i]));
  const concernOrder = { focus: 0, mild: 1, fine: 2 } as const;
  return stateItems(a)
    .filter((i) => i.status !== 'na')
    .flatMap((i) => {
      const other = bByKey.get(i.key);
      if (!other) return [];
      const diff = STATUS_RANK[other.help] - STATUS_RANK[i.help];
      return [{
        key: i.key,
        name: i.name,
        label: i.label,
        score: i.score,
        concern: i.concern,
        a: i.help,
        b: other.help,
        change: diff > 0 ? ('better' as const) : diff < 0 ? ('worse' as const) : ('same' as const),
      }];
    })
    .sort((x, y) => concernOrder[x.concern] - concernOrder[y.concern] || Math.abs(STATUS_RANK[y.b] - STATUS_RANK[y.a]) - Math.abs(STATUS_RANK[x.b] - STATUS_RANK[x.a]));
}
