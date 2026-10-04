import { useCallback, useEffect, useState } from 'react';
import {
  clearRecentlyViewed as apiClear,
  fetchRecentlyViewed,
  touchRecentlyViewed,
} from '../api/personal';
import { useAuth } from '../context/auth';
import { readJSON, removeKey, writeJSON } from '../context/storage';
import { load, meKey, peek, put } from '../api/queryCache';
import { Product } from '../types';

/**
 * 최근 본 제품.
 *
 * 로그인 상태면 서버가 정본(`/api/v1/me/recently-viewed`, 최신 30개).
 * 비회원은 localStorage.
 *
 * 예전에는 `dcmy:recentlyViewed:v1` 한 키를 계정 구분 없이 썼다.
 */
const GUEST_KEY = 'swappy:recent:v1:guest';
const MAX_ITEMS = 30;
/** 탭을 연달아 오갈 때는 다시 묻지 않는다 */
const RECENT_FRESH_MS = 30 * 1000;

/** 회원 목록의 시작값. 앞서 받은 게 있으면 그것부터 그린다(탭 이동 깜빡임 제거) */
const initialItems = (scope: string, isUser: boolean) =>
  isUser
    ? (peek<RecentlyViewedItem[]>(meKey(scope, 'recent'))?.value ?? [])
    : readJSON<RecentlyViewedItem[]>(GUEST_KEY, []);

export type RecentlyViewedItem = Product & { viewedAt: number };

export function useRecentlyViewed() {
  const { scope, isUser, loading: authLoading } = useAuth();

  /** 목록 + 그것이 어느 계정의 것인지. 계정이 바뀌면 이전 목록은 남의 것이다. */
  const [store, setStore] = useState<{ scope: string; items: RecentlyViewedItem[] }>(
    () => ({ scope, items: initialItems(scope, isUser) }),
  );

  // 계정 전환은 렌더 중에 반영한다 — effect에서 하면 렌더가 한 번 더 돈다.
  if (store.scope !== scope) {
    setStore({ scope, items: initialItems(scope, isUser) });
  }

  const items = store.items;
  const setItems = useCallback(
    (next: RecentlyViewedItem[] | ((prev: RecentlyViewedItem[]) => RecentlyViewedItem[])) => {
      setStore((prev) => ({
        scope: prev.scope,
        items: typeof next === 'function' ? next(prev.items) : next,
      }));
    },
    [],
  );

  useEffect(() => {
    // 게스트 목록은 위에서 이미 읽었다. 서버 조회만 여기서 한다.
    if (authLoading || !isUser) return;

    let alive = true;
    const cacheKey = meKey(scope, 'recent');
    load(cacheKey, async () => {
      const pending = readJSON<RecentlyViewedItem[]>(GUEST_KEY, []);
      if (pending.length > 0) {
        // 오래된 것부터 보내야 서버의 최신순이 뒤집히지 않는다.
        for (const p of [...pending].reverse()) {
          await touchRecentlyViewed(p.id).catch(() => undefined);
        }
        removeKey(GUEST_KEY);
      }
      const server = await fetchRecentlyViewed();
      return server.map((p) => ({ ...p, viewedAt: Date.now() }));
    }, RECENT_FRESH_MS)
      .then((list) => {
        if (alive) setItems(list);
      })
      .catch(() => {
        if (alive) setItems([]);
      });

    return () => {
      alive = false;
    };
  }, [scope, isUser, authLoading, setItems]);

  /** 바뀐 목록을 남긴다. 비회원은 localStorage, 회원은 캐시(다음에 화면을 열 때 바로 보이게) */
  const persist = useCallback(
    (next: RecentlyViewedItem[]) => {
      if (isUser) put(meKey(scope, 'recent'), next);
      else writeJSON(GUEST_KEY, next);
    },
    [isUser, scope],
  );

  const addRecentlyViewed = useCallback(
    (product: Product) => {
      setItems((prev) => {
        const rest = prev.filter((p) => p.id !== product.id);
        const next = [{ ...product, viewedAt: Date.now() }, ...rest].slice(0, MAX_ITEMS);
        persist(next);
        return next;
      });
      if (isUser) void touchRecentlyViewed(product.id).catch(() => undefined);
    },
    [isUser, persist, setItems],
  );

  const removeRecentlyViewed = useCallback(
    (id: number) => {
      // 서버에 단건 삭제 엔드포인트를 두지 않았다. 화면에서만 감추고,
      // 다음 조회에서 서버 목록으로 돌아온다 — 전체삭제가 실제 동작이다.
      setItems((prev) => {
        const next = prev.filter((p) => p.id !== id);
        persist(next);
        return next;
      });
    },
    [persist, setItems],
  );

  const clearRecentlyViewed = useCallback(() => {
    setItems([]);
    if (!isUser) {
      removeKey(GUEST_KEY);
      return;
    }
    put(meKey(scope, 'recent'), []);
    void apiClear().catch(() => undefined);
  }, [isUser, scope, setItems]);

  return { items, addRecentlyViewed, removeRecentlyViewed, clearRecentlyViewed };
}
