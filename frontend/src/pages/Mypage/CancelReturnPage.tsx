import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { useOrders } from '../../hooks/useOrders';
import { STAGE_BADGE, STAGE_LABEL, fmtDateTime, isClosed } from '../../utils/orderStage';

/**
 * 취소/반품/환불 내역.
 *
 * 따로 저장하지 않고 주문 목록에서 취소·반품된 것만 고른다 — 주문내역과
 * 같은 기록이라 두 화면이 어긋날 일이 없다. 실제 결제가 없어 환불은
 * 금액을 적어 두는 기록이고, 주문 적립 포인트는 서버가 회수한다.
 */
export default function CancelReturnPage() {
  const navigate = useNavigate();
  const { orders, loading } = useOrders();

  const closed = useMemo(
    () =>
      orders
        .filter((o) => isClosed(o.status))
        .sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? '')),
    [orders],
  );

  return (
    <PageWrapper className="bg-surface-warm">
      <Header showBack title="취소/반품/환불 내역" />

      {loading ? (
        <div className="animate-pulse space-y-2 p-4">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-white" />
          ))}
        </div>
      ) : closed.length === 0 ? (
        <div className="px-8 py-20 text-center">
          <span className="text-5xl">↩️</span>
          <p className="mt-3 text-base font-semibold text-gray-100">취소·반품한 주문이 없어요</p>
          <p className="mt-1 text-sm text-gray-50">
            결제완료 단계에서는 취소, 배송완료 뒤에는 반품을 신청할 수 있어요
          </p>
          <button
            onClick={() => navigate('/mypage/order-history')}
            className="mt-4 rounded-xl border border-gray-20 px-5 py-2.5 text-sm font-medium active:scale-95"
          >
            주문내역 보기
          </button>
        </div>
      ) : (
        <div className="space-y-2 p-4">
          {closed.map((o) => (
            <div key={o.id} className="rounded-2xl border border-[#ECEEE8] bg-white p-4">
              <div className="flex items-center justify-between">
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${STAGE_BADGE[o.stage]}`}>
                  {STAGE_LABEL[o.stage]}
                </span>
                {o.closedAt && <span className="text-[11px] text-gray-50">{fmtDateTime(o.closedAt)}</span>}
              </div>

              <div className="mt-2.5 space-y-1">
                {o.items.map((item) => (
                  <p key={item.id} className="text-sm leading-snug text-gray-100">
                    {item.productName}
                    <span className="text-xs text-gray-50"> · {item.qty}개</span>
                  </p>
                ))}
              </div>

              <div className="mt-3 space-y-1 border-t border-gray-10 pt-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-50">환불 금액</span>
                  <span className="font-bold text-gray-100">{o.total.toLocaleString()}원 · 환불완료</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-50">사유</span>
                  <span className="text-gray-100">{o.closeReason ?? '선택 안 함'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-50">주문일시</span>
                  <span className="text-gray-100">{fmtDateTime(o.placedAt)}</span>
                </div>
              </div>
            </div>
          ))}
          <p className="pt-1 text-center text-[11px] leading-relaxed text-gray-50">
            실제 결제는 연결 전이라 환불은 기록으로 남겨요. 주문 적립 포인트는 회수됐어요.
          </p>
        </div>
      )}
    </PageWrapper>
  );
}
