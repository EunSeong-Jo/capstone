import { useCallback, useEffect, useState } from 'react';
import { fetchProducts, ProductQuery } from '../api/products';
import { Product } from '../types';
import { OY_PRODUCTS } from '../mocks/oliveyoung';

interface UseProductsResult {
  products: Product[];
  total: number;
  loading: boolean;
  /** 사용자에게 보여줄 오류 문구. 정상이면 null */
  error: string | null;
  /** 백엔드 응답이 아니라 목업으로 채워졌는지 (데모 모드) */
  isMock: boolean;
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
 *
 * 조회가 실패했을 때의 동작은 환경에 따라 다릅니다(VITE_MOCK_FALLBACK).
 *
 *   로컬 `npm run dev` (백엔드 없이 화면만 보는 경우)
 *     → mocks/oliveyoung.ts의 상품 풀로 폴백하고 `isMock=true`를 올립니다.
 *       화면에는 목업임을 알리는 배너가 뜹니다(pages/Home의 MockBanner).
 *   도커 compose · 프로덕션 빌드
 *     → 폴백하지 않고 오류를 그대로 노출합니다.
 *
 * 도커를 DEV로 판별할 수 없다는 점이 이 분기의 핵심입니다. frontend/Dockerfile의
 * CMD가 `npm run dev`라 컨테이너 안에서도 import.meta.env.DEV는 true입니다.
 * 그래서 docker-compose.yml이 VITE_MOCK_FALLBACK=false를 명시로 주입하고,
 * 그 값이 없을 때만 DEV로 떨어집니다 — 도커에는 backend가 함께 떠 있으므로
 * 거기서의 조회 실패는 감춰야 할 것이 아니라 드러나야 할 고장입니다.
 */
const MOCK_FALLBACK =
  import.meta.env.VITE_MOCK_FALLBACK !== undefined
    ? import.meta.env.VITE_MOCK_FALLBACK === 'true'
    : import.meta.env.DEV;

function mockSlice(query: ProductQuery): Product[] {
  let list = [...OY_PRODUCTS];
  if (query.category) list = list.filter((p) => p.category === query.category);
  if (query.brand) list = list.filter((p) => p.brand === query.brand);
  switch (query.sort) {
    case 'priceAsc':
      list.sort((a, b) => a.price - b.price);
      break;
    case 'priceDesc':
      list.sort((a, b) => b.price - a.price);
      break;
    case 'rating':
      list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
      break;
    default:
      list.sort((a, b) => (b.reviewCount ?? 0) - (a.reviewCount ?? 0));
  }
  return query.size ? list.slice(0, query.size) : list;
}

export function useProducts(query: ProductQuery = {}): UseProductsResult {
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMock, setIsMock] = useState(false);
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
        setIsMock(false);
      })
      .catch((err: unknown) => {
        // 언마운트·재요청으로 인한 취소는 오류가 아닙니다.
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (MOCK_FALLBACK) {
          // 로컬 데모 — 서버가 없으면 목업으로 화면을 채운다
          const fallback = mockSlice(JSON.parse(queryKey) as ProductQuery);
          setProducts(fallback);
          setTotal(fallback.length);
          setIsMock(true);
          setError(null);
          return;
        }
        setProducts([]);
        setTotal(0);
        setIsMock(false);
        setError(err instanceof Error ? err.message : '제품을 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [queryKey, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { products, total, loading, error, isMock, reload };
}
