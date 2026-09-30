import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { OrderDto, OrderItemDto, cancelOrder, returnOrder, writeReview } from '../../api/personal';
import { ApiError } from '../../api/client';
import { OrderCloseSheet } from '../../components/orders/OrderCloseSheet';
import { STAGE_BADGE, STAGE_LABEL, isClosed } from '../../utils/orderStage';
import { ReviewDraft, ReviewWriteSheet } from '../../components/reviews/ReviewWriteSheet';
import { useCart } from '../../context/cart';
import { useToast } from '../../context/toast';
import { useOrders } from '../../hooks/useOrders';

/**
 * 주문내역.
 *
 * 예전에는 `seedOrders` 3건이 하드코딩돼 있었고 실제 주문 뒤에 항상 붙었다.
 * 지금은 `GET /api/v1/me/orders`가 전부다 — 주문한 적이 없으면 빈 화면이
 * 맞다.
 *
 * 목록 조회는 `useOrders`가 한다 — 주문상세·배송조회와 같은 데이터를 본다.
 * 게스트 차단은 라우트의 `RequireAuth`가 맡으므로 여기서 다시 보지 않는다.
 *
 * '후기 작성'은 예전에 별점 4점을 고정으로 보냈다(입력 화면이 없었다).
 * 지금은 `ReviewWriteSheet`에서 사용자가 직접 고른다.
 */

const fmtDate = (iso: string) =>
  new Date(iso)
    .toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
    .replace(/\.$/, '');

