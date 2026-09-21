/**
 * 오늘의 교체 제안 — 화장대에서 "바꿀 만한 것" 하나.
 *
 * useSimilarProducts와 다른 점은 시드가 여럿이라는 것뿐이다. 화장대 항목
 * 각각에 /similar를 물어보고, 그중 **성분이 충분히 비슷하면서 가장 많이
 * 절약되는 조합 하나**만 남긴다. 점수·절약액·공통성분 파생은 전부
 * utils/alternatives.ts가 하던 그대로 쓴다 — 여기서 새로 계산하지 않는다.
 *
 * 한 건(`suggestion`)과 정렬된 전체(`candidates`)를 둘 다 낸다. 홈의 교체
 * 제안 카드가 전자를, "더 저렴한 대체품" 캐러셀이 후자를 쓴다.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import { fetchSimilarProducts } from '../api/similar';
import { ClosetItem } from '../context/closet';
import { Alternative, SkinType } from '../types';
import {
  SIMILARITY_HIGH,
  splitSameProductVariants,
  toAlternative,
} from '../utils/alternatives';

/**
 * 쓰던 제품. ClosetItem에서 카드가 쓰는 필드만 추렸다.
 *
 * 좁힌 이유는 화면 편의가 아니라 의존성 때문이다 — 아래 effect가 이 값을
 * JSON으로 직렬화해 키로 삼는데, ClosetItem 전체를 넣으면 status·addedVia가
 * 바뀔 때마다 /similar가 다시 나간다.
 */
export interface SwapSeed {
  id: number;
  brand: string;
  name: string;
  price: number;
  imageUrl?: string;
}

export interface SwapSuggestion {
  /** 쓰던 제품 (화장대) */
  seed: SwapSeed;
  /** 제안하는 대체품. priceDelta는 항상 음수다. */
  alt: Alternative;
}

/**
 * 제안이 없을 때 "왜 없는지". 화면이 세 경우를 다르게 안내해야 해서 낸다.
 *
 *   ok           제안이 있다 (suggestion !== null)
 *   stale        화장대 제품이 전부 카탈로그에 없다 (모두 404)
 *   variantOnly  더 싼 게 같은 제품의 다른 용량·리필팩뿐이다
 *   none         후보는 봤지만 전부 더 비싸거나 성분이 덜 비슷하다
 *
 * stale을 따로 두는 이유: 이건 데이터가 없다는 뜻이 아니라 화장대에 저장된
 * id가 우리 카탈로그의 번호가 아니라는 뜻이다. 단종이 아니다 — 서버의 404는
 * products 행의 유무만 보고, status(active/soldout/discontinued)는 보지 않는다.
 * 목업 시절 id(9001대)나 챗봇이 만든 id(960001대)가 남은 경우다.
 */
export type SwapOutcome = 'ok' | 'stale' | 'variantOnly' | 'none';

interface UseSwapSuggestionResult {
  suggestion: SwapSuggestion | null;
  /**
   * 조건을 만족한 교체 후보 전체. 절약액 내림차순이고 `suggestion`이 그 1위다.
   *
   * 홈의 "💰 더 저렴한 대체품" 캐러셀이 이걸 그린다. 예전에는 그 자리에
   * mocks/alternatives.ts의 고정 목업이 있었는데, 가짜 제품에 붙은 id가
   * 실재 카탈로그 id와 겹쳐 카드를 탭하면 전혀 다른 제품이 열렸다.
   */
  candidates: SwapSuggestion[];
  outcome: SwapOutcome;
  /** outcome이 'variantOnly'일 때 "같은 제품 대용량이 더 싸다"를 보여줄 거리. */
  variantHint: SwapSuggestion | null;
  loading: boolean;
  /** 연결 실패·5xx처럼 재시도할 만한 고장일 때만 채워진다. 404는 여기 오지 않는다. */
  error: string | null;
  reload: () => void;
}

/**
 * 한 번에 물어볼 화장대 항목 수.
 *
 * 화장대가 20개여도 홈 진입마다 20번 요청할 이유는 없다. 최근에 넣은
 * 것일수록 지금 쓰는 제품일 가능성이 높아 앞에서부터 자른다.
 */
const MAX_SEEDS = 4;

/** 시드당 받아올 후보 수. 같은 제품 변형이 섞여 걸러지므로 여유를 둔다. */
const PER_SEED_LIMIT = 5;

/**
 * 절약액 내림차순. 동률이면 더 비슷한 쪽이 앞.
 *
 * 같은 대체품이 여러 화장대 항목에서 중복으로 뽑히는 경우가 있어(비슷한
 * 제품을 두 개 쓰면 그렇다) 제품 id로 한 번만 남긴다. 캐러셀에 같은 카드가
 * 두 번 서면 후보가 많아 보이지만 실제로는 하나다.
 */
function rankCandidates(candidates: SwapSuggestion[]): SwapSuggestion[] {
  const sorted = [...candidates].sort((a, b) => {
    const saving = -(b.alt.priceDelta ?? 0) - -(a.alt.priceDelta ?? 0);
    if (saving !== 0) return saving;
    return b.alt.similarityScore - a.alt.similarityScore;
  });

  const seen = new Set<number>();
  return sorted.filter((c) => {
    if (seen.has(c.alt.id)) return false;
    seen.add(c.alt.id);
    return true;
  });
}

/** 조회 결과 한 벌. key로 "어떤 화장대의 결과인지"를 함께 들고 있다. */
interface Loaded {
  key: string;
  suggestion: SwapSuggestion | null;
  candidates: SwapSuggestion[];
  variantHint: SwapSuggestion | null;
  outcome: SwapOutcome;
  error: string | null;
}

