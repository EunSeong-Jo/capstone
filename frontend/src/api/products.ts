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
  /**
   * 성분 분류. `scripts/seed_skin_type_tags.py`가 ingredient_tags에서 도출합니다.
   *
   *   key     추천 태그(보습·진정·항산화 등)가 붙은 성분
   *   warn    기피 태그(식약처 표시 의무 착향제·향료·건조 유발 알코올)
   *   normal  제품에 쓰이지만 어느 쪽도 아닌 성분
   *   null    분류 근거가 없는 성분 — 화면은 중립으로 그립니다
   *
   * EWG 등급은 오지 않습니다. 컬럼은 있지만 비어 있고, 출처를 검증할 수 없는
   * 숫자를 채우면 화면이 근거 없는 안전 등급을 주장하게 됩니다.
   */
  grade?: 'key' | 'normal' | 'warn' | null;
  /** 식약처 표시 의무 알레르기 유발 착향제 26종 여부 */
  isAllergen?: boolean;
  /**
   * 성분 설명. `scripts/seed_ingredient_descriptions.py`가 적재합니다.
   * 설명이 없는 성분(파싱 잔해 등)은 셋 다 비어 있습니다.
   *
   *   description        한 줄 설명
   *   keywords           효능·역할 키워드, 고정 어휘에서 최대 2개
   *   descriptionSource  llm(생성 초안) | reviewed(검수 완료).
   *                      llm이면 화면이 '참고용' 문구를 붙입니다
   */
  description?: string | null;
  keywords?: string[];
  descriptionSource?: 'llm' | 'reviewed' | null;
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

/** 전성분에 이 성분(한글·INCI 부분일치)이 든 제품. 2자 이상. */
export function searchProductsByIngredient(
  q: string,
  query: Pick<ProductQuery, 'sort' | 'page' | 'size'> = {},
  signal?: AbortSignal,
): Promise<ProductListResponse> {
  return request<ProductListResponse>(
    '/api/v1/products/search/ingredient',
    { q, ...query } as QueryParams,
    signal,
  );
}


export interface ProductReview {
  id: number;
  nickname: string;
  rating: number;
  body: string | null;
  createdAt: string;
  /** 후기 사진 URL(`/api/v1/reviews/photos/:id`) */
  photoUrls: string[];
  /** 작성자 피부타입 코드. 진단 전이면 null */
  skinType: string | null;
}

export interface ProductReviews {
  items: ProductReview[];
  /** 이 제품 후기 전체 수(필터와 무관) */
  total: number;
  /** 지금 필터에 맞는 수 */
  matched: number;
  /** 후기가 없으면 null입니다 — 0.0으로 내면 "최악"과 구분되지 않습니다. */
  average: number | null;
  /** 5점부터 1점까지의 건수. 키는 문자열입니다(JSON). */
  distribution: Record<string, number>;
}

/**
 * 제품에 달린 후기.
 *
 * **`products.reviewCount`와는 다른 값입니다.** 저쪽은 크롤링으로 받아 온
 * 올리브영의 리뷰 수이고 내용은 갖고 있지 않습니다. 여기 목록은 이 앱에서
 * 실제로 산 사람이 쓴 것뿐이라, 지금은 대부분 비어 있는 게 정상입니다.
 */
export type ReviewSort = 'latest' | 'oldest' | 'rating_desc' | 'rating_asc';

export interface ReviewQuery {
  sort?: ReviewSort;
  /** 이 별점의 후기만 */
  rating?: number;
  /** 작성자 피부타입이 이것인 후기만 */
  skinType?: string;
}

export function fetchProductReviews(
  productId: number,
  query: ReviewQuery = {},
  signal?: AbortSignal,
): Promise<ProductReviews> {
  return request<ProductReviews>(
    `/api/v1/products/${productId}/reviews`,
    query as QueryParams,
    signal,
  );
}
