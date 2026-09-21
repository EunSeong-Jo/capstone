import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { useCart, Order } from '../../context/CartContext';
import { useExperience } from '../../context/ExperienceContext';

type PayMethod = 'kakao' | 'card' | 'naver' | 'transfer';

const PAY_METHODS: { key: PayMethod; label: string; emoji: string }[] = [
  { key: 'kakao', label: '카카오페이', emoji: '💛' },
  { key: 'card', label: '신용·체크카드', emoji: '💳' },
  { key: 'naver', label: '네이버페이', emoji: '💚' },
  { key: 'transfer', label: '무통장입금', emoji: '🏦' },
];

/**
 * 장바구니 → 결제수단 선택 → 구매.
 *
 * 실제 PG 연동은 범위 밖이라 결제수단 화면은 선택 UI만 갖추고, '결제하기'는
 * CartContext.checkout()으로 주문내역에 옮기는 것으로 완료를 흉내낸다.
 * 완료 후 주문은 마이페이지 주문내역에서 보인다.
 */
export default function CartPage() {
  const navigate = useNavigate();
  const { lines, subtotal, count, setQty, removeLine, checkout } = useCart();
  const { addExp } = useExperience();
  const [step, setStep] = useState<'cart' | 'payment'>('cart');
  const [payMethod, setPayMethod] = useState<PayMethod>('kakao');
  const [placed, setPlaced] = useState<Order | null>(null);

  const shipping = subtotal > 0 && subtotal < 30000 ? 3000 : 0;
  const payLabel = PAY_METHODS.find((m) => m.key === payMethod)?.label ?? '';

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
            {payLabel}로 {placed.total.toLocaleString()}원 결제했어요
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

  if (step === 'payment') {
    return (
      <PageWrapper>
        <header className="sticky top-0 z-10 flex items-center h-14 px-4 bg-white border-b border-gray-20">
          <button
            onClick={() => setStep('cart')}
            className="mr-2 p-1 -ml-1 text-gray-100 active:scale-95 transition-transform"
            aria-label="뒤로가기"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h1 className="flex-1 text-lg font-semibold text-gray-100 truncate">결제하기</h1>
        </header>

        <div className="flex-1 bg-surface px-4 pt-4 pb-40">
          <div className="rounded-2xl bg-white p-4 text-[13px]">
            <p className="mb-2 text-sm font-bold text-gray-100">주문 상품 {count}개</p>
            {lines.map((l) => (
              <p key={l.id} className="truncate text-xs text-gray-70">
                {l.name} {l.qty > 1 ? `외 ${l.qty - 1}개` : ''}
              </p>
            ))}
            <div className="mt-3 flex justify-between border-t border-gray-10 pt-2 text-[15px] font-extrabold text-gray-100">
              <span>결제 예정금액</span>
              <span>{(subtotal + shipping).toLocaleString()}원</span>
            </div>
          </div>

          <p className="mb-2.5 mt-5 text-sm font-bold text-gray-100">결제 수단</p>
          <div className="flex flex-col gap-2">
            {PAY_METHODS.map((m) => {
              const on = m.key === payMethod;
              return (
                <button
                  key={m.key}
                  onClick={() => setPayMethod(m.key)}
                  className={`flex items-center gap-3 rounded-xl border-[1.5px] px-4 py-3.5 text-left transition-colors ${
                    on ? 'border-primary bg-primary-light' : 'border-gray-20 bg-white'
                  }`}
                >
                  <span className="text-xl">{m.emoji}</span>
                  <span className={`flex-1 text-sm ${on ? 'font-bold text-primary-dark' : 'font-medium text-gray-100'}`}>
                    {m.label}
                  </span>
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                      on ? 'border-primary bg-primary' : 'border-gray-20'
                    }`}
                  >
                    {on && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                        <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          {payMethod === 'card' && (
            <div className="mt-3 rounded-xl border border-gray-20 bg-white p-3.5">
              <p className="mb-2 text-xs font-semibold text-gray-50">카드번호</p>
              <input
                placeholder="0000 - 0000 - 0000 - 0000"
                className="h-11 w-full rounded-lg border border-gray-20 px-3 text-sm text-gray-100 outline-none focus:border-primary"
              />
            </div>
          )}

          {payMethod === 'transfer' && (
            <div className="mt-3 rounded-xl bg-gray-5 p-3.5 text-xs leading-relaxed text-gray-70">
              입금 계좌: 카카오뱅크 333-****-****-31 (예금주: swappy)
              <br />
              주문 후 24시간 내 미입금 시 자동 취소돼요.
            </div>
          )}
        </div>

        <div
          className="fixed bottom-0 left-1/2 z-30 w-full max-w-[430px] -translate-x-1/2 border-t border-gray-20 bg-white px-4 pt-3"
          style={{ paddingBottom: 'calc(12px + var(--safe-bottom))' }}
        >
          <button
            onClick={() => {
              const order = checkout();
              if (order) {
                setPlaced(order);
                addExp(50);
              }
            }}
            className="h-[50px] w-full rounded-xl text-[15px] font-bold text-white active:scale-[.98] transition-transform"
            style={{ background: '#00916D' }}
          >
            {(subtotal + shipping).toLocaleString()}원 {payLabel}로 결제하기
          </button>
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
              onClick={() => setStep('payment')}
              className="h-[50px] w-full rounded-xl text-[15px] font-bold text-white active:scale-[.98] transition-transform"
              style={{ background: '#00916D' }}
            >
              {(subtotal + shipping).toLocaleString()}원 구매하기
            </button>
          </div>
        </>
      )}
    </PageWrapper>
  );
}
