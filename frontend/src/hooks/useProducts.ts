import { useCallback, useEffect, useState } from 'react';
import { fetchProducts, ProductQuery } from '../api/products';
import { Product } from '../types';

interface UseProductsResult {
  products: Product[];
  total: number;
  loading: boolean;
  /** 사용자에게 보여줄 오류 문구. 정상이면 null */
  error: string | null;
  reload: () => void;
}

/**
 * 제품 목록 조회.
 *
 * 저장소의 첫 네트워크 훅입니다. 기존 훅들(useRecentlyViewed 등)은
 * localStorage 전용이라 로딩·오류 상태를 다루지 않았습니다.
 *
 * query는 매 렌더마다 새 객체가 되기 쉬우므로 의존성 배열에 직접 넣지 않고
 * 직렬화한 값을 씁니다. 호출 측에서 useMemo를 강요하지 않기 위해서입니다.
 */
export function useProducts(query: ProductQuery = {}): UseProductsResult {
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const queryKey = JSON.stringify(query);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setError(null);

    fetchProducts(JSON.parse(queryKey) as ProductQuery, controller.signal)
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
          err instanceof Error ? err.message : '제품을 불러오지 못했습니다.',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [queryKey, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { products, total, loading, error, reload };
}
