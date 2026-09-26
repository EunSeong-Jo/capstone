import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  addClosetItem,
  fetchCloset,
  removeClosetItem,
} from '../api/personal';
import { fetchProduct } from '../api/products';
import {
  ClosetContext,
  ClosetContextValue,
  ClosetDraft,
  ClosetItem,
  ClosetSource,
  ClosetStatus,
} from './closet';
import { useAuth } from './auth';
import { readJSON, removeKey, writeJSON } from './storage';

/**
 * 내 화장대 — 사용자가 지금 쓰는 제품.
 *
 * 로그인 상태면 **서버가 정본**이다(`/api/v1/me/closet`). 비회원은 여전히
 * localStorage를 쓰고, 로그인하는 순간 한 번 서버로 옮긴다.
 *
 * 서버로 옮긴 이유는 기기 간 동기화가 아니라 무결성이다. localStorage에는
 * 아무 숫자나 제품 id로 들어갔고, 실제로 목업 시절 id(102·960001)가 남아
 * 화면이 엉뚱한 상세를 열거나 유사도 조회가 404로 떨어졌다. 서버는 전부
 * `products.id` FK라 없는 제품이 들어갈 수 없다.
 */

const keyOf = (scope: string) => `swappy:closet:v1:${scope}`;
const GUEST_KEY = keyOf('guest');

/** 서버 응답 → 화면이 쓰는 모양. 제품 정보가 함께 오므로 추가 조회가 없다. */
function toItem(dto: {
  product: { id: number; brand: string; name: string; category: string; price: number; imageUrl?: string };
  status: string;
  addedVia: string;
  addedAt: string;
}): ClosetItem {
  return {
    id: dto.product.id,
    brand: dto.product.brand,
    name: dto.product.name,
    category: dto.product.category,
    price: dto.product.price,
    imageUrl: dto.product.imageUrl,
    status: (dto.status as ClosetStatus) ?? 'owned',
    addedVia: (dto.addedVia as ClosetSource) ?? 'search',
    addedAt: new Date(dto.addedAt).getTime(),
  };
}

