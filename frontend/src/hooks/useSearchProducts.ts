import { useCallback, useEffect, useState } from 'react';
import { searchProducts, searchProductsByIngredient, ProductQuery } from '../api/products';
import { Product } from '../types';

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

interface UseSearchProductsResult {
  products: Product[];
  total: number;
  loading: boolean;
  /** 사용자에게 보여줄 오류 문구. 정상이면 null */
  error: string | null;
  reload: () => void;
}

/**
 * 통합검색(제품명) 조회.
 *
 * useProducts와 같은 골격(AbortController, queryKey 직렬화)을 따르되 두 가지를 더한다.
 *  - 디바운스: q가 멈춘 뒤 DEBOUNCE_MS가 지나야 요청한다. 매 키 입력마다 호출되는
 *    Search/index.tsx의 handleSearch를 그대로 연결해도 안전하다.
 *  - 최소 글자수 게이트: 2자 미만이면 API를 호출하지 않는다(백엔드가 422를 낸다).
 *    이 경우 디바운스 지연 없이 즉시 빈 결과로 되돌린다.
 */
/** 조회 결과 한 벌. key로 "어떤 검색어의 결과인지"를 함께 들고 있다. */
interface Loaded {
  key: string;
  products: Product[];
  total: number;
  error: string | null;
}

/** name: 제품명(통합검색), ingredient: 전성분(성분검색) */
export type SearchBy = 'name' | 'ingredient';

export function useSearchProducts(
  q: string,
  query: Omit<ProductQuery, 'category' | 'brand'> = {},
  by: SearchBy = 'name',
): UseSearchProductsResult {
  const trimmed = q.trim();
  const [debouncedQ, setDebouncedQ] = useState(trimmed);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [nonce, setNonce] = useState(0);

  const queryKey = JSON.stringify(query);

  /**
   * 디바운스. 짧은 입력은 기다리지 않고 바로 반영합니다 — 어차피 조회하지
   * 않으므로(MIN_QUERY_LENGTH 미만) 지연시킬 이유가 없습니다.
   *
   * setState를 타이머 콜백에서만 부르므로 effect 본문에는 동기 호출이 없습니다.
   */
  useEffect(() => {
    if (trimmed.length < MIN_QUERY_LENGTH) {
      const immediate = window.setTimeout(() => setDebouncedQ(trimmed), 0);
      return () => window.clearTimeout(immediate);
    }
    const timer = window.setTimeout(() => setDebouncedQ(trimmed), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [trimmed]);

  const key = `${by}:${debouncedQ}:${queryKey}#${nonce}`;
  // 두 글자 미만은 조회하지 않습니다. 결과는 아래에서 파생합니다.
  const tooShort = debouncedQ.length < MIN_QUERY_LENGTH;

  useEffect(() => {
    if (tooShort) return;

    const controller = new AbortController();

    const parsed = JSON.parse(queryKey) as ProductQuery;
    const call =
      by === 'ingredient'
        ? searchProductsByIngredient(debouncedQ, parsed, controller.signal)
        : searchProducts(debouncedQ, parsed, controller.signal);
    call
      .then((res) => {
        setLoaded({ key, products: res.items, total: res.total, error: null });
      })
      .catch((err: unknown) => {
        // 언마운트·재요청으로 인한 취소는 오류가 아닙니다.
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setLoaded({
          key,
          products: [],
          total: 0,
          error: err instanceof Error ? err.message : '검색 결과를 불러오지 못했습니다.',
        });
      });

    return () => controller.abort();
  }, [key, debouncedQ, queryKey, tooShort, by]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // 입력이 두 글자 미만이면 조회하지 않으니 비어 있는 게 맞다.
  if (trimmed.length < MIN_QUERY_LENGTH) {
    return { products: [], total: 0, loading: false, error: null, reload };
  }
  // 새 검색어를 막 넣어서 디바운스 대기 중이면 "결과 없음"이 아니라 "불러오는 중"이다.
  // (인기 검색어를 누르면 q는 바로 바뀌지만 debouncedQ는 300ms 뒤에 따라와서, 그동안 빈 결과가 먼저 보였다)
  if (tooShort || debouncedQ !== trimmed) {
    return { products: [], total: 0, loading: true, error: null, reload };
  }

  const current = loaded?.key === key ? loaded : null;

  return {
    products: current?.products ?? [],
    total: current?.total ?? 0,
    loading: current === null,
    error: current?.error ?? null,
    reload,
  };
}
