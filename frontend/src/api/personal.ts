/**
 * 개인 데이터 API (Phase 2).
 *
 * 화장대·장바구니·찜·최근 본·주문·후기·포인트·스캔 기록. 전부 로그인이
 * 필요하고, 비회원은 프론트 localStorage를 계속 씁니다.
 *
 * 응답에 제품 정보가 함께 옵니다 — 화장대 10개를 받고 상세를 10번 더
 * 부르지 않도록 서버가 조인해서 보냅니다.
 */
import { deleteJson, patchJson, postJson, request } from './client';
import { Product } from '../types';

export interface ClosetItemDto {
  id: number;
  product: Product;
  status: string;
  addedVia: string;
  addedAt: string;
}

export interface CartLineDto {
  id: number;
  product: Product;
  qty: number;
}

export interface CartDto {
  lines: CartLineDto[];
  count: number;
  subtotal: number;
}

export interface OrderItemDto {
  id: number;
  productId: number | null;
  productName: string;
  brandName: string | null;
  unitPrice: number;
  qty: number;
  reviewed: boolean;
}

export interface OrderDto {
  id: string;
  total: number;
  status: string;
  placedAt: string;
  items: OrderItemDto[];
}

export interface FrequentItemDto {
  product: Product;
  purchaseCount: number;
  lastOrderedAt: string;
}

export interface PointTxDto {
  id: number;
  amount: number;
  reason: string;
  createdAt: string;
}

export interface PointsDto {
  balance: number;
  transactions: PointTxDto[];
}

export interface ScanDto {
  id: number;
  product: Product | null;
  source: string;
  createdAt: string;
}

export interface GiftDto {
  id: string;
  productId: number | null;
  productName: string;
  brandName: string | null;
  unitPrice: number;
  recipientName: string;
  message: string | null;
  /** 전달 수단이 붙기 전까지 항상 'pending' */
  status: string;
  createdAt: string;
}

export interface StatsDto {
  closetCount: number;
  cartCount: number;
  likeCount: number;
  orderCount: number;
  scanCount: number;
  reviewCount: number;
  giftCount: number;
  totalSpent: number;
  pointBalance: number;
  /**
   * 누적 경험치와 레벨. **서버가 기록에서 계산한다** — 스캔·후기·주문·선물
   * 행을 센다. 클라이언트가 더해 나가지 않으므로 기기를 바꿔도 같다.
   */
  exp: number;
  level: number;
  /** 진행바용. 이번 레벨 안에서의 경험치 / 다음 레벨까지의 폭 */
  expInLevel: number;
  levelSpan: number;
}

/** 204 응답용. postJson은 JSON 본문을 기대하므로 따로 둡니다. */
async function send(path: string, method: string, body?: unknown): Promise<void> {
  const { getAccessToken } = await import('./tokenStore');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// ── 화장대 ──────────────────────────────────────────────
export const fetchCloset = () => request<ClosetItemDto[]>('/api/v1/me/closet');
export const addClosetItem = (productId: number, addedVia = 'search') =>
  postJson<ClosetItemDto>('/api/v1/me/closet', { productId, addedVia });
export const removeClosetItem = (productId: number) =>
  send(`/api/v1/me/closet/${productId}`, 'DELETE');

// ── 장바구니 ────────────────────────────────────────────
export const fetchCart = () => request<CartDto>('/api/v1/me/cart');
export const addCartItem = (productId: number, qty = 1) =>
  postJson<CartDto>('/api/v1/me/cart', { productId, qty });
export const setCartQty = (productId: number, qty: number) =>
  patchJson<CartDto>(`/api/v1/me/cart/${productId}`, { qty });
export const removeCartItem = (productId: number) =>
  deleteJson<CartDto>(`/api/v1/me/cart/${productId}`);

// ── 찜 ──────────────────────────────────────────────────
export const fetchLikes = () => request<Product[]>('/api/v1/me/likes');
export const addLike = (productId: number) =>
  send('/api/v1/me/likes', 'POST', { productId });
export const removeLike = (productId: number) =>
  send(`/api/v1/me/likes/${productId}`, 'DELETE');

// ── 최근 본 ─────────────────────────────────────────────
export const fetchRecentlyViewed = () => request<Product[]>('/api/v1/me/recently-viewed');
export const touchRecentlyViewed = (productId: number) =>
  send('/api/v1/me/recently-viewed', 'POST', { productId });
export const clearRecentlyViewed = () => send('/api/v1/me/recently-viewed', 'DELETE');

// ── 주문 · 후기 · 포인트 ────────────────────────────────
export const placeOrder = () => postJson<OrderDto>('/api/v1/orders', {});
export const fetchOrders = () => request<OrderDto[]>('/api/v1/me/orders');
export const fetchFrequent = () => request<FrequentItemDto[]>('/api/v1/me/orders/frequent');
export const fetchPoints = () => request<PointsDto>('/api/v1/me/points');
export const writeReview = (orderItemId: number, rating: number, body?: string) =>
  postJson<unknown>('/api/v1/me/reviews', { orderItemId, rating, body });

// ── 스캔 · 통계 ─────────────────────────────────────────
export const fetchScans = () => request<ScanDto[]>('/api/v1/me/scans');
export const addScan = (productId: number | null, source = 'search') =>
  postJson<ScanDto>('/api/v1/me/scans', { productId, source });
export const fetchStats = () => request<StatsDto>('/api/v1/me/stats');

/** 선물 보내기. 받는 분 연락처는 보내지 않는다 — 서버가 받지 않는다. */
export const sendGift = (productId: number, recipientName: string, message?: string) =>
  postJson<GiftDto>('/api/v1/gifts', { productId, recipientName, message });
export const fetchSentGifts = () => request<GiftDto[]>('/api/v1/me/gifts/sent');