export default function OrderHistoryPage() {
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const { orders, loading, reload } = useOrders();
  const { showToast } = useToast();
  /** 후기를 쓰는 중인 품목. null이면 시트가 닫혀 있다. */
  const [target, setTarget] = useState<OrderItemDto | null>(null);
  const [saving, setSaving] = useState(false);
  /**
   * 재구매 — 그때 산 수량만큼 장바구니에 다시 담는다. 가격은 장바구니가
   * 지금 가격으로 다시 계산한다(주문의 unitPrice는 그 시점 기록일 뿐이다).
   * 예전에는 담기기만 하고 아무 표시가 없어서 눌렀는지 알 수 없었다.
   */
  const reorder = (item: OrderItemDto) => {
    if (item.productId === null) return;
    addToCart(
      {
        id: item.productId,
        name: item.productName,
        brand: item.brandName ?? '',
        price: item.unitPrice,
      },
      item.qty,
    );
    showToast(`장바구니에 ${item.qty}개 담았어요`, {
      label: '장바구니로 이동',
      onClick: () => navigate('/cart'),
    });
  };

  /** 취소·반품 신청 중인 주문 */
  const [closing, setClosing] = useState<{ order: OrderDto; kind: 'cancel' | 'return' } | null>(null);

  const submitClose = async (reason: string | undefined) => {
    if (closing === null) return;
    setSaving(true);
    try {
      await (closing.kind === 'cancel' ? cancelOrder : returnOrder)(closing.order.id, reason);
      showToast(closing.kind === 'cancel' ? '주문을 취소했어요' : '반품을 신청했어요', {
        label: '취소/반품 내역',
        onClick: () => navigate('/mypage/cancel-return'),
      });
      setClosing(null);
      reload();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '처리하지 못했어요');
      // 단계가 넘어가 버튼이 사라져야 하는 경우라 목록을 새로 받는다.
      setClosing(null);
      reload();
    } finally {
      setSaving(false);
    }
  };

  const submitReview = async (draft: ReviewDraft) => {
    if (target === null) return;
    setSaving(true);
    try {
      await writeReview(target.id, draft.rating, draft.body, draft.photos);
      setTarget(null);
      showToast('후기를 등록했어요');
      reload();
    } catch {
      showToast('후기를 저장하지 못했어요');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageWrapper>
      <Header showBack title="주문/배송 조회" />

      <div className="flex-1 bg-surface pb-8">
        {loading ? (
          <div className="animate-pulse space-y-2 p-4">
            {Array.from({ length: 2 }, (_, i) => (
              <div key={i} className="h-28 rounded-xl bg-white" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="px-4 py-20 text-center">
            <span className="text-5xl">🧾</span>
            <p className="mt-3 text-base font-semibold text-gray-100">주문내역이 없어요</p>
            <p className="mt-1 text-sm text-gray-50">장바구니에서 주문하면 여기에 쌓여요</p>
            <button
              onClick={() => navigate('/cart')}
              className="mt-4 rounded-xl border border-gray-20 px-5 py-2.5 text-sm font-medium active:scale-95"
            >
              장바구니 보기
            </button>
          </div>
        ) : (
          orders.map((order) => (
            <div key={order.id} className="mb-2">
              <button
                type="button"
                onClick={() => navigate(`/mypage/order-history/${order.id}`)}
                className="flex w-full items-center justify-between border-b border-gray-10 bg-white px-4 py-3 text-left active:bg-gray-5"
              >
                <span className="flex items-center gap-2">
                  <span className="text-[15px] font-bold text-gray-100">{fmtDate(order.placedAt)}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${STAGE_BADGE[order.stage] ?? STAGE_BADGE.paid}`}>
                    {STAGE_LABEL[order.stage] ?? order.stage}
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="text-[13px] font-bold text-gray-100">
                    {order.total.toLocaleString()}원
                  </span>
                  <span className="text-[13px] text-gray-50">›</span>
                </span>
              </button>

              {order.items.map((item, i) => (
                <div
                  key={item.id}
                  className={`bg-white ${i > 0 ? 'border-t border-gray-10' : ''}`}
                >
                  <div className="p-4">
                    <p className="text-sm font-semibold leading-snug text-gray-100">
                      {item.productName}
                    </p>
                    {item.brandName && (
                      <p className="mt-0.5 text-xs text-gray-50">{item.brandName}</p>
                    )}
                    <p className="mt-1 text-xs text-gray-50">수량 : {item.qty}개</p>
                    <p className="mt-1.5 text-base font-bold text-gray-100">
                      {(item.unitPrice * item.qty).toLocaleString()}원
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 px-4 pb-3.5">
                    <button
                      disabled={item.productId === null}
                      onClick={() => reorder(item)}
                      className="rounded-lg border border-gray-20 py-2 text-[13px] font-medium text-gray-100 active:scale-[.98] disabled:opacity-40"
                    >
                      재구매
                    </button>
                    <button
                      disabled={item.reviewed || item.productId === null || isClosed(order.status)}
                      onClick={() => setTarget(item)}
                      className="rounded-lg border border-gray-20 py-2 text-[13px] font-medium text-gray-100 disabled:opacity-40"
                    >
                      {item.reviewed ? '후기 작성됨' : '후기 작성'}
                    </button>
                  </div>
                </div>
              ))}

              {/* 주문 단위 동작: 배송조회 · 취소(결제완료) · 반품(배송완료) */}
              <div className="flex gap-1.5 border-t border-gray-10 bg-white px-4 py-3">
                {!isClosed(order.status) && (
                  <button
                    onClick={() => navigate(`/mypage/order-history/${order.id}/tracking`)}
                    className="flex-1 rounded-lg border border-gray-20 py-2 text-[13px] font-medium text-gray-100"
                  >
                    배송조회
                  </button>
                )}
                {order.canCancel && (
                  <button
                    onClick={() => setClosing({ order, kind: 'cancel' })}
                    className="flex-1 rounded-lg border border-[#F8174A]/40 py-2 text-[13px] font-bold text-[#F8174A]"
                  >
                    주문 취소
                  </button>
                )}
                {order.canReturn && (
                  <button
                    onClick={() => setClosing({ order, kind: 'return' })}
                    className="flex-1 rounded-lg border border-[#F8174A]/40 py-2 text-[13px] font-bold text-[#F8174A]"
                  >
                    반품 신청
                  </button>
                )}
                {isClosed(order.status) && (
                  <button
                    onClick={() => navigate('/mypage/cancel-return')}
                    className="flex-1 rounded-lg border border-gray-20 py-2 text-[13px] font-medium text-gray-70"
                  >
                    {order.status === 'cancelled' ? '취소' : '반품'} 내역 보기
                  </button>
                )}
              </div>
              {!isClosed(order.status) && !order.canCancel && !order.canReturn && (
                <p className="bg-white px-4 pb-3 text-[11px] text-gray-50">
                  배송이 시작돼 취소할 수 없어요. 배송완료 후 반품을 신청할 수 있어요.
                </p>
              )}
            </div>
          ))
        )}
      </div>

      {/* key로 다시 마운트시켜 별점·본문을 초기화한다 — 시트가 effect로
          자기 상태를 되돌리지 않아도 된다. */}
      {target && (
        <ReviewWriteSheet
          key={target.id}
          productLabel={
            target.brandName ? `${target.brandName} · ${target.productName}` : target.productName
          }
          saving={saving}
          onClose={() => setTarget(null)}
          onSubmit={submitReview}
        />
      )}

      {closing && (
        <OrderCloseSheet
          key={closing.order.id + closing.kind}
          kind={closing.kind}
          orderLabel={
            closing.order.items[0]?.productName +
            (closing.order.items.length > 1 ? ` 외 ${closing.order.items.length - 1}건` : '')
          }
          total={closing.order.total}
          saving={saving}
          onClose={() => setClosing(null)}
          onSubmit={submitClose}
        />
      )}
    </PageWrapper>
  );
}
