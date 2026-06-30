import { PageWrapper } from '../../components/layout/PageWrapper';
import { BottomNav } from '../../components/layout/BottomNav';

const CATEGORIES = [
  { emoji: '💧', name: '스킨/토너' },
  { emoji: '✨', name: '에센스/세럼' },
  { emoji: '🧴', name: '크림/로션' },
  { emoji: '☀️', name: '선크림' },
  { emoji: '🫧', name: '클렌저' },
  { emoji: '💊', name: '앰플' },
  { emoji: '🌿', name: '마스크팩' },
  { emoji: '👁️', name: '아이크림' },
];

export default function CategoryPage() {
  return (
    <PageWrapper hasBottomNav>
      <header className="sticky top-0 z-10 flex items-center h-14 px-4 bg-white border-b border-gray-20">
        <h1 className="text-lg font-bold text-gray-100">카테고리</h1>
      </header>

      <div className="px-4 py-4 grid grid-cols-2 gap-3">
        {CATEGORIES.map(({ emoji, name }) => (
          <button
            key={name}
            className="flex items-center gap-3 px-4 py-4 rounded-xl bg-white border border-gray-20 active:scale-[.98] transition-transform text-left"
            style={{ boxShadow: 'var(--shadow-sm)' }}
          >
            <span className="text-2xl">{emoji}</span>
            <span className="text-sm font-semibold text-gray-100">{name}</span>
          </button>
        ))}
      </div>

      <BottomNav />
    </PageWrapper>
  );
}
