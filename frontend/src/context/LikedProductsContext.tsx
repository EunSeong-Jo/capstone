import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Product } from '../types';

const STORAGE_KEY = 'dcmy:likedProducts:v1';

type LikedMap = Record<number, Product>;

interface LikedProductsContextValue {
  likedProducts: Product[];
  isLiked: (id: number) => boolean;
  toggleLike: (product: Product) => void;
  clearLikedProducts: () => void;
}

const LikedProductsContext = createContext<LikedProductsContextValue | null>(null);

function readStorage(): LikedMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LikedMap) : {};
  } catch {
    return {};
  }
}

function writeStorage(map: LikedMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // localStorage 사용 불가 시 조용히 무시
  }
}

/** 찜(좋아요) 상태 전역 공유 — 여러 화면(Home/Search/Category/ProductDetail/Likes)이 같은 상태를 봐야 하므로 Context로 구현 */
export function LikedProductsProvider({ children }: { children: ReactNode }) {
  const [likedMap, setLikedMap] = useState<LikedMap>(() => readStorage());

  useEffect(() => {
    writeStorage(likedMap);
  }, [likedMap]);

  const isLiked = useCallback((id: number) => Boolean(likedMap[id]), [likedMap]);

  const toggleLike = useCallback((product: Product) => {
    setLikedMap((prev) => {
      if (prev[product.id]) {
        const rest = { ...prev };
        delete rest[product.id];
        return rest;
      }
      return { ...prev, [product.id]: product };
    });
  }, []);

  const clearLikedProducts = useCallback(() => {
    setLikedMap({});
  }, []);

  const likedProducts = useMemo(
    () => Object.values(likedMap).sort((a, b) => b.id - a.id),
    [likedMap],
  );

  const value = useMemo(
    () => ({ likedProducts, isLiked, toggleLike, clearLikedProducts }),
    [likedProducts, isLiked, toggleLike, clearLikedProducts],
  );

  return <LikedProductsContext.Provider value={value}>{children}</LikedProductsContext.Provider>;
}

export function useLikedProducts() {
  const ctx = useContext(LikedProductsContext);
  if (!ctx) {
    throw new Error('useLikedProducts must be used within a LikedProductsProvider');
  }
  return ctx;
}
