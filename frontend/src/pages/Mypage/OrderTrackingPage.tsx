import { useNavigate, useParams } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { useOrders } from '../../hooks/useOrders';

/**
 * 배송조회.
 *
 * **서버가 아는 것은 '결제완료'까지다.** `orders.status`는 주문을 만들 때
 * `placed`로 박히고 그 뒤로 바뀌지 않는다 — 배송사도 송장도 붙인 적이 없다.
 * 그래서 이 화면은 이후 단계를 '완료'로 그리지 않고 예정으로만 보여주고,
 * 그렇다는 것을 화면에도 적는다. 실제 배송 연동이 붙으면 STAGE_BY_STATUS에
 * 상태를 더하면 된다.
 */
const STAGES = ['주문접수', '결제완료', '배송준비중', '배송중', '배송완료'];

/** 서버 status → STAGES의 인덱스. 지금 서버가 내는 값은 'placed' 하나뿐이다. */
const STAGE_BY_STATUS: Record<string, number> = { placed: 1 };

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

  const currentIndex = STAGE_BY_STATUS[order.status] ?? 0;

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
                  {!isLast && (
                    <span
                      className={`w-0.5 flex-1 ${i < currentIndex ? 'bg-primary' : 'bg-gray-10'}`}
                      style={{ minHeight: 28 }}
                    />
                  )}
                </div>
                <div className={isLast ? 'pb-0' : 'pb-7'}>
                  <p className={`text-sm font-bold ${done ? 'text-gray-100' : 'text-gray-50'}`}>
                    {stage}
                  </p>
                  {i === currentIndex && (
                    <p className="mt-0.5 text-xs font-semibold text-primary-dark">현재 상태예요</p>
                  )}
                  {i > currentIndex && <p className="mt-0.5 text-xs text-gray-50">예정</p>}
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-4 text-center text-xs leading-relaxed text-gray-50">
          지금 기록되는 주문 상태는 결제완료까지예요.
          <br />
          택배사 배송 조회는 아직 연동 전이라 이후 단계는 표시만 해 둔 거예요.
        </p>
      </div>
    </PageWrapper>
  );
}
