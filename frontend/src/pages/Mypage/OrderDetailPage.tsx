import { useParams } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { useOrders } from '../../hooks/useOrders';

const toNumber = (price: string) => Number(price.replace(/,/g, '')) || 0;
const SHIPPING_FEE = 0;

/** 주문 상세 — 영수증 형태로 품목·결제 내역을 보여준다 */
export default function OrderDetailPage() {
  const { orderId } = useParams();
  const orders = useOrders();
  const order = orders.find((o) => o.id === decodeURIComponent(orderId ?? ''));

  if (!order) {
    return (
      <PageWrapper>
        <Header showBack title="주문 상세" />
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center px-8">
          <span className="text-3xl">🧾</span>
          <p className="text-sm text-gray-50">주문 정보를 찾을 수 없어요.</p>
        </div>
      </PageWrapper>
    );
  }

  const itemsTotal = order.items.reduce((s, i) => s + toNumber(i.price) * i.qty, 0);

  return (
    <PageWrapper className="bg-surface-warm">
      <Header showBack title="주문 상세" />

      <div className="px-4 py-5">
        <div className="rounded-2xl bg-white border border-[#ECEEE8] p-4">
          <p className="text-xs text-gray-50">주문번호</p>
          <p className="mt-0.5 text-sm font-bold text-gray-100">{order.id}</p>
          <div className="mt-3 flex items-center justify-between border-t border-gray-10 pt-3">
            <span className="text-xs text-gray-50">주문일시</span>
            <span className="text-xs font-semibold text-gray-100">{order.date}</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-xs text-gray-50">주문상태</span>
            <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${order.statusBg} ${order.statusColor}`}>
              {order.status}
            </span>
          </div>
        </div>

        <p className="mt-5 mb-2 text-[15px] font-extrabold text-gray-100">주문 상품 ({order.items.length}건)</p>
        <div className="rounded-2xl bg-white border border-[#ECEEE8] divide-y divide-gray-10">
          {order.items.map((item) => (
            <div key={item.id} className="flex gap-3 p-4">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.name} className="w-16 h-16 rounded-[10px] object-cover border border-gray-10 shrink-0" />
              ) : (
                <div className={`w-16 h-16 rounded-[10px] flex items-center justify-center text-3xl border border-gray-10 shrink-0 ${item.bg}`}>
                  {item.emoji}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-100 leading-snug">{item.name}</p>
                <p className="mt-0.5 text-xs text-gray-50">{item.option} · {item.qty}개</p>
                <p className="mt-1 text-sm font-bold text-gray-100">{(toNumber(item.price) * item.qty).toLocaleString()}원</p>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-5 mb-2 text-[15px] font-extrabold text-gray-100">결제 금액</p>
        <div className="rounded-2xl bg-white border border-[#ECEEE8] p-4">
          <div className="flex items-center justify-between text-sm text-gray-70">
            <span>상품 금액</span>
            <span>{itemsTotal.toLocaleString()}원</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm text-gray-70">
            <span>배송비</span>
            <span>{SHIPPING_FEE.toLocaleString()}원</span>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-gray-10 pt-3">
            <span className="text-sm font-bold text-gray-100">총 결제금액</span>
            <span className="text-base font-extrabold text-primary-dark">{(itemsTotal + SHIPPING_FEE).toLocaleString()}원</span>
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}
