import { useCallback, useEffect, useState } from 'react';
import { Product } from '../types';

const STORAGE_KEY = 'dcmy:recentlyViewed:v1';
const MAX_ITEMS = 50;

export type RecentlyViewedItem = Product & { viewedAt: number };

function readStorage(): RecentlyViewedItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RecentlyViewedItem[]) : [];
  } catch {
    return [];
  }
}

function writeStorage(items: RecentlyViewedItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // localStorage 사용 불가(프라이빗 모드, 용량 초과 등) 시 조용히 무시
  }
}

/** 최근 본 제품 목록 (localStorage 기반, 최대 50개, 최신순, id 중복 시 갱신) */
export function useRecentlyViewed() {
  const [items, setItems] = useState<RecentlyViewedItem[]>(() => readStorage());

  useEffect(() => {
    writeStorage(items);
  }, [items]);

  const addRecentlyViewed = useCallback((product: Product) => {
    setItems((prev) => {
      const rest = prev.filter((p) => p.id !== product.id);
      const next = [{ ...product, viewedAt: Date.now() }, ...rest];
      return next.slice(0, MAX_ITEMS);
    });
  }, []);

  const removeRecentlyViewed = useCallback((id: number) => {
    setItems((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const clearRecentlyViewed = useCallback(() => {
    setItems([]);
  }, []);

  return { items, addRecentlyViewed, removeRecentlyViewed, clearRecentlyViewed };
}
