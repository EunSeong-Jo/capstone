/**
 * 제품 API.
 *
 * 서버 응답이 camelCase라 `Product` 타입을 그대로 씁니다.
 * 변환 계층이 필요 없습니다 — 백엔드 schemas/product.py가 맞춰 줍니다.
 *
 * 서버가 주지 않는 필드: originalPrice, discountRate
 *   크롤러가 수집하지 않아 DB에 전부 NULL입니다.
 *   `Product`에서 optional이라 타입은 문제없고, 화면에서 할인 뱃지가
 *   보이지 않을 뿐입니다.
 */
import { Product } from '../types';
import { QueryParams, request } from './client';

export type ProductSort = 'popular' | 'priceAsc' | 'priceDesc' | 'rating';

export interface ProductListResponse {
  items: Product[];
  total: number;
  page: number;
  size: number;
}

/** 전성분 1건. position은 표기 순서이자 함량 내림차순입니다. */
export interface ProductIngredient {
  id: number;
  name: string;
  nameEn?: string;
  position: number;
}

export interface ProductDetail extends Product {
  productUrl?: string;
  volume?: string;
  country?: string;
  manufacturer?: string;
  expiry?: string;
  reportNo?: string;
  ingredientCountRaw?: number;
  ingredients: ProductIngredient[];
}

export interface ProductQuery {
  category?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: ProductSort;
  page?: number;
  size?: number;
}

export function fetchProducts(
  query: ProductQuery = {},
  signal?: AbortSignal,
): Promise<ProductListResponse> {
  return request<ProductListResponse>(
    '/api/v1/products',
    query as QueryParams,
    signal,
  );
}

export function fetchProduct(
  id: number,
  signal?: AbortSignal,
): Promise<ProductDetail> {
  return request<ProductDetail>(`/api/v1/products/${id}`, undefined, signal);
}

/** 제품명 부분일치. 검색어는 2자 이상이어야 합니다(미만이면 서버가 422). */
export function searchProducts(
  q: string,
  query: Omit<ProductQuery, 'category' | 'brand'> = {},
  signal?: AbortSignal,
): Promise<ProductListResponse> {
  return request<ProductListResponse>(
    '/api/v1/products/search',
    { q, ...query } as QueryParams,
    signal,
  );
}
