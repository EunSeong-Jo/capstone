import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { OrderItemDto, writeReview } from '../../api/personal';
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

  const submitReview = async (draft: ReviewDraft) => {
    if (target === null) return;
    setSaving(true);
    try {
      await writeReview(target.id, draft.rating, draft.body);
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
                <span className="text-[15px] font-bold text-gray-100">
                  {fmtDate(order.placedAt)}
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
                      onClick={() =>
                        item.productId !== null &&
                        addToCart(
                          {
                            id: item.productId,
                            name: item.productName,
                            brand: item.brandName ?? '',
                            price: item.unitPrice,
                          },
                          item.qty,
                        )
                      }
                      className="rounded-lg border border-gray-20 py-2 text-[13px] font-medium text-gray-100 disabled:opacity-40"
                    >
                      재구매
                    </button>
                    <button
                      disabled={item.reviewed || item.productId === null}
                      onClick={() => setTarget(item)}
                      className="rounded-lg border border-gray-20 py-2 text-[13px] font-medium text-gray-100 disabled:opacity-40"
                    >
                      {item.reviewed ? '후기 작성됨' : '후기 작성'}
                    </button>
                  </div>
                </div>
              ))}
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
    </PageWrapper>
  );
}
