/**
 * 직접 비교에서 "기준 제품(seed)과 방금 고른 제품(picked)"을 어디로 보낼지 정한다.
 * 검색 화면·스캔 화면의 선택 모드가 같은 규칙을 쓰도록 한 곳에 둔다.
 *
 * 같은 종류(category)끼리만 견준다 — 마스크팩과 선케어는 기능 강도·핵심 성분을 맞대 볼 의미가 없다.
 * 카테고리가 큰 분류('스킨케어' 등)라 토너와 세럼은 같은 종류로 본다.
 */
export interface PickableProduct {
  id: number;
  category?: string;
}

export type PickResult = { ok: true; to: string } | { ok: false; reason: string };

export function pickCompareTarget(seed: PickableProduct | null | undefined, picked: PickableProduct): PickResult {
  if (!seed) return { ok: false, reason: '기준 제품을 불러오는 중이에요. 잠시 후 다시 눌러 주세요.' };
  if (seed.id === picked.id) return { ok: false, reason: '같은 제품이에요. 다른 제품을 골라 주세요.' };
  if (seed.category && picked.category && seed.category !== picked.category) {
    return { ok: false, reason: `같은 종류끼리만 비교할 수 있어요. (${seed.category} 제품을 골라 주세요)` };
  }
  return { ok: true, to: `/compare?a=${seed.id}&b=${picked.id}&direct=1` };
}

/** 같은 종류인지(화장대 목록 걸러내기 등) */
export function isSameKind(seed: PickableProduct | null | undefined, other: PickableProduct): boolean {
  return !!seed && seed.id !== other.id && (!seed.category || !other.category || seed.category === other.category);
}
