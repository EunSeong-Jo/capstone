import { createContext, useContext } from 'react';
import { Product } from '../types';

/**
 * Context 객체·타입·훅만 담습니다.
 *
 * Provider(`LikedProductsContext.tsx`)와 파일을 나눈 이유는 Fast Refresh
 * 때문입니다 — 자세한 배경은 `closet.ts` 상단 주석을 보세요.
 */
export interface LikedProductsContextValue {
  likedProducts: Product[];
  isLiked: (id: number) => boolean;
  toggleLike: (product: Product) => void;
  clearLikedProducts: () => void;
}

export const LikedProductsContext = createContext<LikedProductsContextValue | null>(
  null,
);

export function useLikedProducts() {
  const ctx = useContext(LikedProductsContext);
  if (!ctx) {
    throw new Error('useLikedProducts must be used within a LikedProductsProvider');
  }
  return ctx;
}
