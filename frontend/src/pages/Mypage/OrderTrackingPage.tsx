import { useParams } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { useOrders } from '../../hooks/useOrders';

const STAGES = ['주문접수', '결제완료', '배송준비중', '배송중', '배송완료'];

/** 배송조회 — 주문 상태를 5단계 타임라인으로 보여준다 */
export default function OrderTrackingPage() {
  const { orderId } = useParams();
  const orders = useOrders();
  const order = orders.find((o) => o.id === decodeURIComponent(orderId ?? ''));

  if (!order) {
    return (
      <PageWrapper>
        <Header showBack title="배송조회" />
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center px-8">
          <span className="text-3xl">🚚</span>
          <p className="text-sm text-gray-50">주문 정보를 찾을 수 없어요.</p>
        </div>
      </PageWrapper>
    );
  }

  const currentIndex = Math.max(0, STAGES.indexOf(order.status));

  return (
    <PageWrapper className="bg-surface-warm">
      <Header showBack title="배송조회" />

      <div className="px-4 py-5">
        <div className="rounded-2xl bg-white border border-[#ECEEE8] p-4">
          <p className="text-xs text-gray-50">주문번호 {order.id}</p>
          <p className="mt-1 text-[15px] font-extrabold text-gray-100">
            {order.items[0]?.name}
            {order.items.length > 1 && ` 외 ${order.items.length - 1}건`}
          </p>
        </div>

        <div className="mt-5 rounded-2xl bg-white border border-[#ECEEE8] p-5">
          {STAGES.map((stage, i) => {
            const done = i <= currentIndex;
            const isLast = i === STAGES.length - 1;
            return (
              <div key={stage} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                      done ? 'bg-primary text-white' : 'bg-gray-10 text-gray-50'
                    }`}
                  >
                    {done ? '✓' : i + 1}
                  </span>
                  {!isLast && <span className={`w-0.5 flex-1 ${i < currentIndex ? 'bg-primary' : 'bg-gray-10'}`} style={{ minHeight: 28 }} />}
                </div>
                <div className={`pb-7 ${isLast ? 'pb-0' : ''}`}>
                  <p className={`text-sm font-bold ${done ? 'text-gray-100' : 'text-gray-50'}`}>{stage}</p>
                  {i === currentIndex && <p className="mt-0.5 text-xs text-primary-dark font-semibold">현재 상태예요</p>}
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-4 text-center text-xs text-gray-50">
          실제 택배사 배송 조회 연동 전까지는 주문 상태를 기준으로 한 예상 진행 상황이에요.
        </p>
      </div>
    </PageWrapper>
  );
}
