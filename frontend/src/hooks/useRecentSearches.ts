import { useCallback, useEffect, useState } from 'react';

const MAX_ITEMS = 20;

function storageKey(scope: 'general' | 'ingredient') {
  return `dcmy:recentSearch:${scope}:v1`;
}

function readStorage(scope: 'general' | 'ingredient'): string[] {
  try {
    const raw = localStorage.getItem(storageKey(scope));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeStorage(scope: 'general' | 'ingredient', items: string[]) {
  try {
    localStorage.setItem(storageKey(scope), JSON.stringify(items));
  } catch {
    // localStorage 사용 불가 시 조용히 무시
  }
}

/** 최근 검색어 (localStorage 기반, 통합검색/성분검색 독립 저장) */
export function useRecentSearches(scope: 'general' | 'ingredient') {
  const [items, setItems] = useState<string[]>(() => readStorage(scope));

  useEffect(() => {
    writeStorage(scope, items);
  }, [scope, items]);

  const addSearch = useCallback((query: string) => {
    const q = query.trim();
    if (!q) return;
    setItems((prev) => {
      const rest = prev.filter((s) => s !== q);
      return [q, ...rest].slice(0, MAX_ITEMS);
    });
  }, []);

  const removeSearch = useCallback((query: string) => {
    setItems((prev) => prev.filter((s) => s !== query));
  }, []);

  const clearSearches = useCallback(() => {
    setItems([]);
  }, []);

  return { items, addSearch, removeSearch, clearSearches };
}
