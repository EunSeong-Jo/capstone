import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';

const recentHistory = [
  { id: 1, icon: '🛍', dark: true, title: '세라마이드 크림 외 2개', sub: '사용 · 06.05 14:22', amount: -68400 },
  { id: 2, icon: '🏦', dark: false, title: '카카오뱅크 (*239)', sub: '충전 · 06.01 10:00', amount: 80000 },
  { id: 3, icon: '🛍', dark: true, title: '이니스프리 토너 200ml', sub: '사용 · 05.28 19:30', amount: -28000 },
  { id: 4, icon: '🏦', dark: false, title: '토스뱅크 (*614)', sub: '충전 · 05.20 09:15', amount: 50000 },
];

export default function MoneyPage() {
  return (
    <PageWrapper>
      <Header showBack title="Swappy머니" />

      <div className="flex-1">
        <div className="px-5 pt-5">
          <div className="flex items-center gap-1.5 mb-3">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-sm font-extrabold text-white">
              S
            </div>
            <span className="text-[13px] text-gray-70">
              <strong className="text-primary">Swappy머니</strong> 결제할 땐 자동 충전! 인출도 자유롭게!
            </span>
          </div>

          <p className="text-[32px] font-extrabold text-gray-100 mb-3">3,450원</p>
          <div className="flex justify-between mb-1.5">
            <span className="text-[13px] text-gray-50">충전 금액</span>
            <span className="text-[13px] font-medium text-gray-100">3,450원</span>
          </div>
          <div className="flex items-center justify-between mb-5">
            <span className="text-[13px] text-gray-50">포인트 (인출 제한)</span>
            <span className="text-[13px] font-medium text-gray-100">0원</span>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-5">
            <button className="py-3.5 rounded-[10px] border-[1.5px] border-gray-100 text-sm font-bold text-gray-100">
              머니 인출
            </button>
            <button className="py-3.5 rounded-[10px] bg-gray-100 text-sm font-bold text-white">
              계좌 충전
            </button>
          </div>
        </div>

        <div className="h-px bg-gray-10" />

        <div className="px-5 pt-5">
          <p className="text-base font-bold text-gray-100 mb-4">최근 이용 내역</p>
          {recentHistory.map((item, i) => (
            <div
              key={item.id}
              className={`flex items-center gap-3 pb-[18px] ${i < recentHistory.length - 1 ? 'mb-[18px] border-b border-gray-10' : ''}`}
            >
              <div
                className={`w-[42px] h-[42px] rounded-full flex items-center justify-center text-xl shrink-0 ${
                  item.dark ? 'bg-gray-100' : 'bg-sky-50'
                }`}
              >
                {item.icon}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-100 mb-0.5">{item.title}</p>
                <p className="text-xs text-gray-50">{item.sub}</p>
              </div>
              <span className={`text-sm font-bold shrink-0 ${item.amount > 0 ? 'text-sky-600' : 'text-gray-100'}`}>
                {item.amount > 0 ? `+${item.amount.toLocaleString()}원` : `-${Math.abs(item.amount).toLocaleString()}원`}
              </span>
            </div>
          ))}
        </div>
      </div>
    </PageWrapper>
  );
}
