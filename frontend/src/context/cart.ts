import { createContext, useContext } from 'react';

/**
 * Context 객체·타입·훅만 담습니다.
 *
 * Provider(`CartContext.tsx`)와 파일을 나눈 이유는 Fast Refresh 때문입니다 —
 * 자세한 배경은 `closet.ts` 상단 주석을 보세요.
 */

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
  status: string;
}

export type CartProductInput = Omit<CartLine, 'qty'>;

export interface CartContextValue {
  lines: CartLine[];
  count: number;
  subtotal: number;
  orders: Order[];
  /** 서버에서 불러오는 중 */
  loading: boolean;
  inCart: (id: number) => boolean;
  addToCart: (product: CartProductInput, qty?: number) => void;
  setQty: (id: number, qty: number) => void;
  removeLine: (id: number) => void;
  clearCart: () => void;
  /** 서버 왕복이 생겨 Promise다. 실패하면 null. */
  checkout: () => Promise<Order | null>;
}

export const CartContext = createContext<CartContextValue | null>(null);

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within a CartProvider');
  return ctx;
}
