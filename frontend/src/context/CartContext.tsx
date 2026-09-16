import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from './AuthContext';
import { readJSON, writeJSON } from './storage';

/**
 * 장바구니 + 주문내역.
 *
 * 결제 PG 연동은 범위 밖이라 `checkout()`은 장바구니를 주문내역으로 옮기는 것으로
 * "구매 완료"를 흉내낸다. 주문은 `swappy:orders:v1:<scope>`에 쌓이고
 * 마이페이지 주문내역 화면이 이를 읽는다.
 */

const cartKey = (scope: string) => `swappy:cart:v1:${scope}`;
const ordersKey = (scope: string) => `swappy:orders:v1:${scope}`;

export interface CartLine {
  id: number;
  name: string;
  brand: string;
  price: number;
  imageUrl?: string;
  qty: number;
}

export interface Order {
  id: string;
  lines: CartLine[];
  total: number;
  placedAt: number;
  status: '결제완료' | '배송중' | '배송완료';
}

export type CartProductInput = Omit<CartLine, 'qty'>;

interface CartContextValue {
  lines: CartLine[];
  count: number;
  subtotal: number;
  orders: Order[];
  inCart: (id: number) => boolean;
  addToCart: (product: CartProductInput, qty?: number) => void;
  setQty: (id: number, qty: number) => void;
  removeLine: (id: number) => void;
  clearCart: () => void;
  checkout: () => Order | null;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const { scope } = useAuth();
  const [lines, setLines] = useState<CartLine[]>(() => readJSON<CartLine[]>(cartKey(scope), []));
  const [orders, setOrders] = useState<Order[]>(() => readJSON<Order[]>(ordersKey(scope), []));
  const lastScope = useRef(scope);

  useEffect(() => {
    if (lastScope.current === scope) return;
    lastScope.current = scope;
    setLines(readJSON<CartLine[]>(cartKey(scope), []));
    setOrders(readJSON<Order[]>(ordersKey(scope), []));
  }, [scope]);

  useEffect(() => {
    writeJSON(cartKey(scope), lines);
  }, [lines, scope]);

  useEffect(() => {
    writeJSON(ordersKey(scope), orders);
  }, [orders, scope]);

  const addToCart = useCallback((product: CartProductInput, qty = 1) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.id === product.id);
      if (existing) {
        return prev.map((l) => (l.id === product.id ? { ...l, qty: l.qty + qty } : l));
      }
      return [{ ...product, qty }, ...prev];
    });
  }, []);

  const setQty = useCallback((id: number, qty: number) => {
    setLines((prev) =>
      qty <= 0
        ? prev.filter((l) => l.id !== id)
        : prev.map((l) => (l.id === id ? { ...l, qty } : l)),
    );
  }, []);

  const removeLine = useCallback((id: number) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const clearCart = useCallback(() => setLines([]), []);

  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.price * l.qty, 0), [lines]);
  const count = useMemo(() => lines.reduce((s, l) => s + l.qty, 0), [lines]);

  const checkout = useCallback((): Order | null => {
    if (lines.length === 0) return null;
    const order: Order = {
      id: `OD${Date.now()}`,
      lines,
      total: lines.reduce((s, l) => s + l.price * l.qty, 0),
      placedAt: Date.now(),
      status: '결제완료',
    };
    setOrders((prev) => [order, ...prev]);
    setLines([]);
    return order;
  }, [lines]);

  const inCart = useCallback((id: number) => lines.some((l) => l.id === id), [lines]);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      count,
      subtotal,
      orders,
      inCart,
      addToCart,
      setQty,
      removeLine,
      clearCart,
      checkout,
    }),
    [lines, count, subtotal, orders, inCart, addToCart, setQty, removeLine, clearCart, checkout],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within a CartProvider');
  return ctx;
}
