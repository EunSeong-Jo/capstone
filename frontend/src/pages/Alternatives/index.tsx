import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Header } from '../../components/layout/Header';
import { AlternativeCard } from '../../components/alternatives/AlternativeCard';
import { toSimilarMethod } from '../../api/similar';
import { useCloset } from '../../context/closet';
import { ClosetSeedPicker } from '../../components/alternatives/ClosetSeedPicker';
import { SeedSwitcher } from '../../components/alternatives/SeedSwitcher';
import { useProduct } from '../../hooks/useProduct';
import { useSimilarProducts } from '../../hooks/useSimilarProducts';
import { useSkinType } from '../../hooks/useSkinType';
import type { Product } from '../../types';

type SortKey = 'similarity' | 'price' | 'skin';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'similarity', label: '유사도순' },
  { key: 'price', label: '가격 낮은순' },
  // 피부 궁합은 진단 결과(피부타입)가 있을 때만 의미가 있다 — 없으면 칩이 보이지 않는다.
  { key: 'skin', label: '내 피부 궁합' },
];

/** 결과 목록 자리를 채우는 로딩 자리표시자. 카드 높이에 맞춘다. */
function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 4 }, (_, i) => (
        <div
          key={i}
          className="flex items-start gap-3 p-3 rounded-xl bg-gray-5 border border-gray-20 animate-pulse"
        >
          <div className="w-16 h-16 shrink-0 rounded-lg bg-gray-10" />
          <div className="flex-1 min-w-0">
            <div className="h-3 w-1/4 rounded bg-gray-10" />
            <div className="mt-2 h-3 w-3/4 rounded bg-gray-10" />
            <div className="mt-2 h-3 w-1/3 rounded bg-gray-10" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** 안내 한 덩어리. 오류·빈 결과·기준제품 없음이 모두 이 모양을 쓴다. */
function Notice({
  emoji,
  title,
  description,
  actionLabel,
  onAction,
}: {
  emoji: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <span className="text-4xl mb-3 opacity-40">{emoji}</span>
      <p className="text-sm font-semibold text-gray-100">{title}</p>
      {description && <p className="mt-1 text-sm text-gray-70">{description}</p>}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 rounded-full border border-gray-20 px-4 py-1.5 text-sm font-medium text-gray-100 active:scale-95 transition-transform"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/** 대체품 결과 화면 — 검색/상품상세/내 화장대 3진입점 수렴 (/alternatives?seed=:id) */
export default function AlternativesPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  // seed가 없으면 없는 대로 다룬다. 예전에는 조용히 1로 떨어뜨렸는데, 실제
  // 데이터가 붙은 지금은 그게 '엉뚱한 제품을 기준제품이라고 우기기'가 된다.
  const rawSeed = params.get('seed');
  const seedId = rawSeed === null ? undefined : Number(rawSeed);
  const hasSeedParam = rawSeed !== null;

  // 방식 비교는 개발용이라 UI로 내지 않는다. 방식마다 점수 척도가 달라
  // ("유사도 61%"가 tfidf와 hybrid에서 다른 의미다) 칩으로 노출하면 오해를 부른다.
  // URL로만 바꿀 수 있게 두면 UI 비용 없이 시연·QA에서 비교할 수 있다.
  const method = toSimilarMethod(params.get('method'));

  const { items: closetItems } = useCloset();
  const closetMatch = closetItems.find((c) => c.id === seedId);

  const seedProduct = useProduct(seedId);
  const { skinType } = useSkinType();
  const similar = useSimilarProducts(seedId, {
    limit: 20,
    method,
    fitFor: skinType ?? undefined,
    seedProduct: seedProduct.product,
  });

  // 헤더는 화장대 정보로 먼저 채운다 — 네트워크를 기다리지 않는다.
  // 카탈로그 응답이 도착하면 그쪽이 정본이다(가격·이미지가 실제 값이다).
  const seed: Product | undefined =
    seedProduct.product ??
    (closetMatch
      ? {
          id: closetMatch.id,
          brand: closetMatch.brand,
          name: closetMatch.name,
          category: closetMatch.category,
          imageUrl: closetMatch.imageUrl,
          price: closetMatch.price ?? 0,
        }
      : undefined);

  const [sort, setSort] = useState<SortKey>('similarity');

  // 기준 제품을 화면 안에서 바꿀 수 있는 후보: 기준 제품과 같은 카테고리의 내 화장대 제품(2개 이상일 때만).
  // 화장대에 없는 제품(상세·검색에서 온 경우)이 기준이면 바꿀 대상이 없다.
  const switchOptions = closetMatch ? closetItems.filter((c) => c.category === closetMatch.category) : [];
  const canSwitch = !!seed && switchOptions.length >= 2;
  const pickSeed = (id: number) => {
    // replace: 바꿀 때마다 히스토리가 쌓이지 않아 뒤로가기는 한 번에 이전 화면으로 간다
    const from = params.get('from');
    navigate(`/alternatives?seed=${id}${from ? `&from=${from}` : ''}`, { replace: true });
  };

  const list = useMemo(() => {
    const arr = [...similar.alternatives];
    // 서버가 이미 점수 내림차순으로 주지만, 정렬을 오가도 복원되게 명시한다.
    if (sort === 'similarity') arr.sort((a, b) => b.similarityScore - a.similarityScore);
    // 20개 후보 안에서의 최저가다. 카탈로그 전체의 최저가가 아니다.
    if (sort === 'price') arr.sort((a, b) => a.price - b.price);
    if (sort === 'skin') {
      // 잘 맞음 > 무난 > 판정 없음 > 주의. 같은 등급 안에서는 유사도순.
      const rank = (v?: { verdict: string }) =>
        v?.verdict === 'good' ? 3 : v?.verdict === 'ok' ? 2 : v?.verdict === 'caution' ? 0 : 1;
      arr.sort(
        (a, b) => rank(b.skinMatch) - rank(a.skinMatch) || b.similarityScore - a.similarityScore,
      );
    }
    return arr;
  }, [similar.alternatives, sort]);

  // 기준제품 없이 들어온 경우(홈 배너·화장대 요약 카드) — 화장대에서 고르게 한다.
  if (!hasSeedParam) {
    return (
      <PageWrapper>
        <Header showBack title="내 화장대 대체품 찾기" />
        <ClosetSeedPicker />
      </PageWrapper>
    );
  }

  // 카탈로그에 없는 제품이다(챗봇 등록도 카탈로그에서 찾아 담으므로 화장대에만 있는 제품은 없다).
  if (seedProduct.notFound) {
    return (
      <PageWrapper>
        <Header showBack title="대체품 추천" />
        <Notice
          emoji="🔍"
          title="존재하지 않는 제품이에요"
          description="주소를 다시 확인해 주세요."
          actionLabel="홈으로"
          onAction={() => navigate('/')}
        />
      </PageWrapper>
    );
  }

  // 기준 제품 한 줄(썸네일·이름·가격). 바꿀 수 있으면 SeedSwitcher가 이 줄을 버튼으로 감싼다.
  const seedRow = (
    <div className="flex items-center gap-3">
      {seed ? (
        <>
          <div className="w-14 h-14 rounded-lg overflow-hidden bg-white flex items-center justify-center shrink-0">
            {seed.imageUrl ? (
              <img src={seed.imageUrl} alt={seed.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl opacity-40">🧴</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs text-gray-70">{seed.brand}</p>
            <p className="text-sm font-bold text-gray-100 truncate">{seed.name}</p>
            {seed.price > 0 && (
              <p className="text-sm font-bold text-gray-100 mt-0.5">
                {seed.price.toLocaleString()}원
              </p>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="w-14 h-14 shrink-0 rounded-lg bg-white/70 animate-pulse" />
          <div className="flex-1 min-w-0 animate-pulse">
            <div className="h-3 w-1/4 rounded bg-white/70" />
            <div className="mt-2 h-3 w-2/3 rounded bg-white/70" />
            <div className="mt-2 h-3 w-1/3 rounded bg-white/70" />
          </div>
        </>
      )}
    </div>
  );

  return (
    <PageWrapper>
      <Header showBack title="대체품 추천" />

      {/* 기준제품 헤더 */}
      <div className="px-4 pt-3">
        <p className="text-xs text-gray-70 mb-2">이 제품을 대신할 만한 추천이에요</p>
        <div className="p-3 rounded-xl bg-primary-light/60 border border-primary/15">
          {seed && canSwitch ? (
            <SeedSwitcher seedId={seed.id} options={switchOptions} onPick={pickSeed}>
              {seedRow}
            </SeedSwitcher>
          ) : (
            seedRow
          )}
        </div>
      </div>

      {/* 정렬 칩 */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide">
        {SORTS.filter((s) => s.key !== 'skin' || skinType).map((s) => {
          const on = s.key === sort;
          return (
            <button
              key={s.key}
              onClick={() => setSort(s.key)}
              className={`shrink-0 px-3 h-8 rounded-full text-sm font-medium border transition-colors ${
                on
                  ? 'bg-gray-100 text-white border-gray-100'
                  : 'bg-white text-gray-70 border-gray-20'
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {/* 결과 리스트 */}
      <div className="px-4 pb-8">
        {similar.loading ? (
          <ListSkeleton />
        ) : similar.error ? (
          <Notice
            emoji="⚠️"
            title="대체품을 불러오지 못했어요"
            description={similar.error}
            actionLabel="다시 시도"
            onAction={similar.reload}
          />
        ) : list.length === 0 && similar.variants.length === 0 ? (
          <Notice
            emoji="🔬"
            title="이 제품은 아직 성분 유사도 분석 전이에요"
            description="분석이 끝나면 대체품을 보여드릴게요."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {/* 성분 구성이 사실상 같은 제품. 대체품이라 부를 수 없어 갈라 둔다.
                용량만 다른 경우가 대부분이라 단가 비교로는 값이 있다. */}
            {similar.variants.length > 0 && (
              <>
                <div>
                  <p className="text-sm font-bold text-gray-100">같은 제품 · 용량만 달라요</p>
                  <p className="text-xs text-gray-70 mt-0.5">단가를 비교해 보세요</p>
                </div>
                {similar.variants.map((alt) => (
                  <AlternativeCard key={alt.id} alt={alt} />
                ))}
                {list.length > 0 && <div className="h-px bg-gray-20 my-1" />}
              </>
            )}

            {list.length > 0 ? (
              <>
                <p className="text-sm text-gray-70">
                  총 <span className="font-bold text-gray-100">{list.length}개</span>의 대체품
                </p>
                {list.map((alt) => (
                  <AlternativeCard key={alt.id} alt={alt} />
                ))}
              </>
            ) : (
              <p className="text-sm text-gray-70 py-4 text-center">
                용량이 다른 같은 제품 외에 비슷한 제품을 찾지 못했어요.
              </p>
            )}
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
