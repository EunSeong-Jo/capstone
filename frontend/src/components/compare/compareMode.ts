import { createContext, useContext } from 'react';

/**
 * 비교 화면의 문구 모드.
 * swap: 교체 제안에서 온 비교(내 제품 → 대체품). direct: 사용자가 두 제품을 직접 고른 비교(기준 제품 · 비교 제품).
 * 기본값은 swap이라 교체 제안 화면은 이전과 같다.
 */
export type CompareMode = 'swap' | 'direct';
export const CompareModeContext = createContext<CompareMode>('swap');

export function useCompareLabels() {
  const direct = useContext(CompareModeContext) === 'direct';
  return {
    direct,
    a: direct ? '기준 제품' : '내 제품',
    b: direct ? '비교 제품' : '대체품',
  };
}
