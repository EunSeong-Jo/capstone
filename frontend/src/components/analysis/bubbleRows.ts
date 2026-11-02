import type { StateRow } from './StateGroups';

/** 병 카드에 쓸 항목: 신경 쓰는 항목 중 제품의 도움 정도가 있는 것 */
export const bubbleRows = (rows: StateRow[]) =>
  rows.filter((r) => r.concern !== 'fine' && (r.status === 'good' || r.status === 'some' || r.status === 'lack'));
