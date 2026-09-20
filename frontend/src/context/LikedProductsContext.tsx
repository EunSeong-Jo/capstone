import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { addLike, fetchLikes, removeLike } from '../api/personal';
import { Product } from '../types';
import { LikedProductsContext } from './liked';
import { useAuth } from './auth';
import { readJSON, removeKey, writeJSON } from './storage';

/**
 * 찜한 제품.
 *
 * 로그인 상태면 서버가 정본이다(`/api/v1/me/likes`). 비회원은 localStorage.
 *
 * 예전에는 `dcmy:likedProducts:v1` **한 키를 계정 구분 없이** 썼다. 다른
 * 계정으로 로그인해도 같은 찜 목록이 보였고, 로그아웃해도 남았다. 서버는
 * (user_id, product_id) UNIQUE라 그 문제가 구조적으로 없다.
 */

const GUEST_KEY = 'swappy:likes:v1:guest';

export function LikedProductsProvider({ children }: { children: ReactNode }) {
  const { scope, isUser, loading: authLoading } = useAuth();

  /** 찜 목록 + 그것이 어느 계정의 것인지. 계정이 바뀌면 이전 목록은 남의 것이다. */
  const [store, setStore] = useState<{ scope: string; items: Product[] }>(() => ({
    scope,
    items: readJSON<Product[]>(GUEST_KEY, []),
  }));

  // 계정 전환은 렌더 중에 반영한다 — effect에서 하면 렌더가 한 번 더 돈다.
  if (store.scope !== scope) {
    setStore({ scope, items: isUser ? [] : readJSON<Product[]>(GUEST_KEY, []) });
  }

  const likedProducts = store.items;
  const setLiked = useCallback(
    (next: Product[] | ((prev: Product[]) => Product[])) => {
      setStore((prev) => ({
        scope: prev.scope,
        items: typeof next === 'function' ? next(prev.items) : next,
      }));
    },
    [],
  );

  const persistGuest = useCallback(
    (next: Product[]) => {
      if (!isUser) writeJSON(GUEST_KEY, next);
    },
    [isUser],
  );

  useEffect(() => {
    // 게스트 목록은 위에서 이미 읽었다. 서버 조회만 여기서 한다.
    if (authLoading || !isUser) return;

    let alive = true;
    (async () => {
      const pending = readJSON<Product[]>(GUEST_KEY, []);
      if (pending.length > 0) {
        await Promise.allSettled(pending.map((p) => addLike(p.id)));
        removeKey(GUEST_KEY);
      }
      const server = await fetchLikes();
      if (alive) setLiked(server);
    })().catch(() => {
      if (alive) setLiked([]);
    });

    return () => {
      alive = false;
    };
  }, [scope, isUser, authLoading, setLiked]);

  const isLiked = useCallback(
    (id: number) => likedProducts.some((p) => p.id === id),
    [likedProducts],
  );

  const toggleLike = useCallback(
    (product: Product) => {
      const liked = likedProducts.some((p) => p.id === product.id);
      const snapshot = likedProducts;

      setLiked((prev) => {
        const next = liked
          ? prev.filter((p) => p.id !== product.id)
          : [product, ...prev];
        persistGuest(next);
        return next;
      });

      if (!isUser) return;
      const call = liked ? removeLike(product.id) : addLike(product.id);
      call.catch(() => setLiked(snapshot));
    },
    [likedProducts, isUser, persistGuest, setLiked],
  );

  const clearLikedProducts = useCallback(() => {
    const snapshot = likedProducts;
    setLiked([]);
    if (!isUser) {
      removeKey(GUEST_KEY);
      return;
    }
    Promise.allSettled(snapshot.map((p) => removeLike(p.id))).then(() => undefined);
  }, [likedProducts, isUser, setLiked]);

  const value = useMemo(
    () => ({ likedProducts, isLiked, toggleLike, clearLikedProducts }),
    [likedProducts, isLiked, toggleLike, clearLikedProducts],
  );

  return (
    <LikedProductsContext.Provider value={value}>{children}</LikedProductsContext.Provider>
  );
}