export function ClosetProvider({ children }: { children: ReactNode }) {
  const { scope, isUser, user: account, loading: authLoading } = useAuth();

  /**
   * 화장대 + 그것이 **어느 계정의 것인지**.
   *
   * 둘을 한 상태로 묶는 이유: 계정이 바뀌면 이전 목록은 남의 것이다. 따로
   * 두면 새 계정 데이터가 도착하기 전까지 한 프레임 동안 이전 계정의
   * 화장대가 보인다.
   */
  const [store, setStore] = useState<{ scope: string; items: ClosetItem[] }>(() => ({
    scope,
    items: readJSON<ClosetItem[]>(GUEST_KEY, []),
  }));

  /**
   * 계정이 바뀌면 **렌더 중에** 목록을 갈아끼운다.
   *
   * effect에서 하면 렌더 → effect → 렌더가 한 번 더 돈다
   * (react-hooks/set-state-in-effect). 렌더 중 setState는 React가
   * 공식적으로 권하는 "props 변화에 맞춰 상태 조정" 패턴이고, 커밋 전에
   * 다시 렌더하므로 화면에 중간 상태가 보이지 않는다.
   *
   * 로그인 계정이면 빈 목록으로 시작한다 — 서버 응답은 아래 effect가 채운다.
   */
  if (store.scope !== scope) {
    setStore({
      scope,
      items: isUser ? [] : readJSON<ClosetItem[]>(GUEST_KEY, []),
    });
  }

  const items = store.items;
  const setItems = useCallback(
    (next: ClosetItem[] | ((prev: ClosetItem[]) => ClosetItem[])) => {
      setStore((prev) => ({
        scope: prev.scope,
        items: typeof next === 'function' ? next(prev.items) : next,
      }));
    },
    [],
  );

  /**
   * 서버 조회를 끝낸 scope. 지금 scope와 다르면 아직 확인 전이다.
   *
   * 예전에는 `useState(false)`로 시작해 `.finally()`에서만 false로 두었는데
   * `setLoading(true)`가 어디에도 없어서 **loading이 항상 false**였다. 그래서
   * 교체 제안이 "화장대가 비었어요"를 먼저 보여줬다 — 화장대에 제품이 있는
   * 사용자에게도.
   *
   * effect에서 켜지 않고 파생시키는 이유는 `useStats`·`useOrders`와 같다
   * (react-hooks/set-state-in-effect).
   */
  const [settledScope, setSettledScope] = useState<string | null>(null);

  /** 게스트 저장은 그대로 localStorage. 로그인 상태에서는 쓰지 않는다. */
  const persistGuest = useCallback(
    (next: ClosetItem[]) => {
      if (!isUser) writeJSON(GUEST_KEY, next);
    },
    [isUser],
  );

  useEffect(() => {
    // 게스트 목록은 위에서 이미 읽었다. 서버 조회만 여기서 한다.
    if (authLoading || !isUser) return;

    let alive = true;

    (async () => {
      // 게스트로 담아 둔 것이 있으면 한 번 서버로 옮긴다. 옮긴 뒤 비워야
      // 다음 로그인에서 다시 올라가지 않는다.
      const pending = readJSON<ClosetItem[]>(GUEST_KEY, []);
      if (pending.length > 0) {
        await Promise.allSettled(
          pending.map((p) => addClosetItem(p.id, p.addedVia)),
        );
        removeKey(GUEST_KEY);
      }

      // 데모 계정의 보유 화장품 시드. 서버 화장대가 비었을 때만 한 번.
      const current = await fetchCloset();
      if (current.length === 0 && account?.persona) {
        await Promise.allSettled(
          account.persona.ownedCosmetics.map((c) => addClosetItem(c.id, 'seed')),
        );
        const seeded = await fetchCloset();
        if (alive) setItems(seeded.map(toItem));
        return;
      }

      if (alive) setItems(current.map(toItem));
    })()
      .catch(() => {
        // 조회에 실패하면 빈 화장대로 둔다. 목업으로 채우지 않는다.
        if (alive) setItems([]);
      })
      .finally(() => {
        // 시드까지 끝났든 실패했든 "확인은 끝났다".
        if (alive) setSettledScope(scope);
      });

    return () => {
      alive = false;
    };
  }, [scope, isUser, authLoading, account, setItems]);

  /**
   * 게스트 항목의 이미지 백필.
   *
   * 로그인 상태에서는 서버가 제품 정보를 함께 주므로 필요 없다. 게스트가
   * 담은 항목만 카탈로그에서 진짜 이미지를 받아 채운다 — 예전에는 여기에
   * picsum.photos 난수 이미지를 붙였다.
   */
  const backfilled = useRef(new Set<number>());
  useEffect(() => {
    if (isUser) return;
    const targets = items.filter((i) => !i.imageUrl && !backfilled.current.has(i.id));
    if (targets.length === 0) return;

    let alive = true;
    targets.forEach((t) => backfilled.current.add(t.id));

    Promise.allSettled(targets.map((t) => fetchProduct(t.id))).then((results) => {
      if (!alive) return;
      const found = new Map<number, string>();
      results.forEach((r) => {
        if (r.status === 'fulfilled' && r.value.imageUrl) {
          found.set(r.value.id, r.value.imageUrl);
        }
      });
      if (found.size === 0) return;
      setItems((prev) => {
        const next = prev.map((i) =>
          found.has(i.id) ? { ...i, imageUrl: found.get(i.id) } : i,
        );
        writeJSON(GUEST_KEY, next);
        return next;
      });
    });

    return () => {
      alive = false;
    };
  }, [items, isUser, setItems]);

  const hasItem = useCallback((id: number) => items.some((i) => i.id === id), [items]);

  const addItem = useCallback(
    (draft: ClosetDraft) => {
      // 낙관적 반영 — 화면이 서버 왕복을 기다리지 않는다.
      setItems((prev) => {
        if (prev.some((i) => i.id === draft.id)) return prev;
        const next = [
          { ...draft, status: draft.status ?? 'owned', addedAt: Date.now() } as ClosetItem,
          ...prev,
        ];
        persistGuest(next);
        return next;
      });

      if (!isUser) return;
      // 실패하면 되돌린다. 서버에 없는데 화면에만 있으면 다음 새로고침에
      // 조용히 사라져 "담았는데 없어졌다"가 된다.
      addClosetItem(draft.id, draft.addedVia).catch(() => {
        setItems((prev) => prev.filter((i) => i.id !== draft.id));
      });
    },
    [isUser, persistGuest, setItems],
  );

  const removeItem = useCallback(
    (id: number) => {
      const snapshot = items;
      setItems((prev) => {
        const next = prev.filter((i) => i.id !== id);
        persistGuest(next);
        return next;
      });
      if (isUser) removeClosetItem(id).catch(() => setItems(snapshot));
    },
    [items, isUser, persistGuest, setItems],
  );

  const setStatus = useCallback(
    (id: number, status: ClosetStatus) => {
      // 서버에 상태 변경 엔드포인트를 따로 두지 않았다. 화면에서만 쓰는
      // 일시 상태('분석 중')라 새로고침하면 서버 값으로 돌아가면 된다.
      setItems((prev) => {
        const next = prev.map((i) => (i.id === id ? { ...i, status } : i));
        persistGuest(next);
        return next;
      });
    },
    [persistGuest, setItems],
  );

  const clearCloset = useCallback(() => {
    const snapshot = items;
    setItems([]);
    if (!isUser) {
      removeKey(GUEST_KEY);
      return;
    }
    Promise.allSettled(snapshot.map((i) => removeClosetItem(i.id))).then(() => undefined);
  }, [items, isUser, setItems]);

  const value = useMemo<ClosetContextValue>(
    () => ({
      items,
      count: items.length,
      // 비회원은 서버에 물을 것이 없다 — localStorage가 곧 답이다.
      loading: authLoading || (isUser && settledScope !== scope),
      hasItem,
      addItem,
      removeItem,
      setStatus,
      clearCloset,
    }),
    [
      items,
      authLoading,
      isUser,
      settledScope,
      scope,
      hasItem,
      addItem,
      removeItem,
      setStatus,
      clearCloset,
    ],
  );

  return <ClosetContext.Provider value={value}>{children}</ClosetContext.Provider>;
}
