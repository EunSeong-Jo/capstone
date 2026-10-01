import { useNavigate, useParams } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { useOrders } from '../../hooks/useOrders';

/**
 * 주문 상세 — 영수증 형태로 품목·결제 내역을 보여준다.
 *
 * 금액은 전부 `order_items`에 박제된 그때 그 가격으로 계산한다. 제품 가격이
 * 나중에 바뀌어도 과거 주문 금액은 움직이지 않아야 한다.
 */

/** 배송비를 받은 적이 없다. 0원인 게 사실이라 그대로 적는다. */
const SHIPPING_FEE = 0;

const fmtDate = (iso: string) =>
  new Date(iso)
    .toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
    .replace(/\.$/, '');

/** uuid 전체는 화면에 너무 길다. 앞 8자리면 목록에서 구분된다. */
const shortId = (id: string) => id.slice(0, 8).toUpperCase();

export default function OrderDetailPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { orders, loading } = useOrders();
  const order = orders.find((o) => o.id === decodeURIComponent(orderId ?? ''));

  if (loading) {
    return (
      <PageWrapper className="bg-surface-warm">
        <Header showBack title="주문 상세" />
        <div className="animate-pulse space-y-3 p-4">
          <div className="h-24 rounded-2xl bg-white" />
          <div className="h-40 rounded-2xl bg-white" />
        </div>
      </PageWrapper>
    );
  }

  if (!order) {
    return (
      <PageWrapper className="bg-surface-warm">
        <Header showBack title="주문 상세" />
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
          <span className="text-3xl">🧾</span>
          <p className="text-sm text-gray-50">주문 정보를 찾을 수 없어요.</p>
          <button
            onClick={() => navigate('/mypage/order-history')}
            className="mt-2 rounded-xl border border-gray-20 px-5 py-2.5 text-sm font-medium active:scale-95"
          >
            주문내역으로
          </button>
        </div>
      </PageWrapper>
    );
  }

  // 합계는 서버가 결제 시점에 계산해 `orders.total`에 적어 둔 값을 쓴다.
  // 품목에서 다시 더하면 두 숫자가 갈라질 여지가 생긴다.

  return (
    <PageWrapper className="bg-surface-warm">
      <Header showBack title="주문 상세" />

      <div className="px-4 py-5">
        <div className="rounded-2xl border border-[#ECEEE8] bg-white p-4">
          <p className="text-xs text-gray-50">주문번호</p>
          <p className="mt-0.5 text-sm font-bold text-gray-100">{shortId(order.id)}</p>
          <div className="mt-3 flex items-center justify-between border-t border-gray-10 pt-3">
            <span className="text-xs text-gray-50">주문일시</span>
            <span className="text-xs font-semibold text-gray-100">{fmtDate(order.placedAt)}</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-xs text-gray-50">주문상태</span>
            <span className="inline-block rounded bg-primary px-2 py-0.5 text-[11px] font-bold text-white">
              결제완료
            </span>
          </div>
        </div>

        <p className="mb-2 mt-5 text-[15px] font-extrabold text-gray-100">
          주문 상품 ({order.items.length}건)
        </p>
        <div className="divide-y divide-gray-10 rounded-2xl border border-[#ECEEE8] bg-white">
          {order.items.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={item.productId === null}
              onClick={() => item.productId !== null && navigate(`/detail/${item.productId}`)}
              className="flex w-full gap-3 p-4 text-left disabled:cursor-default"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-snug text-gray-100">
                  {item.productName}
                </p>
                <p className="mt-0.5 text-xs text-gray-50">
                  {item.brandName ? `${item.brandName} · ` : ''}
                  {item.qty}개
                </p>
                <p className="mt-1 text-sm font-bold text-gray-100">
                  {(item.unitPrice * item.qty).toLocaleString()}원
                </p>
              </div>
            </button>
          ))}
        </div>

        <p className="mb-2 mt-5 text-[15px] font-extrabold text-gray-100">결제 금액</p>
        <div className="rounded-2xl border border-[#ECEEE8] bg-white p-4">
          <div className="flex items-center justify-between text-sm text-gray-70">
            <span>상품 금액</span>
            <span>{order.total.toLocaleString()}원</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm text-gray-70">
            <span>배송비</span>
            <span>{SHIPPING_FEE.toLocaleString()}원</span>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-gray-10 pt-3">
            <span className="text-sm font-bold text-gray-100">총 결제금액</span>
            <span className="text-base font-extrabold text-primary-dark">
              {(order.total + SHIPPING_FEE).toLocaleString()}원
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate(`/mypage/order-history/${order.id}/tracking`)}
          className="mt-4 h-[48px] w-full rounded-xl border border-gray-20 bg-white text-[14px] font-semibold text-gray-100 active:scale-[.98]"
        >
          배송조회
        </button>
      </div>
    </PageWrapper>
  );
}
