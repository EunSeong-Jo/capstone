import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import {
  SimilarItem,
  SimilarMethod,
  loadSimilarProducts,
  peekSimilarProducts,
} from '../api/similar';
import { Alternative, SkinType } from '../types';
import {
  SeedRef,
  splitSameProductVariants,
  toAlternative,
} from '../utils/alternatives';

interface UseSimilarProductsOptions {
  method?: SimilarMethod;
  limit?: number;
  /** 서버가 기피 성분 제품을 걸러냅니다. 지금은 어느 화면도 넘기지 않습니다. */
  skinType?: SkinType;
  /** 이 피부타입 기준의 궁합 판정을 카드에 붙입니다(걸러내지는 않습니다). */
  fitFor?: SkinType;
  /**
   * 절약액 계산용 기준제품. 별도 요청(useProduct)으로 오므로 목록보다
   * 늦게 도착하고, 없는 동안에는 가격 파생이 생략됩니다.
   */
  seedProduct?: SeedRef | null;
}

interface UseSimilarProductsResult {
  /** 진짜 대체품. 같은 제품의 다른 용량은 여기 없습니다. */
  alternatives: Alternative[];
  /** 같은 제품의 다른 용량. 단가 비교용으로 따로 보여줍니다. */
  variants: Alternative[];
  /** 서버가 실제로 적용한 방식. 어느 척도의 점수인지 확인할 때 씁니다. */
  method: string | null;
  loading: boolean;
  error: string | null;
  /** 없는 제품(404). 유사도가 아직 없는 것과 다르게 안내해야 합니다 */
  notFound: boolean;
  reload: () => void;
}

/** 조회 결과 한 벌. key로 "어떤 요청의 결과인지"를 함께 들고 있다. */
interface Loaded {
  key: string;
  items: SimilarItem[];
  method: string | null;
  error: string | null;
  notFound: boolean;
}

/**
 * 결과가 없을 때 돌려줄 고정 배열.
 *
 * 매번 `[]`를 새로 만들면 아래 useMemo가 참조 변화로 재계산된다 —
 * 값은 같은데 파생만 다시 도는 셈이다.
 */
const EMPTY_ITEMS: SimilarItem[] = [];

/**
 * 성분이 비슷한 제품.
 *
 * useProduct와 같은 서술 방식입니다. 상태를 넷으로 나눠 돌려주는데,
 * 화면은 `loading → notFound → error → 빈 목록` 순으로 판단하면 됩니다.
 *
 * **빈 배열은 오류가 아닙니다.** 유사도 배치가 아직 안 돈 제품이 실측으로
 * 40% 가까이 되고, 서버도 그 경우 404가 아니라 200에 빈 배열을 냅니다.
 * "없는 제품"과 "아직 분석 전"은 사용자에게 다르게 보여야 합니다.
 */
export function useSimilarProducts(
  seedId: number | undefined,
  options: UseSimilarProductsOptions = {},
): UseSimilarProductsResult {
  const { method, limit, skinType, fitFor, seedProduct = null } = options;

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [nonce, setNonce] = useState(0);

  // 요청에 영향을 주는 값만 키에 넣습니다. seedProduct는 병행 요청의 결과라
  // 목록보다 늦게 도착하는데, 이게 의존성에 섞이면 기준제품이 로드되는
  // 순간 /similar가 한 번 더 나갑니다. 파생은 아래 useMemo가 따로 합니다.
  const queryKey = JSON.stringify({ method, limit, skinType, fitFor });

  const key = `${seedId}:${queryKey}#${nonce}`;
  // 잘못된 id로 들어오는 경로가 실제로 있습니다(seed 없는 진입, 목업 링크).
  // 조회할 것이 없으므로 effect를 돌리지 않고 아래에서 바로 notFound를 냅니다.
  const invalid = seedId === undefined || Number.isNaN(seedId) || seedId <= 0;

  useEffect(() => {
    if (invalid) return;

    let alive = true;

    // 캐시를 거친다. 같은 제품을 홈·상세·히스토리가 물어도 한 번만 요청한다.
    loadSimilarProducts(seedId, JSON.parse(queryKey) as UseSimilarProductsOptions)
      .then((res) => {
        if (!alive) return;
        setLoaded({
          key,
          items: res.items,
          method: res.method,
          error: null,
          notFound: false,
        });
      })
      .catch((err: unknown) => {
        if (!alive) return;
        if (err instanceof ApiError && err.status === 404) {
          setLoaded({ key, items: [], method: null, error: null, notFound: true });
        } else {
          setLoaded({
            key,
            items: [],
            method: null,
            notFound: false,
            error: err instanceof Error ? err.message : '대체품을 불러오지 못했습니다.',
          });
        }
      });

    return () => {
      alive = false;
    };
  }, [key, seedId, queryKey, invalid]);

  // 다른 화면에서 이미 받은 결과가 있으면 첫 렌더부터 쓴다(탭 이동 깜빡임 제거).
  const cached = invalid
    ? undefined
    : peekSimilarProducts(seedId, JSON.parse(queryKey) as UseSimilarProductsOptions);
  const current =
    loaded?.key === key
      ? loaded
      : cached
        ? { key, items: cached.items, method: cached.method, error: null, notFound: false }
        : null;
  const items = current?.items ?? EMPTY_ITEMS;

  // 기준제품이 늦게 도착해도 재요청 없이 절약액만 다시 계산됩니다.
  const { alternatives, variants } = useMemo(() => {
    const mapped = items.map((item) => toAlternative(item, seedProduct, fitFor));
    return splitSameProductVariants(seedProduct, mapped);
  }, [items, seedProduct, fitFor]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  if (invalid) {
    return {
      alternatives: [],
      variants: [],
      method: null,
      loading: false,
      error: null,
      notFound: true,
      reload,
    };
  }

  return {
    alternatives,
    variants,
    method: current?.method ?? null,
    loading: current === null,
    error: current?.error ?? null,
    notFound: current?.notFound ?? false,
    reload,
  };
}
