import type { AnatomyItem } from '../../api/analysis';
import { FUNC_INFO } from './constants';

/** 필요한 기능을 가진 활성·에몰리언트 성분을 전성분표 앞쪽(많이 든) 순서로 */
export function helperNames(need: string[], anatomy: AnatomyItem[]): string[] {
  const codes = Object.entries(FUNC_INFO)
    .filter(([, v]) => need.some((n) => n.startsWith(v.name)))
    .map(([c]) => c);
  const seen = new Set<string>();
  return anatomy
    .filter((i) => (i.role === 'a' || i.role === 'e') && i.functions.some((f) => codes.includes(f)))
    .sort((a, b) => a.position - b.position)
    .map((i) => i.name)
    .filter((n) => (seen.has(n) ? false : (seen.add(n), true)));
}
