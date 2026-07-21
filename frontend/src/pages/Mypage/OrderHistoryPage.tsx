import { useState } from 'react';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Icon } from '../../components/category/Icon';

const orders = [
  {
    id: 'ORD-2026041101',
    date: '2026.04.11',
    status: '배송완료',
    statusBg: 'bg-gray-100',
    statusColor: 'text-white',
    items: [
      { id: 1, name: '수분 밸런싱 토너 200ml', option: '옵션 : 기본 200ml', qty: 1, price: '28,000', bg: 'bg-primary-light', emoji: '🧴' },
      { id: 2, name: '히알루론산 에센스 50ml', option: '옵션 : 기본 50ml', qty: 1, price: '18,000', bg: 'bg-sky-100', emoji: '💧' },
    ],
  },
  {
    id: 'ORD-2026060501',
    date: '2026.06.05',
    status: '배송중',
    statusBg: 'bg-primary',
    statusColor: 'text-white',
    items: [
      { id: 3, name: '세라마이드 수분 크림 60ml', option: '옵션 : 본품 60ml', qty: 1, price: '42,000', bg: 'bg-rose-100', emoji: '🫙' },
    ],
  },
  {
    id: 'ORD-2026061801',
    date: '2026.06.18',
    status: '결제완료',
    statusBg: 'bg-amber-100',
    statusColor: 'text-amber-800',
    items: [
      { id: 4, name: '나이아신아마이드 세럼 30ml', option: '옵션 : 기본 30ml', qty: 2, price: '34,000', bg: 'bg-yellow-50', emoji: '✨' },
      { id: 5, name: '순한 거품 클렌저 150ml', option: '옵션 : 기본 150ml', qty: 1, price: '15,000', bg: 'bg-violet-50', emoji: '🫧' },
    ],
  },
];

const purchaseTypes = ['온라인몰 구매', '매장 구매'];
const statusTypes = ['전체 상태', '주문접수', '결제완료', '배송준비중', '배송중', '배송완료'];

export default function OrderHistoryPage() {
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState(purchaseTypes[0]);
  const [selectedStatus, setSelectedStatus] = useState(statusTypes[0]);

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
              {statusTypes.map((opt) => (
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
        {orders.map((order) => (
          <div key={order.id} className="mb-2">
            <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-10">
              <span className="text-[15px] font-bold text-gray-100">{order.date}</span>
              <button className="flex items-center gap-0.5 text-[13px] text-gray-70">
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
                  <div className={`w-20 h-20 rounded-[10px] flex items-center justify-center text-4xl border border-gray-10 shrink-0 ${item.bg}`}>
                    {item.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-100 leading-snug mb-1">{item.name}</p>
                    <p className="text-xs text-gray-50 mb-0.5">{item.option}</p>
                    <p className="text-xs text-gray-50 mb-1.5">수량 : {item.qty}개</p>
                    <p className="text-base font-bold text-gray-100">{item.price}원</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1.5 px-4 pb-3.5">
                  {['재구매', '리뷰 작성', '배송조회'].map((btn) => (
                    <button key={btn} className="py-2 rounded-lg border border-gray-20 text-[13px] font-medium text-gray-100">
                      {btn}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </PageWrapper>
  );
}
