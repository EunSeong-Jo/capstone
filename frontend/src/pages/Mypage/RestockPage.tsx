import { useState } from 'react';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';

interface RestockItem {
  id: number;
  brand: string;
  name: string;
  option: string;
  price: string;
  bg: string;
  emoji: string;
  date: string;
  status: '신청중' | '재입고됨';
}

const initialItems: RestockItem[] = [
  { id: 1, brand: '이니스프리', name: '블랙티 유스 앰플 30ml', option: '기본', price: '52,000원', bg: 'bg-primary-light', emoji: '🧴', date: '2026.06.20 신청', status: '신청중' },
  { id: 2, brand: '헤라', name: '블랙쿠션 파운데이션 15g', option: '23 베이지', price: '65,000원', bg: 'bg-amber-50', emoji: '💄', date: '2026.06.15 신청', status: '재입고됨' },
  { id: 3, brand: '설화수', name: '윤조에센스 6세대 75ml', option: '기본', price: '120,000원', bg: 'bg-rose-50', emoji: '🌸', date: '2026.06.10 신청', status: '신청중' },
];

export default function RestockPage() {
  const [items, setItems] = useState<RestockItem[]>(initialItems);

  const cancel = (id: number) => setItems((prev) => prev.filter((i) => i.id !== id));

  return (
    <PageWrapper>
      <Header showBack title="재입고 알림 신청 내역" />

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 py-24 px-8 text-center">
          <span className="text-5xl">🔔</span>
          <p className="text-[15px] text-gray-50">재입고 알림을 신청한 상품이 없어요.</p>
        </div>
      ) : (
        <div>
          <div className="px-4 pt-3.5 pb-1">
            <span className="text-[13px] font-semibold text-gray-50">총 {items.length}건</span>
          </div>
          {items.map((item) => (
            <div key={item.id} className="border-b border-gray-10 px-4 py-3.5">
              <div className="flex gap-3">
                <div className={`relative w-20 h-20 rounded-xl shrink-0 flex items-center justify-center text-4xl border border-gray-10 ${item.bg}`}>
                  {item.emoji}
                  {item.status === '재입고됨' && (
                    <div className="absolute -top-1.5 -left-1.5 bg-primary rounded-full px-1.5 py-0.5 flex items-center gap-0.5">
                      <span className="text-[9px]">🔔</span>
                      <span className="text-[9px] font-bold text-white">재입고</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-50 mb-0.5">{item.brand}</p>
                      <p className="text-[13px] font-semibold text-gray-100 leading-snug mb-1">{item.name}</p>
                      <p className="text-xs text-gray-50 mb-1">옵션 : {item.option}</p>
                      <p className="text-sm font-bold text-gray-100">{item.price}</p>
                    </div>
                    <button onClick={() => cancel(item.id)} className="p-1 ml-2 shrink-0 text-gray-20">
                      ✕
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between mt-3">
                <span className="text-[11px] text-gray-50">{item.date}</span>
                {item.status === '재입고됨' ? (
                  <button className="px-[18px] py-2 rounded-lg bg-primary text-[13px] font-bold text-white">바로 구매</button>
                ) : (
                  <span className="text-xs font-semibold text-gray-50 flex items-center gap-1">🔔 알림 신청중</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageWrapper>
  );
}
