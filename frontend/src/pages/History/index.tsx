import { PageWrapper } from '../../components/layout/PageWrapper';
import { BottomNav } from '../../components/layout/BottomNav';

export default function HistoryPage() {
  return (
    <PageWrapper hasBottomNav>
      <header className="sticky top-0 z-10 flex items-center h-14 px-4 bg-white border-b border-gray-20">
        <h1 className="text-lg font-bold text-gray-100">최근 본 제품</h1>
      </header>

      <div className="flex flex-col items-center justify-center flex-1 gap-4 py-20 text-center">
        <span className="text-5xl">🕐</span>
        <p className="text-base font-semibold text-gray-100">아직 본 제품이 없어요</p>
        <p className="text-sm text-gray-50">제품을 둘러보면 여기에 기록돼요</p>
      </div>

      <BottomNav />
    </PageWrapper>
  );
}
