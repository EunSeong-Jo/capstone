import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/ToastContext';
import { useCart } from '../../context/CartContext';
import { ReviewWriteSheet, ReviewDraft } from '../../components/reviews/ReviewWriteSheet';
import { getSentGifts } from '../../data/giftStorage';
import { useExperience } from '../../context/ExperienceContext';

type GiftTab = '받은 선물' | '보낸 선물';

interface GiftItem {
  id: number;
  productId: number;
  person: string;
  product: string;
  brand: string;
  date: string;
  status: string;
  statusClass: string;
  bg: string;
  emoji: string;
  price: string;
}

const receivedGifts: GiftItem[] = [
  { id: 1, productId: 96, person: '김지은', product: '이니스프리 수분 밸런싱 토너 200ml', brand: '이니스프리', date: '2026.06.10', status: '수락완료', statusClass: 'text-primary', bg: 'bg-primary-light', emoji: '🧴', price: '28,000원' },
  { id: 2, productId: 217, person: '박서연', product: '닥터자르트 세라마이드 수분 크림 60ml', brand: '닥터자르트', date: '2026.05.22', status: '수락완료', statusClass: 'text-primary', bg: 'bg-rose-100', emoji: '🫙', price: '42,000원' },
];

const initialSentGifts: GiftItem[] = [
  { id: 1, productId: 662, person: '이수현', product: '코스알엑스 히알루론산 에센스 50ml', brand: '코스알엑스', date: '2026.06.15', status: '수락대기', statusClass: 'text-orange-500', bg: 'bg-sky-100', emoji: '💧', price: '18,000원' },
  { id: 2, productId: 669, person: '최민지', product: '마녀공장 순식물성 클렌징 오일 200ml', brand: '마녀공장', date: '2026.05.30', status: '수락완료', statusClass: 'text-primary', bg: 'bg-yellow-50', emoji: '🫧', price: '22,000원' },
];

const toNumber = (price: string) => Number(price.replace(/[^0-9]/g, '')) || 0;

function GuideModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-6" onClick={onClose}>
      <div className="w-full max-w-[330px] rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <p className="text-[15px] font-extrabold text-gray-100">🎁 선물하기 가이드</p>
        <ol className="mt-3 space-y-2.5 text-[13px] leading-relaxed text-gray-70">
          <li>1. 선물하고 싶은 제품 상세 화면에서 공유 버튼을 눌러요.</li>
          <li>2. "선물하기"를 선택하고 받는 분의 연락처를 입력해요.</li>
          <li>3. 결제를 완료하면 받는 분에게 선물 메시지가 전달돼요.</li>
          <li>4. 받는 분이 수락하면 선물함의 "받은 선물"에서 확인할 수 있어요.</li>
        </ol>
        <button
          onClick={onClose}
          className="mt-5 flex h-11 w-full items-center justify-center rounded-xl bg-primary-dark text-sm font-bold text-white"
        >
          확인했어요
        </button>
      </div>
    </div>
  );
}

