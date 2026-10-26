import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlternativeCardV } from '../../components/alternatives/AlternativeCardV';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { useCloset } from '../../context/closet';
import { useSkinType } from '../../hooks/useSkinType';
import { FIT_GAIN_MIN, totalSavingOf, useSwapSuggestion } from '../../hooks/useSwapSuggestion';
import { SKIN_TYPE_META } from '../../types';

/**
 * 홈 교체 제안의 더보기 — "더 저렴한 대체품"과 "더 좋은 대체품" 전체 목록.
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
export default function CheaperAlternativesPage() {
  const navigate = useNavigate();
  const { items: closetItems } = useCloset();
  const { skinType } = useSkinType();

  // ?seed=<화장대 제품 id> — 홈 카드에 나온 '쓰던 제품' 하나의 대체품만 본다. 없으면 화장대 전체.
  const [params] = useSearchParams();
  const seedParam = Number(params.get('seed'));
  const seedId = Number.isInteger(seedParam) && seedParam > 0 ? seedParam : null;

  const swap = useSwapSuggestion(
    closetItems,
    // 타입을 모르면 기피 성분 필터 없이 찾는다 — 8종 중 하나를 찍어 넣는 것보다 낫다.
    skinType ?? undefined,
  );
  const { outcome, loading, error, reload } = swap;
  const only = (list: typeof swap.candidates) => (seedId === null ? list : list.filter((c) => c.seed.id === seedId));
  const candidates = only(swap.candidates);
  // 더 저렴한 구역에 이미 나온 제품은 '더 좋은' 구역에서 뺀다(한 화면에 같은 카드가 두 번 서지 않게).
  const cheaperIds = new Set(candidates.map((c) => c.alt.id));
  const betterCandidates = only(swap.betterCandidates).filter((c) => !cheaperIds.has(c.alt.id));
  const refillCandidates = only(swap.refillCandidates);
  const seedName = seedId === null ? null : swap.candidates.concat(swap.betterCandidates, swap.refillCandidates).find((c) => c.seed.id === seedId)?.seed.name ?? null;

  const totalSaving = totalSavingOf(candidates);

  return (
    <PageWrapper hasBottomNav className="bg-surface-warm">
      <Header showBack title="더 나은 대체품" />
      {seedName && (
        <p className="px-4 pt-3 text-[13px] text-gray-70">
          <span className="font-bold text-gray-100">{seedName}</span> 기준 대체품이에요.
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
      ) : candidates.length === 0 && betterCandidates.length === 0 && refillCandidates.length === 0 ? (
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
        <>
          {candidates.length > 0 && (
            <section>
              <h2 className="px-4 pt-5 text-[15px] font-extrabold text-gray-100">더 저렴한 대체품</h2>
              <p className="px-4 pt-1 text-[13px] text-gray-70">
                {skinType !== null ? `${SKIN_TYPE_META[skinType].label} 기준으로 ` : ''}
                {candidates.length}건을 찾았어요. 바꾸면 최대{' '}
                <span className="font-bold text-primary-dark">{totalSaving.toLocaleString()}원</span> 아껴요.
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-5 p-4">
                {candidates.map((c) => (
                  <AlternativeCardV key={`${c.seed.id}-${c.alt.id}`} alt={c.alt} width="w-full" />
                ))}
              </div>
            </section>
          )}
          {betterCandidates.length > 0 && (
            <section>
              <h2 className="px-4 pt-5 text-[15px] font-extrabold text-gray-100">더 좋은 대체품</h2>
              <p className="px-4 pt-1 text-[13px] text-gray-70">
                싸든 비싸든 내 피부 궁합이 {FIT_GAIN_MIN}점 이상 높은 제품이에요. {betterCandidates.length}건을 찾았어요.
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-5 p-4">
                {betterCandidates.map((c) => (
                  <AlternativeCardV key={`${c.seed.id}-${c.alt.id}`} alt={c.alt} width="w-full" fitGain={c.fitGain} />
                ))}
              </div>
            </section>
          )}
          {refillCandidates.length > 0 && (
            <section>
              <h2 className="px-4 pt-5 text-[15px] font-extrabold text-gray-100">리필·다른 용량</h2>
              <p className="px-4 pt-1 text-[13px] text-gray-70">
                같은 제품의 더 싼 다른 용량·리필이에요. {refillCandidates.length}건을 찾았어요.
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-5 p-4">
                {refillCandidates.map((c) => (
                  <AlternativeCardV key={`${c.seed.id}-${c.alt.id}`} alt={c.alt} width="w-full" />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </PageWrapper>
  );
}
