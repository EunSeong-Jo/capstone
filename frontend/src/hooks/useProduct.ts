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
/** 조회 결과 한 벌. key로 "어떤 요청의 결과인지"를 함께 들고 있다. */
interface Loaded {
  key: string;
  product: ProductDetail | null;
  error: string | null;
  notFound: boolean;
}

interface UseProductOptions {
  /** 전성분의 추천·주의 분류를 이 피부타입 기준으로 받는다 (상세 화면만 쓴다) */
  skinType?: string | null;
  /** 피부타입을 아직 모르는 동안 true — 요청을 미뤄 두 번 받지 않는다 */
  wait?: boolean;
}

export function useProduct(id: number | undefined, options: UseProductOptions = {}): UseProductResult {
  const { skinType, wait = false } = options;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [nonce, setNonce] = useState(0);

  const key = `${id}:${skinType ?? ''}#${nonce}`;
  // 잘못된 id로 들어오는 경로가 실제로 있습니다(목업 링크, /detail/NaN).
  // 조회할 것이 없으므로 effect를 돌리지 않고 아래에서 바로 notFound를 냅니다.
  const invalid = id === undefined || Number.isNaN(id) || id <= 0;

  useEffect(() => {
    if (invalid || wait) return;

    const controller = new AbortController();

    fetchProduct(id, controller.signal, skinType)
      .then((product) => setLoaded({ key, product, error: null, notFound: false }))
      .catch((err: unknown) => {
        // 언마운트·재요청으로 인한 취소는 오류가 아닙니다.
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (err instanceof ApiError && err.status === 404) {
          setLoaded({ key, product: null, error: null, notFound: true });
        } else {
          setLoaded({
            key,
            product: null,
            notFound: false,
            error: err instanceof Error ? err.message : '제품을 불러오지 못했습니다.',
          });
        }
      });

    return () => controller.abort();
  }, [key, id, invalid, wait, skinType]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  if (invalid) {
    return { product: null, loading: false, error: null, notFound: true, reload };
  }

  const current = !wait && loaded?.key === key ? loaded : null;

  return {
    product: current?.product ?? null,
    loading: current === null,
    error: current?.error ?? null,
    notFound: current?.notFound ?? false,
    reload,
  };
}
