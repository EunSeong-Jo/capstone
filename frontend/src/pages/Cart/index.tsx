import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { useAuth } from '../../context/auth';
import { useCart, Order } from '../../context/cart';

/**
 * 장바구니 → 구매.
 *
 * 결제 PG 연동은 범위 밖이라 '구매하기'는 CartContext.checkout()으로 주문내역에
 * 옮기는 것으로 완료를 흉내낸다. 완료 후 주문은 마이페이지 주문내역에서 보인다.
 */
export default function CartPage() {
  const navigate = useNavigate();
  const { lines, subtotal, count, setQty, removeLine, checkout } = useCart();
  const { isUser } = useAuth();
  const [placed, setPlaced] = useState<Order | null>(null);
  // 서버 왕복이 생겼다. 중복 제출을 막고 실패를 화면에 드러낸다.
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shipping = subtotal > 0 && subtotal < 30000 ? 3000 : 0;

  if (placed) {
    return (
      <PageWrapper>
        <Header showBack title="주문 완료" />
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-light text-3xl">
            ✅
          </div>
          <h2 className="text-[17px] font-extrabold text-gray-100">주문이 완료됐어요</h2>
          <p className="mt-1 text-[13px] text-gray-50">주문번호 {placed.id}</p>
          <p className="mt-3 text-[14px] font-bold text-gray-100">
            결제금액 {placed.total.toLocaleString()}원
          </p>
          <div className="mt-8 flex w-full max-w-[280px] flex-col gap-2">
            <button
              onClick={() => navigate('/mypage/order-history')}
              className="h-[48px] rounded-xl text-[14px] font-bold text-white active:scale-[.98] transition-transform"
              style={{ background: '#00916D' }}
            >
              주문내역 보기
            </button>
            <button
              onClick={() => navigate('/home')}
              className="h-[48px] rounded-xl border border-gray-20 text-[14px] font-bold text-gray-70 active:scale-[.98] transition-transform"
            >
              쇼핑 계속하기
            </button>
          </div>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <Header showBack title={`장바구니 ${count > 0 ? `(${count})` : ''}`} />

      {lines.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <p className="text-[14px] font-bold text-gray-70">장바구니가 비어 있어요</p>
          <p className="mt-1 text-[12px] text-gray-50">추천 세트나 대체품에서 담아보세요</p>
          <button
            onClick={() => navigate('/home')}
            className="mt-5 h-[44px] rounded-xl px-5 text-[13px] font-bold text-white active:scale-95 transition-transform"
            style={{ background: '#00916D' }}
          >
            추천 보러 가기
          </button>
        </div>
      ) : (
        <>
          <div className="flex-1 bg-surface px-4 pt-3 pb-40">
            {lines.map((l) => (
              <div key={l.id} className="mb-2 rounded-2xl bg-white p-3">
                <div className="flex gap-3">
                  <button
                    onClick={() => navigate(`/detail/${l.id}`)}
                    className="h-[68px] w-[68px] shrink-0 overflow-hidden rounded-xl bg-gray-10"
                  >
                    <img src={l.imageUrl} alt="" className="h-full w-full object-cover" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold text-gray-50">{l.brand}</p>
                    <p className="truncate text-[13px] font-semibold text-gray-100">{l.name}</p>
                    <p className="mt-1 text-[13px] font-extrabold text-gray-100">
                      {(l.price * l.qty).toLocaleString()}원
                    </p>
                  </div>
                  <button
                    onClick={() => removeLine(l.id)}
                    aria-label="삭제"
                    className="shrink-0 self-start p-1 text-gray-50 active:scale-90"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M6 6l12 12M18 6L6 18" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    onClick={() => setQty(l.id, l.qty - 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-20 text-gray-70 active:scale-90"
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-[13px] font-bold text-gray-100">{l.qty}</span>
                  <button
                    onClick={() => setQty(l.id, l.qty + 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-20 text-gray-70 active:scale-90"
                  >
                    +
                  </button>
                </div>
              </div>
            ))}

            <div className="mt-3 rounded-2xl bg-white p-4 text-[13px]">
              <div className="flex justify-between py-1 text-gray-70">
                <span>상품금액</span>
                <span>{subtotal.toLocaleString()}원</span>
              </div>
              <div className="flex justify-between py-1 text-gray-70">
                <span>배송비</span>
                <span>{shipping === 0 ? '무료' : `${shipping.toLocaleString()}원`}</span>
              </div>
              <div className="mt-2 flex justify-between border-t border-gray-10 pt-2 text-[15px] font-extrabold text-gray-100">
                <span>결제 예정금액</span>
                <span>{(subtotal + shipping).toLocaleString()}원</span>
              </div>
            </div>
          </div>

          <div
            className="fixed bottom-0 left-1/2 z-30 w-full max-w-[430px] -translate-x-1/2 border-t border-gray-20 bg-white px-4 pt-3"
            style={{ paddingBottom: 'calc(12px + var(--safe-bottom))' }}
          >
            <button
              disabled={buying}
              onClick={async () => {
                if (buying) return;
                setBuying(true);
                setError(null);
                const order = await checkout();
                setBuying(false);
                if (order) setPlaced(order);
                else if (!isUser) setError('주문하려면 로그인이 필요해요.');
                else setError('주문에 실패했어요. 잠시 후 다시 시도해 주세요.');
              }}
              className="h-[50px] w-full rounded-xl text-[15px] font-bold text-white active:scale-[.98] transition-transform disabled:opacity-60"
              style={{ background: '#00916D' }}
            >
              {buying ? '주문 중…' : `${(subtotal + shipping).toLocaleString()}원 구매하기`}
            </button>
            {error && (
              <p className="mt-2 text-center text-[12px] text-accent">{error}</p>
            )}
          </div>
        </>
      )}
    </PageWrapper>
  );
}
