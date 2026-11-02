/** 병 종류 판별과 안쪽 폭(컴포넌트가 아니라 값과 함수만 모아 둔다). */

export type BottleKind = 'bottle' | 'dropper' | 'jar' | 'tube';

/** 제품 이름에서 병 종류를 정한다. "선"이 먼저다("선스크린"에 "크림"이 들어 있어도 튜브). */
export function bottleKind(name: string): BottleKind {
  if (/선\s*(크림|스틱|스크린|젤|로션|쿠션|세럼|에센스|밤|케어|블록|패치)|자외선|썬|SPF/i.test(name)) return 'tube';
  if (/세럼|앰플|에센스|부스터|오일|컨센트레이트|원액/.test(name)) return 'dropper';
  if (/크림|밤|수딩젤|젤\s*크림|마스크\s*팩|패드/.test(name)) return 'jar';
  return 'bottle';
}

/** 몸통 안쪽 폭. 종류마다 다르게 잡는다(앰플은 좁게, 크림은 넓게). 높이는 원이 쌓인 만큼 맞춘다 */
export const INNER_W_OF: Record<BottleKind, number> = { bottle: 132, dropper: 100, jar: 172, tube: 108 };
