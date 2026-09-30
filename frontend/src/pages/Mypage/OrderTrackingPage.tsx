import { useNavigate, useParams } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { useOrders } from '../../hooks/useOrders';

import { STAGE_LABEL, fmtDateTime, isClosed } from '../../utils/orderStage';

/**
 * 배송조회.
 *
 * 택배 연동이 없어 단계는 서버가 주문 시각에서 계산한다
 * (`services/order_stage.py`). 각 단계가 된 시각도 서버가 준다.
 * 취소·반품된 주문은 그 시점까지 지나간 단계만 표시한다.
 */
const shortId = (id: string) => id.slice(0, 8).toUpperCase();

export default function OrderTrackingPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { orders, loading } = useOrders();
  const order = orders.find((o) => o.id === decodeURIComponent(orderId ?? ''));

  if (loading) {
    return (
      <PageWrapper className="bg-surface-warm">
        <Header showBack title="배송조회" />
        <div className="animate-pulse space-y-3 p-4">
          <div className="h-20 rounded-2xl bg-white" />
          <div className="h-64 rounded-2xl bg-white" />
        </div>
      </PageWrapper>
    );
  }

  if (!order) {
    return (
      <PageWrapper className="bg-surface-warm">
        <Header showBack title="배송조회" />
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
          <span className="text-3xl">🚚</span>
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

  const steps = order.tracking;
  // 시각이 있는 마지막 단계가 지금 단계다.
  const currentIndex = steps.reduce((last, step, i) => (step.at ? i : last), 0);
  const closed = isClosed(order.status);

  return (
    <PageWrapper className="bg-surface-warm">
      <Header showBack title="배송조회" />

      <div className="px-4 py-5">
        <div className="rounded-2xl border border-[#ECEEE8] bg-white p-4">
          <p className="text-xs text-gray-50">주문번호 {shortId(order.id)}</p>
          <p className="mt-1 text-[15px] font-extrabold text-gray-100">
            {order.items[0]?.productName}
            {order.items.length > 1 && ` 외 ${order.items.length - 1}건`}
          </p>
        </div>

        <div className="mt-5 rounded-2xl border border-[#ECEEE8] bg-white p-5">
          {steps.map((step, i) => {
            const done = step.at !== null;
            const isLast = i === steps.length - 1;
            return (
              <div key={step.stage} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                      done ? 'bg-primary text-white' : 'bg-gray-10 text-gray-50'
                    }`}
                  >
                    {done ? '✓' : i + 1}
                  </span>
                  {!isLast && (
                    <span
                      className={`w-0.5 flex-1 ${i < currentIndex ? 'bg-primary' : 'bg-gray-10'}`}
                      style={{ minHeight: 28 }}
                    />
                  )}
                </div>
                <div className={isLast ? 'pb-0' : 'pb-7'}>
                  <p className={`text-sm font-bold ${done ? 'text-gray-100' : 'text-gray-50'}`}>
                    {STAGE_LABEL[step.stage] ?? step.stage}
                  </p>
                  {step.at && <p className="mt-0.5 text-xs text-gray-50">{fmtDateTime(step.at)}</p>}
                  {!closed && i === currentIndex && (
                    <p className="mt-0.5 text-xs font-semibold text-primary-dark">현재 상태예요</p>
                  )}
                  {!done && <p className="mt-0.5 text-xs text-gray-50">{closed ? '진행 안 함' : '예정'}</p>}
                </div>
              </div>
            );
          })}
        </div>

        {closed && (
          <p className="mt-4 rounded-xl bg-white p-3 text-center text-xs font-semibold text-gray-70">
            {order.status === 'cancelled' ? '취소된 주문이에요' : '반품된 주문이에요'}
            {order.closedAt && ` · ${fmtDateTime(order.closedAt)}`}
          </p>
        )}
        <p className="mt-4 text-center text-xs leading-relaxed text-gray-50">
          택배사 연동 전이라 배송 단계는 주문 시각 기준으로 진행돼요.
        </p>
      </div>
    </PageWrapper>
  );
}
