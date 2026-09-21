import { PageWrapper } from '../../components/layout/PageWrapper';
import { Header } from '../../components/layout/Header';
import { AlternativeCardV } from '../../components/alternatives/AlternativeCardV';
import { MOCK_CHEAPER_ALTERNATIVES } from '../../mocks/alternatives';

/** 홈 "더 저렴한 대체품" 더보기 — 전체 목록 */
export default function CheaperAlternativesPage() {
  return (
    <PageWrapper hasBottomNav className="bg-surface-warm">
      <Header showBack title="더 저렴한 대체품" />
      <div className="grid grid-cols-2 gap-x-3 gap-y-5 p-4">
        {MOCK_CHEAPER_ALTERNATIVES.map((a) => (
          <AlternativeCardV key={a.id} alt={a} width="w-full" />
        ))}
      </div>
    </PageWrapper>
  );
}
