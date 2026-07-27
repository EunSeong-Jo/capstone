import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'dcmy:myIngredients:v1';

function readStorage(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeStorage(items: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // localStorage 사용 불가 시 조용히 무시
  }
}

/** 마이 성분(즐겨찾는 성분) 목록 — 성분 사전의 + 버튼으로 추가 */
export function useMyIngredients() {
  const [items, setItems] = useState<string[]>(() => readStorage());

  useEffect(() => {
    writeStorage(items);
  }, [items]);

  const addIngredient = useCallback((name: string) => {
    setItems((prev) => (prev.includes(name) ? prev : [name, ...prev]));
  }, []);

  const removeIngredient = useCallback((name: string) => {
    setItems((prev) => prev.filter((i) => i !== name));
  }, []);

  return { items, addIngredient, removeIngredient };
}
