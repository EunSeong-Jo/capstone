import {
  ReactNode,
  useCallback,
  useEffect,
  useRef,
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
import { useCloset } from './closet';
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
  const { reload: reloadCloset } = useCloset();

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

  /**
   * 담기·수량·삭제 요청의 응답 순서 관리.
   *
   * 응답마다 서버가 장바구니 전체를 돌려주고 화면을 그걸로 덮어쓰는데, 응답이
   * 보낸 순서대로 온다는 보장이 없다. 추천 세트를 담자마자(추가 요청 4개가 동시에
   * 나감) 한 제품을 지우면, 삭제보다 먼저 처리된 추가 요청의 응답이 늦게 도착해
   * **지운 제품이 화면에 되살아났다**(서버에는 없어서 새로고침하면 사라졌다).
   *
   * 서버도 마찬가지였다. 요청을 동시에 보내면 DB가 느릴 때 나중에 보낸 삭제가
   * 먼저 끝나고, 먼저 보낸 담기가 뒤늦게 처리돼 **서버에 제품이 다시 들어갔다**
   * (접근 로그에서 POST와 DELETE가 뒤섞여 끝났다).
   *
   * 그래서 요청을 **한 줄로 세워** 앞 요청이 끝난 뒤 다음 요청을 보낸다 — 서버가
   * 누른 순서대로 처리한다. 화면에는 가장 최근 요청의 응답만 반영하고, 이전
   * 응답을 버린 적이 있으면 줄이 다 빈 뒤 서버 장바구니를 한 번 다시 받아 맞춘다.
   */
  const reqSeq = useRef(0);
  const inflight = useRef(0);
  const skipped = useRef(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const track = useCallback(
    (send: () => Promise<CartDto>, onError?: () => void) => {
      const mine = ++reqSeq.current;
      inflight.current += 1;
      const request = queue.current.then(send);
      // 실패해도 줄은 계속 흐른다.
      queue.current = request.catch(() => undefined);
      request
        .then((dto) => {
          if (mine === reqSeq.current) setLines(toLines(dto));
          else skipped.current = true;
        })
        .catch(() => onError?.())
        .finally(() => {
          inflight.current -= 1;
          if (inflight.current > 0 || !skipped.current) return;
          skipped.current = false;
          const at = reqSeq.current;
          fetchCart()
            .then((dto) => {
              // 그사이 새 요청이 시작됐으면 그 요청이 맞춘다.
              if (at === reqSeq.current && inflight.current === 0) setLines(toLines(dto));
            })
            .catch(() => undefined);
        });
    },
    [setLines],
  );

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
      track(() => addCartItem(product.id, qty), () => {
        // 서버가 거부하면(없는 제품 등) 화면도 되돌린다.
        setLines((prev) => prev.filter((l) => l.id !== product.id));
      });
    },
    [isUser, persistGuest, setLines, track],
  );

  const setQty = useCallback(
    (id: number, qty: number) => {
      setLines((prev) => {
        const next = qty <= 0 ? prev.filter((l) => l.id !== id) : prev.map((l) => (l.id === id ? { ...l, qty } : l));
        persistGuest(next);
        return next;
      });
      if (isUser) track(() => setCartQty(id, Math.max(0, qty)));
    },
    [isUser, persistGuest, setLines, track],
  );

  const removeLine = useCallback(
    (id: number) => {
      setLines((prev) => {
        const next = prev.filter((l) => l.id !== id);
        persistGuest(next);
        return next;
      });
      if (isUser) track(() => removeCartItem(id));
    },
    [isUser, persistGuest, setLines, track],
  );

  const clearCart = useCallback(() => {
    const snapshot = lines;
    // 진행 중인 담기·삭제 응답이 늦게 와서 비운 장바구니를 되살리지 않게.
    reqSeq.current += 1;
    setLines([]);
    if (!isUser) {
      removeKey(GUEST_CART);
      return;
    }
    // 줄 뒤에 붙인다 — 앞에 서 있던 담기가 비운 뒤에 처리되면 다시 채워진다.
    queue.current = queue.current.then(() =>
      Promise.allSettled(snapshot.map((l) => removeCartItem(l.id))),
    );
  }, [lines, isUser, setLines]);

  const checkout = useCallback(async (): Promise<Order | null> => {
    // 주문은 계정에 묶인다. 비회원은 결제할 수 없다 — 예전에는 게스트도
    // localStorage에 '주문'을 쌓을 수 있었는데, 그 기록은 아무데도 없었다.
    if (!isUser || lines.length === 0) return null;

    try {
      // 아직 처리 중인 담기·삭제가 끝난 장바구니로 주문한다.
      await queue.current;
      const dto = await placeOrder();
      reqSeq.current += 1; // 결제 전에 나간 요청의 늦은 응답을 버린다
      setLines([]);
      // 서버가 주문한 제품을 화장대에 담았다. 화장대 목록도 다시 받는다.
      void reloadCloset();
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
  }, [isUser, lines.length, reloadOrders, reloadCloset, setLines]);

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
