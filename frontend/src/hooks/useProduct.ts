import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { fetchProduct, ProductDetail } from '../api/products';

interface UseProductResult {
  product: ProductDetail | null;
  loading: boolean;
  /** 사용자에게 보여줄 오류 문구. 정상이면 null */
  error: string | null;
  /** 없는 제품(404). 오류 문구와 다르게 안내해야 합니다 */
  notFound: boolean;
  reload: () => void;
}

/**
 * 제품 1건 조회.
 *
 * useProducts와 같은 서술 방식입니다. 다만 404를 따로 구분합니다 —
 * 잘못된 id로 들어오는 경로가 실제로 있어(목업 화면의 링크 등)
 * "서버 오류"와 "없는 제품"을 다르게 안내해야 합니다.
 */
export function useProduct(id: number | undefined): UseProductResult {
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (id === undefined || Number.isNaN(id) || id <= 0) {
      setProduct(null);
      setLoading(false);
      setNotFound(true);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setNotFound(false);

    fetchProduct(id, controller.signal)
      .then(setProduct)
      .catch((err: unknown) => {
        // 언마운트·재요청으로 인한 취소는 오류가 아닙니다.
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setProduct(null);
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else {
          setError(
            err instanceof Error ? err.message : '제품을 불러오지 못했습니다.',
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [id, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { product, loading, error, notFound, reload };
}
