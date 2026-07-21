import { useState } from 'react';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';

type HistoryTab = '전체' | '적립' | '사용' | '예정';
const TABS: HistoryTab[] = ['전체', '적립', '사용', '예정'];

const historyData = [
  { id: 1, title: '유효기간 만료', sub: '소멸 · 2026.06.19', amount: -1000, type: '사용' as HistoryTab },
  { id: 2, title: '유효기간 만료', sub: '소멸 · 2026.06.14', amount: -500, type: '사용' as HistoryTab },
  { id: 3, title: '도착지연으로 인한 적립금 보상', sub2: '수분 밸런싱 토너 200ml', sub: '적립 · 2026.05.20 (2026.06.18 소멸 예정)', amount: 1000, type: '적립' as HistoryTab },
  { id: 4, title: '도착지연으로 인한 적립금 보상', sub2: '히알루론산 에센스 50ml', sub: '적립 · 2026.05.20 (2026.06.18 소멸 예정)', amount: 1000, type: '적립' as HistoryTab },
  { id: 5, title: '주문 적립', sub2: '세라마이드 수분 크림 60ml', sub: '적립 · 2026.05.28 (2031.05.27 소멸 예정)', amount: 290, type: '적립' as HistoryTab },
  { id: 6, title: '주문 적립', sub2: '나이아신아마이드 세럼 30ml', sub: '적립 · 2026.05.30 (2031.05.29 소멸 예정)', amount: 240, type: '적립' as HistoryTab },
  { id: 7, title: '리뷰 작성 적립', sub2: '닥터자르트 세라마이드 크림', sub: '적립 · 2026.04.10 (2031.04.09 소멸 예정)', amount: 500, type: '적립' as HistoryTab },
  { id: 8, title: '주문 결제 사용', sub2: '이니스프리 토너 주문', sub: '사용 · 2026.03.22', amount: -2000, type: '사용' as HistoryTab },
  { id: 9, title: '신규 가입 적립', sub: '적립 · 2026.01.01 (2031.12.31 소멸 예정)', amount: 2000, type: '적립' as HistoryTab },
  { id: 10, title: '재진단 완료 적립', sub: '예정 · 지급 예정일 2026.07.01', amount: 300, type: '예정' as HistoryTab },
];

export default function PointsPage() {
  const [tab, setTab] = useState<HistoryTab>('전체');
  const filtered = tab === '전체' ? historyData : historyData.filter((h) => h.type === tab);

  return (
    <PageWrapper>
      <Header showBack title="적립금" />

      <div className="flex-1">
        <div className="px-5 pt-6 pb-5">
          <p className="text-[13px] text-gray-70 mb-2">현재 적립금</p>
          <p className="text-[32px] font-extrabold text-gray-100 mb-4">2,885원</p>
          <div className="flex justify-between mb-1.5">
            <span className="text-[13px] text-gray-50">예정 적립금</span>
            <span className="text-[13px] text-gray-50">0원</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[13px] text-gray-50">소멸 예정 적립금(30일 이내)</span>
            <span className="text-[13px] text-gray-50">0원</span>
          </div>
        </div>

        <div className="h-px bg-gray-10" />

        <div className="flex border-b border-gray-20">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-3.5 text-sm font-bold ${t === tab ? 'text-gray-100 border-b-2 border-gray-100' : 'text-gray-50'}`}
            >
              {t}
            </button>
          ))}
        </div>

        <div>
          {filtered.map((item) => (
            <div key={item.id} className="flex items-start justify-between px-5 py-[18px] border-b border-gray-10 last:border-0">
              <div className="flex-1 pr-3">
                <p className="text-sm font-semibold text-gray-100 mb-0.5">{item.title}</p>
                {item.sub2 && <p className="text-xs text-gray-50 mb-0.5">{item.sub2}</p>}
                <p className="text-xs text-gray-50">{item.sub}</p>
              </div>
              <span className={`text-sm font-bold shrink-0 ${item.amount > 0 ? 'text-sky-600' : 'text-gray-50'}`}>
                {item.amount > 0 ? `+${item.amount.toLocaleString()}원` : `${item.amount.toLocaleString()}원`}
              </span>
            </div>
          ))}
        </div>
      </div>
    </PageWrapper>
  );
}
