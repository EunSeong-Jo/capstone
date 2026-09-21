import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { fetchProduct, ProductDetail, ProductIngredient } from '../api/products';
import { Product } from '../types';
import productsFixture from '../mocks/products.fixture.json';
import { SEED_PRODUCTS, MOCK_ALTERNATIVES } from '../mocks/alternatives';
import { OCR_FIXTURES } from '../data/ocrFixtures';

/**
 * 로컬 dev(백엔드 없음)에서만 목업으로 폴백한다. useProducts.ts와 같은 분기다.
 * 도커·프로덕션에선 폴백하지 않고 오류를 그대로 노출한다.
 */
const MOCK_FALLBACK =
  import.meta.env.VITE_MOCK_FALLBACK !== undefined
    ? import.meta.env.VITE_MOCK_FALLBACK === 'true'
    : import.meta.env.DEV;

/** 상세 화면 어디서든 클릭될 수 있는 목업 카드를 한곳에 모은다(id로 역참조) */
const ALL_MOCK_PRODUCTS: Product[] = [
  ...(productsFixture.items as Product[]),
  ...Object.values(SEED_PRODUCTS),
  ...Object.values(MOCK_ALTERNATIVES).flat(),
];

const GENERIC_INGREDIENTS = [
  '정제수', '글리세린', '부틸렌글라이콜', '다이프로필렌글라이콜', '판테놀',
  '나이아신아마이드', '세라마이드엔피', '하이알루로닉애씨드', '알란토인', '잔탄검',
  '카보머', '다이소듐이디티에이', '1,2-헥산다이올', '향료',
];

/** 실제 상세 API가 없을 때 목록 카드 정보로 상세 화면을 채운다 */
function buildMockDetail(id: number): ProductDetail | null {
  const base = ALL_MOCK_PRODUCTS.find((p) => p.id === id);
  if (!base) return null;

  const ocr = OCR_FIXTURES.find((o) => o.id === id);
  const ingredientNames = ocr?.ingredients ?? GENERIC_INGREDIENTS;
  const ingredients: ProductIngredient[] = ingredientNames.map((name, i) => ({
    id: i + 1,
    name,
    position: i + 1,
  }));

  return {
    ...base,
    volume: '150ml',
    country: '대한민국',
    manufacturer: base.brand,
    ingredients,
  };
}

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
        if (err instanceof ApiError && err.status === 404) {
          setProduct(null);
          setNotFound(true);
          return;
        }
        if (MOCK_FALLBACK) {
          const mock = buildMockDetail(id);
          if (mock) {
            setProduct(mock);
            setError(null);
            return;
          }
        }
        setProduct(null);
        setError(
          err instanceof Error ? err.message : '제품을 불러오지 못했습니다.',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [id, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { product, loading, error, notFound, reload };
}
