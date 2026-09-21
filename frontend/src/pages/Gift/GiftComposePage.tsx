import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { useProduct } from '../../hooks/useProduct';
import { useToast } from '../../components/ui/ToastContext';
import { addSentGift } from '../../data/giftStorage';

const CARD_BG = ['bg-primary-light', 'bg-rose-100', 'bg-sky-100', 'bg-yellow-50', 'bg-violet-50'];

/** 선물하기 — 받는 분 정보를 입력하고 보낸다(결제 연동 없이 데모로 완결) */
export default function GiftComposePage() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { product, loading } = useProduct(Number(productId));
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');

  const valid = name.trim().length > 0 && phone.trim().length >= 9;

  const today = () =>
    new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\.$/, '');

  const send = () => {
    if (product) {
      addSentGift({
        productId: product.id,
        person: name.trim(),
        product: product.name,
        brand: product.brand,
        date: today(),
        bg: CARD_BG[product.id % CARD_BG.length],
        emoji: '🎁',
        price: `${product.price.toLocaleString()}원`,
      });
    }
    showToast('선물을 보냈어요! 선물함 > 보낸 선물에서 확인할 수 있어요');
    navigate(-1);
  };

  return (
    <PageWrapper className="bg-surface-warm">
      <Header showBack title="선물하기" />

      {!loading && product && (
        <div className="flex gap-3 border-b border-oy-line px-4 py-4">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.name} className="h-16 w-16 shrink-0 rounded-xl object-cover" />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-oy-chip text-2xl">🧴</div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs text-oy-sub">{product.brand}</p>
            <p className="truncate text-sm font-semibold text-oy-text">{product.name}</p>
            <p className="mt-0.5 text-sm font-bold text-oy-text">{product.price.toLocaleString()}원</p>
          </div>
        </div>
      )}

      <div className="flex-1 px-4 py-5">
        <label className="mb-1.5 block text-[13px] font-bold text-oy-text">받는 분 이름</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="이름을 입력해 주세요"
          className="mb-4 h-12 w-full rounded-xl border border-oy-line bg-white px-3.5 text-sm text-oy-text outline-none focus:border-primary"
        />
        <label className="mb-1.5 block text-[13px] font-bold text-oy-text">받는 분 연락처</label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="010-0000-0000"
          className="mb-4 h-12 w-full rounded-xl border border-oy-line bg-white px-3.5 text-sm text-oy-text outline-none focus:border-primary"
        />
        <label className="mb-1.5 block text-[13px] font-bold text-oy-text">선물 메시지 (선택)</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="따뜻한 메시지를 남겨보세요"
          className="h-24 w-full resize-none rounded-xl border border-oy-line bg-white p-3.5 text-sm text-oy-text outline-none focus:border-primary"
        />
      </div>

      <div className="px-4 pb-[calc(16px+var(--safe-bottom))]">
        <button
          type="button"
          disabled={!valid}
          onClick={send}
          className="flex h-[52px] w-full items-center justify-center rounded-full bg-primary text-[15px] font-bold text-white transition-transform active:scale-[.98] disabled:opacity-40"
        >
          선물 보내기
        </button>
      </div>
    </PageWrapper>
  );
}
