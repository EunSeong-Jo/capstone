/** 기능 코드별 이름·색. 해부도 띠와 막대가 같은 색을 쓴다. */
export const FUNC_INFO: Record<string, { name: string; color: string }> = {
  H: { name: '보습', color: '#4BA3E3' },
  B: { name: '장벽', color: '#7E6BC9' },
  S: { name: '진정', color: '#35B58A' },
  W: { name: '미백', color: '#F2B632' },
  A: { name: '주름·탄력', color: '#E0708C' },
  O: { name: '항산화', color: '#F08A3C' },
  P: { name: '피지·모공', color: '#5B7FA6' },
  E: { name: '각질', color: '#A0805F' },
  U: { name: '자외선', color: '#E8C547' },
};

/** 활성이 아닌 베이스 성분(용매·계면활성·점증·방부·기타)의 색과 라벨이 없는 성분의 색 */
export const BASE_COLOR = '#D9DDD6';
export const UNLABELED_COLOR = '#EEF0EC';

export const ROLE_NAME: Record<string, string> = {
  a: '활성', e: '에몰리언트·오일', s: '용매', f: '계면활성', t: '점증', p: '방부', x: '기타',
};
