import { useCallback, useEffect, useState } from 'react';
import { searchProducts, ProductQuery } from '../api/products';
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
export function useSearchProducts(
  q: string,
  query: Omit<ProductQuery, 'category' | 'brand'> = {},
): UseSearchProductsResult {
  const trimmed = q.trim();
  const [debouncedQ, setDebouncedQ] = useState(trimmed);
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const queryKey = JSON.stringify(query);

  useEffect(() => {
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setDebouncedQ(trimmed);
      return;
    }
    const timer = window.setTimeout(() => setDebouncedQ(trimmed), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [trimmed]);

  useEffect(() => {
    if (debouncedQ.length < MIN_QUERY_LENGTH) {
      setProducts([]);
      setTotal(0);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    searchProducts(debouncedQ, JSON.parse(queryKey) as ProductQuery, controller.signal)
      .then((res) => {
        setProducts(res.items);
        setTotal(res.total);
      })
      .catch((err: unknown) => {
        // 언마운트·재요청으로 인한 취소는 오류가 아닙니다.
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setProducts([]);
        setTotal(0);
        setError(
          err instanceof Error ? err.message : '검색 결과를 불러오지 못했습니다.',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [debouncedQ, queryKey, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { products, total, loading, error, reload };
}