export default function GiftBoxPage() {
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const { showToast } = useToast();
  const { addExp } = useExperience();
  const [tab, setTab] = useState<GiftTab>('받은 선물');
  const [sentGifts, setSentGifts] = useState<GiftItem[]>(() => [...getSentGifts(), ...initialSentGifts]);
  const [cancelTarget, setCancelTarget] = useState<GiftItem | null>(null);
  const [reviewTarget, setReviewTarget] = useState<GiftItem | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  const items = tab === '받은 선물' ? receivedGifts : sentGifts;
  const isEmpty = items.length === 0;

  const rebuy = (item: GiftItem) => {
    addToCart({ id: item.productId, name: item.product, brand: item.brand, price: toNumber(item.price) });
    showToast('장바구니에 담았어요');
  };

  const confirmCancelGift = () => {
    if (!cancelTarget) return;
    setSentGifts((prev) => prev.filter((g) => g.id !== cancelTarget.id));
    showToast('선물을 취소했어요');
    setCancelTarget(null);
  };

  const submitReview = (draft: ReviewDraft) => {
    if (draft.rating) {
      showToast('후기가 등록되었어요 · +20 EXP');
      addExp(20);
    }
    setReviewTarget(null);
  };

  return (
    <PageWrapper>
      <Header showBack title="선물함" />

      <div className="flex border-b border-gray-20">
        {(['받은 선물', '보낸 선물'] as GiftTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3.5 text-[15px] font-bold border-b-2 ${
              tab === t ? 'text-gray-100 border-gray-100' : 'text-gray-50 border-transparent'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 flex flex-col">
        {isEmpty ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 px-8 py-16 text-center">
            <span className="text-5xl mb-1">🎁</span>
            <p className="text-lg font-bold text-gray-100">
              {tab === '받은 선물' ? '받은 선물이 없습니다' : '보낸 선물이 없습니다'}
            </p>
            <p className="text-[13px] text-gray-50 leading-relaxed mb-2">
              {tab === '받은 선물' ? '선물을 수락하시면 선물함에서 내역을 확인하실 수 있어요' : '소중한 분께 화장품 선물을 보내보세요'}
            </p>
            <button
              onClick={() => navigate('/home')}
              className="flex items-center gap-1.5 px-7 py-3 rounded-[10px] border-[1.5px] border-primary text-primary text-sm font-bold"
            >
              🎁 선물하러 가기
            </button>
          </div>
        ) : (
          <div className="flex-1">
            {items.map((item) => (
              <div key={item.id} className="border-b border-gray-10">
                <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-50">{item.date}</span>
                    <span className="text-[11px] text-gray-20">·</span>
                    <span className="text-xs text-gray-70">
                      {tab === '받은 선물' ? `${item.person}님` : `→ ${item.person}님`}
                    </span>
                  </div>
                  <span className={`text-xs font-bold ${item.statusClass}`}>{item.status}</span>
                </div>
                <button
                  onClick={() => navigate(`/detail/${item.productId}`)}
                  className="flex w-full gap-3 px-4 pb-3 text-left"
                >
                  <div className={`w-[72px] h-[72px] rounded-xl flex items-center justify-center text-3xl shrink-0 ${item.bg}`}>
                    {item.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-50 mb-0.5">{item.brand}</p>
                    <p className="text-[13px] font-semibold text-gray-100 leading-snug mb-1.5">{item.product}</p>
                    <p className="text-sm font-bold text-gray-100">{item.price}</p>
                  </div>
                </button>
                <div className={`px-4 pb-4 grid gap-2 ${tab === '받은 선물' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {tab === '받은 선물' && item.status === '수락완료' && (
                    <>
                      <button
                        onClick={() => setReviewTarget(item)}
                        className="py-2.5 rounded-lg border border-gray-20 text-[13px] font-semibold text-gray-100"
                      >
                        후기 작성
                      </button>
                      <button onClick={() => rebuy(item)} className="py-2.5 rounded-lg bg-primary text-[13px] font-semibold text-white">
                        재구매
                      </button>
                    </>
                  )}
                  {tab === '보낸 선물' && item.status === '수락대기' && (
                    <button
                      onClick={() => setCancelTarget(item)}
                      className="py-2.5 rounded-lg border-[1.5px] border-primary text-[13px] font-semibold text-primary"
                    >
                      선물 취소
                    </button>
                  )}
                  {tab === '보낸 선물' && item.status === '수락완료' && (
                    <button
                      onClick={() => navigate(`/detail/${item.productId}`)}
                      className="py-2.5 rounded-lg border border-gray-20 text-[13px] font-semibold text-gray-100"
                    >
                      다시 선물하기
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="px-4 py-5 mt-auto">
          <button
            onClick={() => setGuideOpen(true)}
            className="w-full flex items-center justify-between p-4 rounded-2xl bg-primary-light border border-primary/20"
          >
            <span className="text-left">
              <span className="block text-xs text-gray-50 mb-1">swappy 선물하기 어렵지 않아요!</span>
              <span className="block text-[15px] font-extrabold text-gray-100">선물하기 가이드 바로가기</span>
            </span>
            <span className="flex -space-x-2 ml-2">
              {['💄', '🧴', '🫙', '🌸'].map((e) => (
                <span key={e} className="w-9 h-9 rounded-full bg-white border-2 border-white shadow-sm flex items-center justify-center text-base">
                  {e}
                </span>
              ))}
            </span>
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={cancelTarget != null}
        title="정말 선물을 취소하시겠습니까?"
        description="한번 취소하면 다시 새로 선물을 보내야 해요."
        danger
        onConfirm={confirmCancelGift}
        onCancel={() => setCancelTarget(null)}
      />
      <ReviewWriteSheet
        open={reviewTarget != null}
        onClose={() => setReviewTarget(null)}
        onSubmit={submitReview}
        productLabel={reviewTarget ? reviewTarget.product : undefined}
      />
      {guideOpen && <GuideModal onClose={() => setGuideOpen(false)} />}
    </PageWrapper>
  );
}
