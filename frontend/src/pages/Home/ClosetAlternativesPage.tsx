import { PageWrapper } from '../../components/layout/PageWrapper';
import { Header } from '../../components/layout/Header';
import { AlternativeCardV } from '../../components/alternatives/AlternativeCardV';
import { MOCK_ALTERNATIVES_FOR_REGISTRY } from '../../mocks/alternatives';

/** 홈 "내 화장대와 비슷한 추천" 더보기 — 전체 목록 */
export default function ClosetAlternativesPage() {
  return (
    <PageWrapper hasBottomNav className="bg-surface-warm">
      <Header showBack title="내 화장대와 비슷한 추천" />
      <div className="grid grid-cols-2 gap-x-3 gap-y-5 p-4">
        {MOCK_ALTERNATIVES_FOR_REGISTRY.map((a) => (
          <AlternativeCardV key={a.id} alt={a} width="w-full" />
        ))}
      </div>
    </PageWrapper>
  );
}
