import { useState } from 'react';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Icon } from '../../components/category/Icon';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/ToastContext';

type FilterType = '전체' | '취소' | '반품' | '교환';
const filterTabs: FilterType[] = ['전체', '취소', '반품', '교환'];

interface CancelReturnItem {
  id: number;
  date: string;
  type: FilterType;
  status: string;
  statusColor: string;
  brand: string;
  name: string;
  option: string;
  price: string;
  bg: string;
  canWithdraw: boolean;
  reason: string;
}

const initialItems: CancelReturnItem[] = [
  { id: 1, date: '2026.06.10', type: '취소', status: '취소완료', statusColor: 'text-gray-50', brand: '이니스프리', name: '수분 밸런싱 토너 200ml', option: '1개', price: '28,000원', bg: 'bg-primary-light', canWithdraw: false, reason: '단순 변심' },
  { id: 2, date: '2026.06.05', type: '반품', status: '반품신청', statusColor: 'text-orange-600', brand: '닥터자르트', name: '세라마이드 수분 크림 60ml', option: '1개', price: '42,000원', bg: 'bg-rose-100', canWithdraw: true, reason: '색상 및 제품 이미지 상이' },
  { id: 3, date: '2026.05.28', type: '교환', status: '교환완료', statusColor: 'text-primary', brand: '코스알엑스', name: '히알루론산 에센스 50ml', option: '1개', price: '18,000원', bg: 'bg-sky-100', canWithdraw: false, reason: '단순 변심' },
];

export default function CancelReturnPage() {
  const { showToast } = useToast();
  const [activeFilter, setActiveFilter] = useState<FilterType>('전체');
  const [items, setItems] = useState<CancelReturnItem[]>(initialItems);
  const [detailItem, setDetailItem] = useState<CancelReturnItem | null>(null);
  const [withdrawTarget, setWithdrawTarget] = useState<CancelReturnItem | null>(null);

  const filtered = activeFilter === '전체' ? items : items.filter((i) => i.type === activeFilter);

  const confirmWithdraw = () => {
    if (!withdrawTarget) return;
    setItems((prev) =>
      prev.map((i) => (i.id === withdrawTarget.id ? { ...i, status: `${i.type} 철회완료`, statusColor: 'text-gray-50', canWithdraw: false } : i)),
    );
    showToast(`${withdrawTarget.type} 신청을 철회했어요`);
    setWithdrawTarget(null);
  };

  return (
    <PageWrapper>
      <Header showBack title="취소/반품/교환 내역" />

      <div className="bg-white border-b border-gray-20">
        <div className="px-4 py-3">
          <span className="text-[15px] font-semibold text-gray-100">전체 기간</span>
        </div>
        <div className="flex px-4 gap-1">
          {filterTabs.map((tab) => {
            const active = activeFilter === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveFilter(tab)}
                className={`px-4 py-2 text-sm border-b-2 ${
                  active ? 'font-bold text-primary border-primary' : 'text-gray-50 border-transparent'
                }`}
              >
                {tab}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 pb-8 bg-surface">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-16 h-16 rounded-full border-2 border-gray-20 flex items-center justify-center text-2xl text-gray-20">!</div>
            <p className="text-sm text-gray-50 text-center">기간 내 취소/반품/교환 내역이 없습니다.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-4">
            {filtered.map((item) => (
              <div key={item.id} className="bg-white rounded-2xl overflow-hidden shadow-sm">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-10">
                  <span className="text-[13px] text-gray-50">{item.date}</span>
                  <span className={`text-[13px] font-bold ${item.statusColor}`}>{item.status}</span>
                </div>
                <div className="flex gap-3 px-4 py-3.5">
                  <div className={`w-[72px] h-[72px] rounded-xl flex items-center justify-center text-3xl shrink-0 ${item.bg}`}>🧴</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-50 mb-0.5">{item.brand}</p>
                    <p className="text-sm font-semibold text-gray-100 leading-snug line-clamp-2">{item.name}</p>
                    <p className="text-xs text-gray-50 mt-0.5">{item.option}</p>
                    <p className="text-[15px] font-bold text-gray-100 mt-1">{item.price}</p>
                  </div>
                </div>
                <div className="flex gap-2 px-4 pb-3.5 pt-2.5 border-t border-gray-10">
                  {item.canWithdraw && (
                    <button
                      onClick={() => setWithdrawTarget(item)}
                      className="flex-1 py-2 rounded-lg border-[1.5px] border-primary text-[13px] font-semibold text-primary"
                    >
                      {item.type} 철회
                    </button>
                  )}
                  <button
                    onClick={() => setDetailItem(item)}
                    className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1 text-[13px] font-semibold ${
                      item.canWithdraw ? 'bg-primary text-white' : 'bg-gray-10 text-gray-70'
                    }`}
                  >
                    상세보기 <Icon name="arrow_forward_ios" size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mx-4 mb-4 p-4 rounded-2xl bg-gray-10">
          {[
            '취소/반품/교환 내역은 최근 1년 이내의 내역만 조회할 수 있습니다.',
            '단종 상품 환불의 경우 swappy 고객센터로 문의해 주세요.',
          ].map((text) => (
            <div key={text} className="flex gap-2 mb-1.5 last:mb-0">
              <span className="text-xs text-gray-50 shrink-0">·</span>
              <span className="text-xs text-gray-50 leading-relaxed">{text}</span>
            </div>
          ))}
        </div>
      </div>

      {detailItem && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45" onClick={() => setDetailItem(null)}>
          <div className="w-full max-w-[430px] rounded-t-3xl bg-white px-5 pt-4 pb-8" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-gray-20" />
            <p className="text-[15px] font-extrabold text-gray-100">{detailItem.type} 상세</p>
            <div className="mt-3 rounded-xl bg-gray-5 p-3.5">
              <p className="text-xs text-gray-50">{detailItem.brand}</p>
              <p className="mt-0.5 text-sm font-semibold text-gray-100">{detailItem.name}</p>
              <p className="mt-0.5 text-xs text-gray-50">{detailItem.option} · {detailItem.price}</p>
            </div>
            <div className="mt-3 space-y-2 text-[13px] text-gray-70">
              <div className="flex justify-between"><span>신청일</span><span className="font-semibold text-gray-100">{detailItem.date}</span></div>
              <div className="flex justify-between"><span>처리상태</span><span className={`font-semibold ${detailItem.statusColor}`}>{detailItem.status}</span></div>
              <div className="flex justify-between"><span>사유</span><span className="font-semibold text-gray-100">{detailItem.reason}</span></div>
            </div>
            <button
              onClick={() => setDetailItem(null)}
              className="mt-5 flex h-11 w-full items-center justify-center rounded-xl bg-gray-100 text-sm font-bold text-white"
            >
              확인
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={withdrawTarget != null}
        title={`정말 ${withdrawTarget?.type ?? ''} 철회하시겠습니까?`}
        description="철회하면 다시 신청해야 해요."
        onConfirm={confirmWithdraw}
        onCancel={() => setWithdrawTarget(null)}
      />
    </PageWrapper>
  );
}
