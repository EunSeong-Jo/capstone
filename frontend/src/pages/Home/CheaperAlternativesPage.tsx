import { useNavigate } from 'react-router-dom';
import { AlternativeCardV } from '../../components/alternatives/AlternativeCardV';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { useAuth } from '../../context/auth';
import { useCloset } from '../../context/closet';
import { useDiagnosis } from '../../context/diagnosis';
import { useSwapSuggestion } from '../../hooks/useSwapSuggestion';
import { SkinType, SKIN_TYPE_META } from '../../types';

/**
 * 홈 "💰 더 저렴한 대체품" 더보기 — 전체 목록.
 *
 * 왜 이 화면이 필요한가
 * ---------------------
 * 홈 캐러셀은 화장대 여러 항목의 후보를 **섞어서** 보여주는데, 더보기는
 * `/alternatives?seed=<첫 항목>`으로 보내고 있었다. 즉 캐러셀에서 본 카드가
 * 더보기 목록에는 없을 수 있었다. 같은 `useSwapSuggestion`을 써서 캐러셀과
 * 정확히 같은 목록을 그린다.
 *
 * 홈이 이미 같은 조회를 했더라도 추가 요청이 생기지는 않는다 — 훅 안의
 * 조회는 화장대 항목 id로 키가 잡혀 있고, 브라우저가 같은 GET을 캐시한다.
 */
const DEFAULT_SKIN: SkinType = 'ondalsam';

export default function CheaperAlternativesPage() {
  const navigate = useNavigate();
  const { user: persona } = useAuth();
  const { skinType: diagType } = useDiagnosis();
  const { items: closetItems } = useCloset();
  const skinType: SkinType = diagType ?? persona?.skinType ?? DEFAULT_SKIN;

  const { candidates, outcome, loading, error, reload } = useSwapSuggestion(
    closetItems,
    skinType,
  );

  const totalSaving = candidates.reduce((sum, c) => sum + -(c.alt.priceDelta ?? 0), 0);

  return (
    <PageWrapper hasBottomNav className="bg-surface-warm">
      <Header showBack title="더 저렴한 대체품" />

      {candidates.length > 0 && (
        <p className="px-4 pt-4 text-[13px] text-gray-70">
          {SKIN_TYPE_META[skinType].label} 기준으로 {candidates.length}건을 찾았어요.
          전부 바꾸면 <span className="font-bold text-primary-dark">
            {totalSaving.toLocaleString()}원
          </span>{' '}
          아껴요.
        </p>
      )}

      {loading ? (
        <div className="grid animate-pulse grid-cols-2 gap-x-3 gap-y-5 p-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-56 rounded-2xl bg-white" />
          ))}
        </div>
      ) : error ? (
        <div className="px-8 py-20 text-center">
          <p className="text-sm text-gray-70">{error}</p>
          <button
            onClick={reload}
            className="mt-4 rounded-xl border border-gray-20 px-5 py-2.5 text-sm font-medium active:scale-95"
          >
            다시 시도
          </button>
        </div>
      ) : closetItems.length === 0 ? (
        <div className="px-8 py-20 text-center">
          <span className="text-4xl">🧴</span>
          <p className="mt-3 text-base font-semibold text-gray-100">화장대가 비어 있어요</p>
          <p className="mt-1 text-sm text-gray-50">쓰는 제품을 등록하면 더 싼 대체품을 찾아드려요</p>
          <button
            onClick={() => navigate('/closet')}
            className="mt-4 rounded-xl border border-gray-20 px-5 py-2.5 text-sm font-medium active:scale-95"
          >
            화장대로
          </button>
        </div>
      ) : candidates.length === 0 ? (
        <div className="px-8 py-20 text-center">
          <span className="text-4xl">👍</span>
          <p className="mt-3 text-base font-semibold text-gray-100">
            {outcome === 'stale'
              ? '화장대 제품을 카탈로그에서 찾지 못했어요'
              : '지금 쓰는 제품보다 나은 대체품을 못 찾았어요'}
          </p>
          <p className="mt-1 text-sm text-gray-50">
            {outcome === 'stale'
              ? '제품을 다시 등록하면 비교해 드릴게요'
              : '잘 고르셨네요.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-5 p-4">
          {candidates.map((c) => (
            <AlternativeCardV key={`${c.seed.id}-${c.alt.id}`} alt={c.alt} width="w-full" />
          ))}
        </div>
      )}
    </PageWrapper>
  );
}
