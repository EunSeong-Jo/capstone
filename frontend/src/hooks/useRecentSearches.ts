import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/auth';

const MAX_ITEMS = 20;

type Kind = 'general' | 'ingredient';

/**
 * 계정별로 나눈다.
 *
 * 예전에는 `dcmy:recentSearch:<종류>:v1` 한 칸이라, 다른 계정으로 로그인하거나 로그아웃해도
 * 앞 사람의 검색어가 그대로 보였다. 저장소의 다른 개인 데이터는 전부 이 규칙을 쓴다
 * (`closet`·`likes`·`recent`·`myIngredients`…). 옛 키는 누구 것인지 알 수 없어 이관하지 않고
 * 한 번 지운다 — 옮기면 지금 고치려는 그 유출을 그대로 보존하게 된다.
 */
const keyOf = (scope: string, kind: Kind) => `swappy:recentSearch:${kind}:v2:${scope}`;
const LEGACY_KEYS = ['dcmy:recentSearch:general:v1', 'dcmy:recentSearch:ingredient:v1'];

function readStorage(scope: string, kind: Kind): string[] {
  try {
    for (const k of LEGACY_KEYS) localStorage.removeItem(k);
    const raw = localStorage.getItem(keyOf(scope, kind));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeStorage(scope: string, kind: Kind, items: string[]) {
  try {
    localStorage.setItem(keyOf(scope, kind), JSON.stringify(items));
  } catch {
    // localStorage 사용 불가 시 조용히 무시
  }
}

/** 최근 검색어 (localStorage 기반, 통합검색/성분검색 독립 저장, 계정별) */
export function useRecentSearches(kind: Kind) {
  const { scope } = useAuth();

  /** 목록 + 그것이 어느 계정의 것인지. 계정이 바뀌면 이전 목록은 남의 것이다. */
  const [store, setStore] = useState<{ scope: string; items: string[] }>(() => ({
    scope,
    items: readStorage(scope, kind),
  }));

  // 계정 전환은 렌더 중에 반영한다 — effect에서 하면 한 프레임 동안 남의 목록이 보인다.
  if (store.scope !== scope) {
    setStore({ scope, items: readStorage(scope, kind) });
  }

  useEffect(() => {
    writeStorage(store.scope, kind, store.items);
  }, [store, kind]);

  const addSearch = useCallback((query: string) => {
    const q = query.trim();
    if (!q) return;
    setStore((prev) => ({
      scope: prev.scope,
      items: [q, ...prev.items.filter((s) => s !== q)].slice(0, MAX_ITEMS),
    }));
  }, []);

  const removeSearch = useCallback((query: string) => {
    setStore((prev) => ({ scope: prev.scope, items: prev.items.filter((s) => s !== query) }));
  }, []);

  const clearSearches = useCallback(() => {
    setStore((prev) => ({ scope: prev.scope, items: [] }));
  }, []);

  return { items: store.items, addSearch, removeSearch, clearSearches };
}
