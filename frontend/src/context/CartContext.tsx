import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  CartDto,
  addCartItem,
  fetchCart,
  fetchOrders,
  placeOrder,
  removeCartItem,
  setCartQty,
} from '../api/personal';
import {
  CartContext,
  CartContextValue,
  CartLine,
  CartProductInput,
  Order,
} from './cart';
import { useAuth } from './auth';
import { readJSON, removeKey, writeJSON } from './storage';

/**
 * 장바구니 + 주문내역.
 *
 * 로그인 상태면 **서버가 정본**이다(`/api/v1/me/cart`, `/api/v1/orders`).
 * 비회원은 localStorage를 쓰고, 로그인하면 담아 둔 것이 서버로 한 번 옮겨간다.
 *
 * 결제 PG 연동은 범위 밖이라 `checkout()`은 결제를 흉내낸다. 그래도 주문은
 * 진짜 `orders` 테이블에 남는다 — 주문내역·후기·포인트·'자주 구매'가 전부
 * 그 기록에서 파생되기 때문이다. 예전에는 그 화면들이 각자 하드코딩된
 * 예시를 들고 있었다.
 */

const GUEST_CART = 'swappy:cart:v1:guest';

function toLines(dto: CartDto): CartLine[] {
  return dto.lines.map((l) => ({
    id: l.product.id,
    name: l.product.name,
    brand: l.product.brand,
    price: l.product.price,
    imageUrl: l.product.imageUrl,
    qty: l.qty,
  }));
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { scope, isUser, loading: authLoading } = useAuth();

  /**
   * 장바구니 + 주문 + 그것이 **어느 계정의 것인지**.
   *
   * 계정이 바뀌면 이전 내용은 남의 것이다. 따로 두면 새 계정 데이터가
   * 도착하기 전 한 프레임 동안 이전 계정 장바구니가 보인다.
   */
  const [store, setStore] = useState<{
    scope: string;
    lines: CartLine[];
    orders: Order[];
  }>(() => ({ scope, lines: readJSON<CartLine[]>(GUEST_CART, []), orders: [] }));

  /**
   * 계정이 바뀌면 **렌더 중에** 갈아끼운다. effect에서 하면 렌더가 한 번 더
   * 도는데(react-hooks/set-state-in-effect), 렌더 중 setState는 React가
   * 권하는 "props 변화에 맞춰 상태 조정" 패턴이다.
   *
   * 주문은 계정에 묶인 기록이라 비회원에게는 항상 빈 배열이다.
   */
  if (store.scope !== scope) {
    setStore({
      scope,
      lines: isUser ? [] : readJSON<CartLine[]>(GUEST_CART, []),
      orders: [],
    });
  }

  const { lines, orders } = store;
  const setLines = useCallback(
    (next: CartLine[] | ((prev: CartLine[]) => CartLine[])) => {
      setStore((prev) => ({
        ...prev,
        lines: typeof next === 'function' ? next(prev.lines) : next,
      }));
    },
    [],
  );
  const setOrders = useCallback(
    (next: Order[]) => setStore((prev) => ({ ...prev, orders: next })),
    [],
  );

  const [loading, setLoading] = useState(false);

  const persistGuest = useCallback(
    (next: CartLine[]) => {
      if (!isUser) writeJSON(GUEST_CART, next);
    },
    [isUser],
  );

  const reloadOrders = useCallback(async () => {
    const dto = await fetchOrders();
    setOrders(
      dto.map((o) => ({
        id: o.id,
        total: o.total,
        placedAt: new Date(o.placedAt).getTime(),
        status: o.status,
        lines: o.items.map((i) => ({
          id: i.productId ?? 0,
          name: i.productName,
          brand: i.brandName ?? '',
          price: i.unitPrice,
          qty: i.qty,
        })),
      })),
    );
  }, [setOrders]);

  useEffect(() => {
    // 게스트 장바구니는 위에서 이미 읽었다. 서버 조회만 여기서 한다.
    if (authLoading || !isUser) return;

    let alive = true;

    (async () => {
      const pending = readJSON<CartLine[]>(GUEST_CART, []);
      if (pending.length > 0) {
        await Promise.allSettled(pending.map((l) => addCartItem(l.id, l.qty)));
        removeKey(GUEST_CART);
      }
      const cart = await fetchCart();
      if (alive) setLines(toLines(cart));
      await reloadOrders();
    })()
      .catch(() => {
        if (alive) {
          setLines([]);
          setOrders([]);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [scope, isUser, authLoading, reloadOrders, setLines, setOrders]);

  const inCart = useCallback((id: number) => lines.some((l) => l.id === id), [lines]);

  const addToCart = useCallback(
    (product: CartProductInput, qty = 1) => {
      setLines((prev) => {
        const existing = prev.find((l) => l.id === product.id);
        const next = existing
          ? prev.map((l) => (l.id === product.id ? { ...l, qty: l.qty + qty } : l))
          : [{ ...product, qty }, ...prev];
        persistGuest(next);
        return next;
      });

      if (!isUser) return;
      addCartItem(product.id, qty)
        .then((dto) => setLines(toLines(dto)))
        .catch(() => {
          // 서버가 거부하면(없는 제품 등) 화면도 되돌린다.
          setLines((prev) => prev.filter((l) => l.id !== product.id));
        });
    },
    [isUser, persistGuest, setLines],
  );

  const setQty = useCallback(
    (id: number, qty: number) => {
      setLines((prev) => {
        const next = qty <= 0 ? prev.filter((l) => l.id !== id) : prev.map((l) => (l.id === id ? { ...l, qty } : l));
        persistGuest(next);
        return next;
      });
      if (isUser) {
        setCartQty(id, Math.max(0, qty))
          .then((dto) => setLines(toLines(dto)))
          .catch(() => undefined);
      }
    },
    [isUser, persistGuest, setLines],
  );

  const removeLine = useCallback(
    (id: number) => {
      setLines((prev) => {
        const next = prev.filter((l) => l.id !== id);
        persistGuest(next);
        return next;
      });
      if (isUser) {
        removeCartItem(id)
          .then((dto) => setLines(toLines(dto)))
          .catch(() => undefined);
      }
    },
    [isUser, persistGuest, setLines],
  );

  const clearCart = useCallback(() => {
    const snapshot = lines;
    setLines([]);
    if (!isUser) {
      removeKey(GUEST_CART);
      return;
    }
    Promise.allSettled(snapshot.map((l) => removeCartItem(l.id))).then(() => undefined);
  }, [lines, isUser, setLines]);

  const checkout = useCallback(async (): Promise<Order | null> => {
    // 주문은 계정에 묶인다. 비회원은 결제할 수 없다 — 예전에는 게스트도
    // localStorage에 '주문'을 쌓을 수 있었는데, 그 기록은 아무데도 없었다.
    if (!isUser || lines.length === 0) return null;

    try {
      const dto = await placeOrder();
      setLines([]);
      await reloadOrders();
      return {
        id: dto.id,
        total: dto.total,
        placedAt: new Date(dto.placedAt).getTime(),
        status: dto.status,
        lines: dto.items.map((i) => ({
          id: i.productId ?? 0,
          name: i.productName,
          brand: i.brandName ?? '',
          price: i.unitPrice,
          qty: i.qty,
        })),
      };
    } catch {
      return null;
    }
  }, [isUser, lines.length, reloadOrders, setLines]);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      count: lines.reduce((sum, l) => sum + l.qty, 0),
      subtotal: lines.reduce((sum, l) => sum + l.price * l.qty, 0),
      orders,
      loading,
      inCart,
      addToCart,
      setQty,
      removeLine,
      clearCart,
      checkout,
    }),
    [lines, orders, loading, inCart, addToCart, setQty, removeLine, clearCart, checkout],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