/** 결과가 없을 때 돌려줄 고정 배열. 매번 새로 만들면 호출부 useMemo가 헛돈다. */
const EMPTY_CANDIDATES: SwapSuggestion[] = [];

export function useSwapSuggestion(
  items: ClosetItem[],
  skinType?: SkinType,
): UseSwapSuggestionResult {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [nonce, setNonce] = useState(0);

  // 가격을 모르면 절약액을 낼 수 없어 애초에 후보가 되지 않는다.
  // 화장대 배열은 렌더마다 새로 만들어지므로, 내용이 같으면 같은 문자열이
  // 되도록 직렬화해 두고 effect는 그 문자열만 본다 (useSimilarProducts와 같은 방식).
  const seedKey = useMemo(
    () =>
      JSON.stringify(
        items
          .filter((c) => (c.price ?? 0) > 0)
          .sort((a, b) => b.addedAt - a.addedAt)
          .slice(0, MAX_SEEDS)
          .map<SwapSeed>((c) => ({
            id: c.id,
            brand: c.brand,
            name: c.name,
            price: c.price ?? 0,
            imageUrl: c.imageUrl,
          })),
      ),
    [items],
  );

  // 화장대가 비어 있으면 조회할 것이 없다. effect에서 상태를 되돌리는 대신
  // 아래에서 곧바로 빈 결과를 내보낸다 — 렌더가 한 번 더 도는 일이 없다.
  const isEmpty = seedKey === '[]';

  const key = `${seedKey}:${skinType}#${nonce}`;

  useEffect(() => {
    if (isEmpty) return;
    const current = JSON.parse(seedKey) as SwapSeed[];

    const controller = new AbortController();

    Promise.allSettled(
      current.map((seed) =>
        fetchSimilarProducts(
          seed.id,
          { limit: PER_SEED_LIMIT, skinType },
          controller.signal,
        ),
      ),
    )
      .then((results) => {
        if (controller.signal.aborted) return;

        // 404는 고장이 아니다. 화장대에는 카탈로그에 없는 id가 섞인다 —
        // 챗봇으로 등록한 제품(960001+)이 그렇고, id 체계가 바뀌기 전에
        // 저장된 localStorage도 그렇다. 유사도를 낼 수 없을 뿐이므로 오류를
        // 띄우지 않고, 대신 outcome 'stale'로 화면이 따로 안내하게 한다.
        //
        // 오류로 칠 것은 연결 실패·5xx처럼 "다시 시도하면 될지도 모르는" 것뿐이다.
        const isNotFound = (r: PromiseSettledResult<unknown>) =>
          r.status === 'rejected' && r.reason instanceof ApiError && r.reason.status === 404;

        const ok = results.filter((r) => r.status === 'fulfilled');
        const broken = results.filter((r) => r.status === 'rejected' && !isNotFound(r));

        if (ok.length === 0 && broken.length > 0) {
          setLoaded({
            key,
            suggestion: null,
            candidates: [],
            variantHint: null,
            outcome: 'none',
            error: '교체 제안을 불러오지 못했습니다.',
          });
          return;
        }

        // 성공이 하나도 없고 실패가 전부 404라면, 데이터가 없는 게 아니라
        // 화장대에 저장된 id가 우리 카탈로그의 번호가 아닌 것이다.
        if (ok.length === 0) {
          setLoaded({
            key,
            suggestion: null,
            candidates: [],
            variantHint: null,
            outcome: 'stale',
            error: null,
          });
          return;
        }

        const found: SwapSuggestion[] = [];
        const variantCandidates: SwapSuggestion[] = [];
        results.forEach((result, i) => {
          if (result.status !== 'fulfilled') return;
          const seed = current[i];
          const mapped = result.value.items.map((item) => toAlternative(item, seed));
          // 같은 제품의 다른 용량은 교체 제안이 아니다. 이걸 빼지 않으면
          // "유사도 100%" 1등이 대부분 자기 자신의 대용량 버전이 된다.
          // 다만 버리지는 않는다 — 진짜 대체품이 없을 때 "같은 제품 대용량이
          // 더 싸다"는 여전히 쓸모 있는 안내라서 variantHint로 남긴다.
          const { alternatives, variants } = splitSameProductVariants(seed, mapped);
          alternatives.forEach((alt) => {
            if ((alt.priceDelta ?? 0) >= 0) return;
            if (alt.similarityScore < SIMILARITY_HIGH) return;
            found.push({ seed, alt });
          });
          variants.forEach((alt) => {
            if ((alt.priceDelta ?? 0) >= 0) return;
            variantCandidates.push({ seed, alt });
          });
        });

        const ranked = rankCandidates(found);
        const best = ranked[0] ?? null;
        const variant = best ? null : rankCandidates(variantCandidates)[0] ?? null;

        setLoaded({
          key,
          suggestion: best,
          candidates: ranked,
          variantHint: variant,
          outcome: best ? 'ok' : variant ? 'variantOnly' : 'none',
          error: null,
        });
      });

    return () => controller.abort();
  }, [key, seedKey, isEmpty, skinType]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  if (isEmpty) {
    return {
      suggestion: null,
      candidates: [],
      outcome: 'none',
      variantHint: null,
      loading: false,
      error: null,
      reload,
    };
  }

  const current = loaded?.key === key ? loaded : null;

  return {
    suggestion: current?.suggestion ?? null,
    candidates: current?.candidates ?? EMPTY_CANDIDATES,
    outcome: current?.outcome ?? 'none',
    variantHint: current?.variantHint ?? null,
    loading: current === null,
    error: current?.error ?? null,
    reload,
  };
}
