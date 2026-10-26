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
import { loadSimilarProducts } from '../api/similar';
import { invalidate, load, peek } from '../api/queryCache';
import { ClosetItem } from '../context/closet';
import { Alternative, SkinType } from '../types';
import {
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
  /** 제안하는 대체품. '더 저렴한' 후보면 priceDelta가 음수다. */
  alt: Alternative;
  /** '더 좋은' 후보에서만: 대체품이 쓰던 제품보다 내 피부에 더 잘 맞는 정도(궁합 점수 차) */
  fitGain?: number;
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
   * 조건을 만족한 교체 후보 전체. 절약액 내림차순(동률이면 유사도)이고 `suggestion`이 그 1위다.
   *
   * 홈의 "💰 더 저렴한 대체품" 캐러셀이 이걸 그린다. 예전에는 그 자리에
   * mocks/alternatives.ts의 고정 목업이 있었는데, 가짜 제품에 붙은 id가
   * 실재 카탈로그 id와 겹쳐 카드를 탭하면 전혀 다른 제품이 열렸다.
   */
  candidates: SwapSuggestion[];
  /**
   * 가격과 무관하게 내 피부에 **더 잘 맞는** 대체품(궁합 점수가 FIT_GAIN_MIN점 이상 높다).
   * 더 싼 후보(`candidates`)와 겹칠 수 있다. 궁합 점수 차 내림차순.
   */
  betterCandidates: SwapSuggestion[];
  outcome: SwapOutcome;
  /** outcome이 'variantOnly'일 때 "같은 제품 대용량이 더 싸다"를 보여줄 거리. */
  variantHint: SwapSuggestion | null;
  /** 같은 제품의 더 싼 다른 용량·리필(절약액 순). 홈의 '리필·다른 용량' 카드가 쓴다. */
  refillCandidates: SwapSuggestion[];
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
const MAX_SEEDS = 5;

/**
 * 오늘 쓸 화장대 제품을 고른다. 화장대가 MAX_SEEDS개 이하면 전부, 많으면 날짜로 섞어 MAX_SEEDS개.
 *
 * 같은 날에는 항상 같은 제품이 뽑히고(새로고침해도 안 바뀐다) 날이 바뀌면 달라져서,
 * 며칠 안에 화장대의 모든 제품이 한 번씩 나온다.
 */
function pickSeedsOfToday<T extends { id: number }>(items: T[], today: string): T[] {
  if (items.length <= MAX_SEEDS) return items;
  const hash = (id: number) => {
    let h = 2166136261;
    for (const ch of `${today}:${id}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return h >>> 0;
  };
  return [...items].sort((a, b) => hash(a.id) - hash(b.id)).slice(0, MAX_SEEDS);
}

/** 로컬 날짜(YYYY-MM-DD). 하루의 경계는 사용자 기기 기준이다. */
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/**
 * 화장대 제품을 대체품으로 바꿨을 때 아끼는 금액.
 *
 * 쓰던 제품 하나는 한 번만 바꿀 수 있으므로 **쓰던 제품마다 1등 후보 하나**만 더한다
 * (candidates는 절약액 순이라 제품별 첫 후보가 가장 많이 아끼는 대체품이므로 이 합계는 최대 절약액이다). 후보를 전부
 * 더하면 같은 제품의 대체품 여러 개가 겹쳐 실제로 불가능한 금액이 나온다.
 */
export function totalSavingOf(candidates: SwapSuggestion[]): number {
  const bySeed = new Map<number, number>();
  candidates.forEach((c) => {
    if (!bySeed.has(c.seed.id)) bySeed.set(c.seed.id, -(c.alt.priceDelta ?? 0));
  });
  let sum = 0;
  bySeed.forEach((v) => { sum += v; });
  return sum;
}

/**
 * 홈의 교체 제안 카드(1순위)에 올릴 최소 성분 유사도(%). 절약액·궁합 점수로 1등을 뽑으므로,
 * 이 하한이 없으면 성분이 많이 다른 제품이 1등이 될 수 있다. 목록 화면에는 적용하지 않는다.
 */
export const HOME_SIMILARITY_MIN = 50;

/** '더 좋은 대체품'(가격 무관)이 되려면 쓰던 제품보다 궁합 점수가 이만큼 이상 높아야 한다 */
export const FIT_GAIN_MIN = 5;

/** '더 좋은 대체품' 구역에 낼 최대 개수 */
const MAX_BETTER = 10;

/** 시드당 받아올 후보 수. 같은 제품 변형이 섞여 걸러지므로 여유를 둔다. */
const PER_SEED_LIMIT = 7;

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
  betterCandidates: SwapSuggestion[];
  variantHint: SwapSuggestion | null;
  refillCandidates: SwapSuggestion[];
  outcome: SwapOutcome;
  error: string | null;
}

/** 결과가 없을 때 돌려줄 고정 배열. 매번 새로 만들면 호출부 useMemo가 헛돈다. */
const EMPTY_CANDIDATES: SwapSuggestion[] = [];

/** 결과 한 벌에서 캐시에 두는 부분. 어떤 화장대의 결과인지는 캐시 키가 들고 있다. */
type SwapResult = Omit<Loaded, 'key' | 'error'>;

/** 결과가 바뀌는 건 화장대·피부타입·유사도 배치뿐이다. 서버도 /similar를 24시간 캐시한다 */
const SWAP_FRESH_MS = 30 * 60 * 1000;

const swapCacheKey = (seedKey: string, skinType?: SkinType) => `swap:${seedKey}:${skinType ?? ''}`;

/**
 * 시드마다 /similar를 물어 교체 제안을 고른다.
 *
 * 홈은 이 결과를 두 컴포넌트(교체 제안 카드·더 싼 대체품 캐러셀)가 각자
 * 쓴다. 캐시 키가 같으므로 `load`가 한 번만 계산한다 — 예전에는 둘이
 * 따로 계산해 /similar가 화장대 제품 수의 두 배만큼 나갔다.
 */
async function computeSwap(current: SwapSeed[], skinType?: SkinType): Promise<SwapResult> {
  const results = await Promise.allSettled(
    current.map((seed) => loadSimilarProducts(seed.id, { limit: PER_SEED_LIMIT, skinType, fitFor: skinType })),
  );

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

  // 전부 실패는 결과가 아니다 — 캐시에 남기지 않도록 던진다.
  if (ok.length === 0 && broken.length > 0) {
    throw new Error('교체 제안을 불러오지 못했습니다.');
  }

  // 성공이 하나도 없고 실패가 전부 404라면, 데이터가 없는 게 아니라
  // 화장대에 저장된 id가 우리 카탈로그의 번호가 아닌 것이다.
  if (ok.length === 0) {
    return {
      suggestion: null,
      candidates: [],
      betterCandidates: [],
      variantHint: null,
      refillCandidates: [],
      outcome: 'stale',
    };
  }

  const found: SwapSuggestion[] = [];
  const better: SwapSuggestion[] = [];
  const variantCandidates: SwapSuggestion[] = [];
  results.forEach((result, i) => {
    if (result.status !== 'fulfilled') return;
    const seed = current[i];
    // basedOn: 상세 페이지가 "내 화장대의 어느 제품과 비슷한지"를 알려 주는 데 쓴다(화장대가 기준이라 항상 참이다).
    const seedFit = result.value.seedSkinFitScore ?? null;
    const mapped = result.value.items.map((item) => ({ ...toAlternative(item, seed, skinType), basedOn: seed.name }));
    // 같은 제품의 다른 용량은 교체 제안이 아니다. 이걸 빼지 않으면
    // "유사도 100%" 1등이 대부분 자기 자신의 대용량 버전이 된다.
    // 다만 버리지는 않는다 — 진짜 대체품이 없을 때 "같은 제품 대용량이
    // 더 싸다"는 여전히 쓸모 있는 안내라서 refillCandidates로 남긴다.
    const { alternatives, variants } = splitSameProductVariants(seed, mapped);
    alternatives.forEach((alt) => {
      if ((alt.priceDelta ?? 0) < 0) found.push({ seed, alt });
      // 더 좋은 대체품은 가격과 무관하다 — 싸든 비싸든 내 피부 궁합이 확실히 높으면 된다. 주의 판정은 제외한다.
      const fit = alt.skinMatch?.score;
      if (seedFit !== null && fit !== undefined && alt.skinMatch?.verdict !== 'caution' && fit - seedFit >= FIT_GAIN_MIN) {
        better.push({ seed, alt, fitGain: fit - seedFit });
      }
    });
    variants.forEach((alt) => {
      if ((alt.priceDelta ?? 0) >= 0) return;
      variantCandidates.push({ seed, alt });
    });
  });

  const ranked = rankCandidates(found);
  const seenBetter = new Set<number>();
  const betterRanked = better
    .sort((a, b) => (b.fitGain ?? 0) - (a.fitGain ?? 0) || b.alt.similarityScore - a.alt.similarityScore)
    .filter((c) => {
      if (seenBetter.has(c.alt.id)) return false;
      seenBetter.add(c.alt.id);
      return true;
    })
    .slice(0, MAX_BETTER);
  const best = ranked[0] ?? null;
  const refills = rankCandidates(variantCandidates);
  const variant = best ? null : refills[0] ?? null;

  return {
    suggestion: best,
    candidates: ranked,
    betterCandidates: betterRanked,
    variantHint: variant,
    refillCandidates: refills,
    outcome: best ? 'ok' : variant ? 'variantOnly' : 'none',
  };
}

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
        pickSeedsOfToday(
          items.filter((c) => (c.price ?? 0) > 0),
          todayKey(),
        )
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

  const cacheKey = swapCacheKey(seedKey, skinType);

  useEffect(() => {
    if (isEmpty) return;
    let alive = true;
    load(cacheKey, () => computeSwap(JSON.parse(seedKey) as SwapSeed[], skinType), SWAP_FRESH_MS)
      .then((result) => {
        if (alive) setLoaded({ key, ...result, error: null });
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setLoaded({
          key,
          suggestion: null,
          candidates: [],
          betterCandidates: [],
          variantHint: null,
          refillCandidates: [],
          outcome: 'none',
          error: err instanceof Error ? err.message : '교체 제안을 불러오지 못했습니다.',
        });
      });
    return () => {
      alive = false;
    };
  }, [key, cacheKey, seedKey, isEmpty, skinType]);

  const reload = useCallback(() => {
    invalidate(cacheKey);
    setNonce((n) => n + 1);
  }, [cacheKey]);

  if (isEmpty) {
    return {
      suggestion: null,
      candidates: [],
      betterCandidates: [],
      outcome: 'none',
      variantHint: null,
      refillCandidates: EMPTY_CANDIDATES,
      loading: false,
      error: null,
      reload,
    };
  }

  // 다른 화면에서 이미 계산했으면 첫 렌더부터 그 결과를 쓴다(탭 이동 깜빡임 제거).
  const cached = peek<SwapResult>(cacheKey)?.value;
  const current = loaded?.key === key ? loaded : cached ? { ...cached, error: null } : null;

  return {
    suggestion: current?.suggestion ?? null,
    candidates: current?.candidates ?? EMPTY_CANDIDATES,
    betterCandidates: current?.betterCandidates ?? EMPTY_CANDIDATES,
    outcome: current?.outcome ?? 'none',
    variantHint: current?.variantHint ?? null,
    refillCandidates: current?.refillCandidates ?? EMPTY_CANDIDATES,
    loading: current === null,
    error: current?.error ?? null,
    reload,
  };
}
