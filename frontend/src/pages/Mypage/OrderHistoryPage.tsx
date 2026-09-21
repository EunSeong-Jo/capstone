import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Icon } from '../../components/category/Icon';
import { useCart } from '../../context/CartContext';
import { useToast } from '../../components/ui/ToastContext';
import { ReviewWriteSheet, ReviewDraft } from '../../components/reviews/ReviewWriteSheet';
import { useOrders, OrderItem, STATUS_TYPES } from '../../hooks/useOrders';
import { useExperience } from '../../context/ExperienceContext';

const purchaseTypes = ['온라인몰 구매', '매장 구매'];

const toNumber = (price: string) => Number(price.replace(/,/g, '')) || 0;

const CANCEL_REASONS = ['단순 변심', '다른 상품 잘못 주문', '배송이 너무 늦어요', '더 저렴한 상품을 찾았어요', '기타'];

export default function OrderHistoryPage() {
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const { showToast } = useToast();
  const { addExp } = useExperience();
  const rawOrders = useOrders();

  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState(purchaseTypes[0]);
  const [selectedStatus, setSelectedStatus] = useState(STATUS_TYPES[0]);
  const [reviewTarget, setReviewTarget] = useState<OrderItem | null>(null);
  const [cancelledIds, setCancelledIds] = useState<Set<string>>(new Set());
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelDetail, setCancelDetail] = useState('');

  // 취소 요청한 주문은 화면상 상태를 '취소요청중'으로 덮어써서, 상태 필터·뱃지가 전부
  // 같은 값을 보게 한다 (실제 취소 처리 API는 없어 로컬 오버라이드로 흉내낸다).
  const orders = rawOrders.map((o) =>
    cancelledIds.has(o.id) ? { ...o, status: '취소요청중', statusBg: 'bg-[#FFF4E5]', statusColor: 'text-[#C77700]' } : o,
  );

  const filteredOrders = selectedStatus === '전체 상태' ? orders : orders.filter((o) => o.status === selectedStatus);

  const rebuy = (item: OrderItem) => {
    addToCart({ id: item.id, name: item.name, brand: item.option, price: toNumber(item.price), imageUrl: item.imageUrl });
    showToast('장바구니에 담았어요');
  };

  const submitReview = (draft: ReviewDraft) => {
    if (draft.rating) {
      showToast('후기가 등록되었어요 · +20 EXP');
      addExp(20);
    }
    setReviewTarget(null);
  };

  const submitCancel = () => {
    if (!cancelTarget || !cancelReason) return;
    setCancelledIds((prev) => new Set(prev).add(cancelTarget));
    showToast('구매 취소를 요청했어요');
    setCancelTarget(null);
    setCancelReason('');
    setCancelDetail('');
  };

  return (
    <PageWrapper>
      <Header showBack title="주문/배송 조회" />

      {/* 필터 드롭다운 2개 */}
      <div className="flex items-center border-b border-gray-20 bg-white">
        <div className="relative flex-1">
          <button
            onClick={() => { setPurchaseOpen((v) => !v); setStatusOpen(false); }}
            className="w-full flex items-center justify-between px-4 py-3"
          >
            <span className="text-sm font-medium text-gray-100">{selectedPurchase}</span>
            <Icon name="keyboard_arrow_down" size={16} className={`text-gray-70 transition-transform ${purchaseOpen ? 'rotate-180' : ''}`} />
          </button>
          {purchaseOpen && (
            <div className="absolute top-full left-0 w-full bg-white shadow-lg rounded-b-xl z-20 overflow-hidden">
              {purchaseTypes.map((opt) => (
                <button
                  key={opt}
                  onClick={() => { setSelectedPurchase(opt); setPurchaseOpen(false); }}
                  className={`w-full text-left px-4 py-3 text-sm border-b border-gray-10 ${opt === selectedPurchase ? 'font-bold text-primary' : 'text-gray-100'}`}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="w-px h-5 bg-gray-20" />
        <div className="relative flex-1">
          <button
            onClick={() => { setStatusOpen((v) => !v); setPurchaseOpen(false); }}
            className="w-full flex items-center justify-between px-4 py-3"
          >
            <span className="text-sm font-medium text-gray-100">{selectedStatus}</span>
            <Icon name="keyboard_arrow_down" size={16} className={`text-gray-70 transition-transform ${statusOpen ? 'rotate-180' : ''}`} />
          </button>
          {statusOpen && (
            <div className="absolute top-full right-0 w-full bg-white shadow-lg rounded-b-xl z-20 overflow-hidden">
              {STATUS_TYPES.map((opt) => (
                <button
                  key={opt}
                  onClick={() => { setSelectedStatus(opt); setStatusOpen(false); }}
                  className={`w-full text-left px-4 py-3 text-sm border-b border-gray-10 ${opt === selectedStatus ? 'font-bold text-primary' : 'text-gray-100'}`}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 주문 목록 */}
      <div className="flex-1 pb-8 bg-surface">
        {filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <span className="text-3xl">📦</span>
            <p className="text-sm text-gray-50">해당 상태의 주문이 없어요.</p>
          </div>
        ) : (
          filteredOrders.map((order) => (
            <div key={order.id} className="mb-2">
              <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-10">
                <span className="text-[15px] font-bold text-gray-100">{order.date}</span>
                <button
                  onClick={() => navigate(`/mypage/order-history/${encodeURIComponent(order.id)}`)}
                  className="flex items-center gap-0.5 text-[13px] text-gray-70"
                >
                  상세보기 <Icon name="arrow_forward_ios" size={12} />
                </button>
              </div>
              <div className="px-4 py-2.5 bg-white border-b border-gray-10">
                <span className={`inline-block px-3 py-1 rounded text-[13px] font-bold ${order.statusBg} ${order.statusColor}`}>
                  {order.status}
                </span>
              </div>
              {order.items.map((item, i) => (
                <div key={item.id} className={`bg-white ${i > 0 ? 'border-t border-gray-10' : ''}`}>
                  <div className="flex gap-3 p-4">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="w-20 h-20 rounded-[10px] object-cover border border-gray-10 shrink-0"
                      />
                    ) : (
                      <div className={`w-20 h-20 rounded-[10px] flex items-center justify-center text-4xl border border-gray-10 shrink-0 ${item.bg}`}>
                        {item.emoji}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-100 leading-snug mb-1">{item.name}</p>
                      <p className="text-xs text-gray-50 mb-0.5">{item.option}</p>
                      <p className="text-xs text-gray-50 mb-1.5">수량 : {item.qty}개</p>
                      <p className="text-base font-bold text-gray-100">{item.price}원</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 px-4 pb-3.5">
                    <button onClick={() => rebuy(item)} className="py-2 rounded-lg border border-gray-20 text-[13px] font-medium text-gray-100">
                      재구매
                    </button>
                    {order.status === '결제완료' ? (
                      <button
                        onClick={() => setCancelTarget(order.id)}
                        className="py-2 rounded-lg border border-gray-20 text-[13px] font-medium text-accent"
                      >
                        구매 취소
                      </button>
                    ) : order.status === '취소요청중' ? (
                      <button disabled className="py-2 rounded-lg border border-gray-10 text-[13px] font-medium text-gray-50">
                        취소 접수됨
                      </button>
                    ) : (
                      <button
                        onClick={() => setReviewTarget(item)}
                        className="py-2 rounded-lg border border-gray-20 text-[13px] font-medium text-gray-100"
                      >
                        리뷰 작성
                      </button>
                    )}
                    <button
                      onClick={() => navigate(`/mypage/order-history/${encodeURIComponent(order.id)}/tracking`)}
                      className="py-2 rounded-lg border border-gray-20 text-[13px] font-medium text-gray-100"
                    >
                      배송조회
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      <ReviewWriteSheet
        open={reviewTarget != null}
        onClose={() => setReviewTarget(null)}
        onSubmit={submitReview}
        productLabel={reviewTarget ? reviewTarget.name : undefined}
      />

      {/* 구매 취소 사유 팝업 */}
      {cancelTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-6"
          onClick={() => setCancelTarget(null)}
        >
          <div className="w-full max-w-[340px] rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-[15px] font-bold text-gray-100">구매를 취소하시겠어요?</p>
            <p className="mt-1 text-xs text-gray-50">취소 사유를 알려주시면 빠르게 처리해 드릴게요.</p>

            <div className="mt-3.5 flex flex-col gap-1.5">
              {CANCEL_REASONS.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setCancelReason(reason)}
                  className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-left text-sm transition-colors ${
                    cancelReason === reason ? 'border-primary bg-primary-light font-semibold text-primary-dark' : 'border-gray-20 text-gray-100'
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                      cancelReason === reason ? 'border-primary bg-primary' : 'border-gray-20'
                    }`}
                  >
                    {cancelReason === reason && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </span>
                  {reason}
                </button>
              ))}
            </div>

            {cancelReason === '기타' && (
              <textarea
                value={cancelDetail}
                onChange={(e) => setCancelDetail(e.target.value)}
                placeholder="취소 사유를 자세히 적어주세요."
                className="mt-3 h-20 w-full resize-none rounded-lg border border-gray-20 p-3 text-sm text-gray-100 outline-none focus:border-primary"
              />
            )}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="flex-1 h-11 rounded-xl border border-gray-20 text-sm font-bold text-gray-70 active:scale-[.98] transition-transform"
              >
                돌아가기
              </button>
              <button
                type="button"
                disabled={!cancelReason || (cancelReason === '기타' && !cancelDetail.trim())}
                onClick={submitCancel}
                className="flex-1 h-11 rounded-xl bg-[#FF5C7A] text-sm font-bold text-white active:scale-[.98] transition-transform disabled:opacity-40"
              >
                취소 신청
              </button>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
