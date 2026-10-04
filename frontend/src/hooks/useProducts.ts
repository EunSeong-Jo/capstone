import { useCallback, useEffect, useState } from 'react';
import { fetchProducts, ProductQuery, ProductListResponse } from '../api/products';
import { load, peek } from '../api/queryCache';
import { Product } from '../types';
import productsFixture from '../mocks/products.fixture.json';

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
 *     → 실 API 캡처본(mocks/products.fixture.json)으로 폴백하고 `isMock=true`를 올립니다.
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

/**
 * 실제 API 응답을 받아 저장한 폴백 풀(scripts/update-products-fixture.mjs).
 * 손으로 적은 목업이 아니라 캡처본이라, 스키마가 바뀌면 스크립트를 다시
 * 돌리면 됩니다 — `npm run fixture:products`.
 */
const FIXTURE_PRODUCTS = productsFixture.items as Product[];

function mockSlice(query: ProductQuery): Product[] {
  let list = [...FIXTURE_PRODUCTS];
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

/**
 * 조회 결과 한 벌.
 *
 * `key`를 함께 담는 이유: 이 결과가 **어떤 요청의 것인지** 알아야 로딩을
 * 파생할 수 있다. effect 본문에서 `setLoading(true)`를 부르면 렌더가 한 번
 * 더 도는데(react-hooks/set-state-in-effect), 지금 필요한 키와 저장된 키를
 * 비교하면 그 왕복이 없어진다. 늦게 도착한 응답이 새 조회의 결과인 척하는
 * 문제도 같이 사라진다.
 */
interface Loaded {
  key: string;
  products: Product[];
  total: number;
  error: string | null;
  isMock: boolean;
}

/** 목록·정렬 결과. 서버가 1시간 캐시하므로 앱에서는 짧게 들고 있으면 된다 */
const PRODUCTS_FRESH_MS = 5 * 60 * 1000;

export function useProducts(query: ProductQuery = {}): UseProductsResult {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [nonce, setNonce] = useState(0);

  const queryKey = JSON.stringify(query);
  const key = `${queryKey}#${nonce}`;
  const cacheKey = `products:${queryKey}`;

  useEffect(() => {
    let alive = true;

    load(cacheKey, () => fetchProducts(JSON.parse(queryKey) as ProductQuery), PRODUCTS_FRESH_MS)
      .then((res) => {
        if (!alive) return;
        setLoaded({
          key,
          products: res.items,
          total: res.total,
          error: null,
          isMock: false,
        });
      })
      .catch((err: unknown) => {
        if (!alive) return;
        if (MOCK_FALLBACK) {
          // 로컬 데모 — 서버가 없으면 목업으로 화면을 채운다
          const fallback = mockSlice(JSON.parse(queryKey) as ProductQuery);
          setLoaded({
            key,
            products: fallback,
            total: fallback.length,
            error: null,
            isMock: true,
          });
          return;
        }
        setLoaded({
          key,
          products: [],
          total: 0,
          isMock: false,
          error: err instanceof Error ? err.message : '제품을 불러오지 못했습니다.',
        });
      });

    return () => {
      alive = false;
    };
  }, [key, cacheKey, queryKey]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // 탭을 오가도 첫 렌더부터 지난 결과를 쓴다.
  const cached = peek<ProductListResponse>(cacheKey)?.value;
  const current =
    loaded?.key === key
      ? loaded
      : cached
        ? { key, products: cached.items, total: cached.total, error: null, isMock: false }
        : null;

  return {
    products: current?.products ?? [],
    total: current?.total ?? 0,
    loading: current === null,
    error: current?.error ?? null,
    isMock: current?.isMock ?? false,
    reload,
  };
}
