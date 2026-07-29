import { useState } from 'react';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { SupportContactBar } from '../../components/mypage/SupportContactBar';

type GiftTab = '받은 선물' | '보낸 선물';

const receivedGifts = [
  { id: 1, person: '김지은', product: '이니스프리 수분 밸런싱 토너 200ml', brand: '이니스프리', date: '2026.06.10', status: '수락완료', statusClass: 'text-primary', bg: 'bg-primary-light', emoji: '🧴', price: '28,000원' },
  { id: 2, person: '박서연', product: '닥터자르트 세라마이드 수분 크림 60ml', brand: '닥터자르트', date: '2026.05.22', status: '수락완료', statusClass: 'text-primary', bg: 'bg-rose-100', emoji: '🫙', price: '42,000원' },
];

const sentGifts = [
  { id: 1, person: '이수현', product: '코스알엑스 히알루론산 에센스 50ml', brand: '코스알엑스', date: '2026.06.15', status: '수락대기', statusClass: 'text-orange-500', bg: 'bg-sky-100', emoji: '💧', price: '18,000원' },
  { id: 2, person: '최민지', product: '마녀공장 순식물성 클렌징 오일 200ml', brand: '마녀공장', date: '2026.05.30', status: '수락완료', statusClass: 'text-primary', bg: 'bg-yellow-50', emoji: '🫧', price: '22,000원' },
];

export default function GiftBoxPage() {
  const [tab, setTab] = useState<GiftTab>('받은 선물');
  const items = tab === '받은 선물' ? receivedGifts : sentGifts;
  const isEmpty = items.length === 0;

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
            <button className="flex items-center gap-1.5 px-7 py-3 rounded-[10px] border-[1.5px] border-primary text-primary text-sm font-bold">
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
                <div className="flex gap-3 px-4 pb-3">
                  <div className={`w-[72px] h-[72px] rounded-xl flex items-center justify-center text-3xl shrink-0 ${item.bg}`}>
                    {item.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-50 mb-0.5">{item.brand}</p>
                    <p className="text-[13px] font-semibold text-gray-100 leading-snug mb-1.5">{item.product}</p>
                    <p className="text-sm font-bold text-gray-100">{item.price}</p>
                  </div>
                </div>
                <div className={`px-4 pb-4 grid gap-2 ${tab === '받은 선물' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {tab === '받은 선물' && item.status === '수락완료' && (
                    <>
                      <button className="py-2.5 rounded-lg border border-gray-20 text-[13px] font-semibold text-gray-100">후기 작성</button>
                      <button className="py-2.5 rounded-lg bg-primary text-[13px] font-semibold text-white">재구매</button>
                    </>
                  )}
                  {tab === '보낸 선물' && item.status === '수락대기' && (
                    <button className="py-2.5 rounded-lg border-[1.5px] border-primary text-[13px] font-semibold text-primary">선물 취소</button>
                  )}
                  {tab === '보낸 선물' && item.status === '수락완료' && (
                    <button className="py-2.5 rounded-lg border border-gray-20 text-[13px] font-semibold text-gray-100">다시 선물하기</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="px-4 py-5 mt-auto">
          <button className="w-full flex items-center justify-between p-4 rounded-2xl bg-primary-light border border-primary/20">
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

      <SupportContactBar />
    </PageWrapper>
  );
}
