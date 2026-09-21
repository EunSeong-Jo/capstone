import { useCart } from '../context/CartContext';

const fmtDate = (ts: number) =>
  new Date(ts).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\.$/, '');

// 예시 주문에는 상품 이미지가 없고 이모지 자리표시를 쓴다. 장바구니에서 만들어진
// 실제 주문(useCart)은 imageUrl을 갖고 있어, 두 목록을 합치려면 선택 필드여야 한다.
export interface OrderItem {
  id: number;
  name: string;
  option: string;
  qty: number;
  price: string;
  bg: string;
  emoji: string;
  imageUrl?: string;
}

export interface OrderEntry {
  id: string;
  date: string;
  status: string;
  statusBg: string;
  statusColor: string;
  items: OrderItem[];
}

const seedOrders: OrderEntry[] = [
  {
    id: 'ORD-2026041101',
    date: '2026.04.11',
    status: '배송완료',
    statusBg: 'bg-gray-100',
    statusColor: 'text-white',
    items: [
      { id: 1, name: '수분 밸런싱 토너 200ml', option: '옵션 : 기본 200ml', qty: 1, price: '28,000', bg: 'bg-primary-light', emoji: '🧴' },
      { id: 2, name: '히알루론산 에센스 50ml', option: '옵션 : 기본 50ml', qty: 1, price: '18,000', bg: 'bg-sky-100', emoji: '💧' },
    ],
  },
  {
    id: 'ORD-2026060501',
    date: '2026.06.05',
    status: '배송중',
    statusBg: 'bg-primary',
    statusColor: 'text-white',
    items: [
      { id: 3, name: '세라마이드 수분 크림 60ml', option: '옵션 : 본품 60ml', qty: 1, price: '42,000', bg: 'bg-rose-100', emoji: '🫙' },
    ],
  },
  {
    id: 'ORD-2026061801',
    date: '2026.06.18',
    status: '결제완료',
    statusBg: 'bg-amber-100',
    statusColor: 'text-amber-800',
    items: [
      { id: 4, name: '나이아신아마이드 세럼 30ml', option: '옵션 : 기본 30ml', qty: 2, price: '34,000', bg: 'bg-yellow-50', emoji: '✨' },
      { id: 5, name: '순한 거품 클렌저 150ml', option: '옵션 : 기본 150ml', qty: 1, price: '15,000', bg: 'bg-violet-50', emoji: '🫧' },
    ],
  },
];

export const STATUS_TYPES = ['전체 상태', '주문접수', '결제완료', '배송준비중', '배송중', '배송완료'];

/** 주문내역/주문상세/배송조회 3개 화면이 같은 목록(실제 장바구니 주문 + 예시 주문)을 본다 */
export function useOrders(): OrderEntry[] {
  const { orders: myOrders } = useCart();

  return [
    ...myOrders.map((o) => ({
      id: o.id,
      date: fmtDate(o.placedAt),
      status: o.status,
      statusBg: 'bg-primary',
      statusColor: 'text-white',
      items: o.lines.map((l) => ({
        id: l.id,
        name: l.name,
        option: `옵션 : 기본 · ${l.brand}`,
        qty: l.qty,
        price: l.price.toLocaleString(),
        bg: 'bg-primary-light',
        emoji: '🧴',
        imageUrl: l.imageUrl,
      })),
    })),
    ...seedOrders,
  ];
}
