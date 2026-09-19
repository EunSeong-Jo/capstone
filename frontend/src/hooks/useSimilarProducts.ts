import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import {
  SimilarItem,
  SimilarMethod,
  fetchSimilarProducts,
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
  const { method, limit, skinType, seedProduct = null } = options;

  const [items, setItems] = useState<SimilarItem[]>([]);
  const [appliedMethod, setAppliedMethod] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [nonce, setNonce] = useState(0);

  // 요청에 영향을 주는 값만 키에 넣습니다. seedProduct는 병행 요청의 결과라
  // 목록보다 늦게 도착하는데, 이게 의존성에 섞이면 기준제품이 로드되는
  // 순간 /similar가 한 번 더 나갑니다. 파생은 아래 useMemo가 따로 합니다.
  const queryKey = JSON.stringify({ method, limit, skinType });

  useEffect(() => {
    // 잘못된 id로 들어오는 경로가 실제로 있습니다(seed 없는 진입, 목업 링크).
    if (seedId === undefined || Number.isNaN(seedId) || seedId <= 0) {
      setItems([]);
      setLoading(false);
      setNotFound(true);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setNotFound(false);

    fetchSimilarProducts(
      seedId,
      JSON.parse(queryKey) as UseSimilarProductsOptions,
      controller.signal,
    )
      .then((res) => {
        setItems(res.items);
        setAppliedMethod(res.method);
      })
      .catch((err: unknown) => {
        // 언마운트·재요청으로 인한 취소는 오류가 아닙니다.
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setItems([]);
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else {
          setError(
            err instanceof Error ? err.message : '대체품을 불러오지 못했습니다.',
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [seedId, queryKey, nonce]);

  // 기준제품이 늦게 도착해도 재요청 없이 절약액만 다시 계산됩니다.
  const { alternatives, variants } = useMemo(() => {
    const mapped = items.map((item) => toAlternative(item, seedProduct));
    return splitSameProductVariants(seedProduct, mapped);
  }, [items, seedProduct]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return {
    alternatives,
    variants,
    method: appliedMethod,
    loading,
    error,
    notFound,
    reload,
  };
}
