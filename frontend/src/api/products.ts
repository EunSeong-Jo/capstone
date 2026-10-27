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
import { QueryParams, postJson, request } from './client';

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
   * 성분 분류. 서버가 성분 기능 라벨(ingredient_functions)로 낸다 — 궁합 카드·배지와 같은 기준입니다.
   *
   *   key     내 피부타입(skinType을 준 경우)의 선호 기능을 가진 활성·에몰리언트 성분
   *   warn    주의 성분 — 식약처 알레르기 유발 착향제·일반 향료·건조 알코올, 내 타입이 기피하는 플래그
   *   normal  라벨은 있지만 어느 쪽도 아닌 성분
   *   null    분류 근거(라벨)가 없는 성분 — 화면은 중립으로 그립니다
   *
   * EWG 등급은 오지 않습니다. 컬럼은 있지만 비어 있고, 출처를 검증할 수 없는
   * 숫자를 채우면 화면이 근거 없는 안전 등급을 주장하게 됩니다.
   */
  grade?: 'key' | 'normal' | 'warn' | null;
  /** 식약처 알레르기 유발 착향제 고시 목록의 성분인가 */
  isAllergen?: boolean;
  /** 기능 라벨: H보습 B장벽 S진정 W미백 A주름·탄력 O항산화 P피지·모공 E각질 U자외선. 라벨이 없으면 비어 있다 */
  functions?: string[];
  /** 역할: a활성 e에몰리언트 s용매 f계면활성 t점증 p방부 x기타 j오염 */
  role?: string | null;
  /** 주의 플래그: I자극 소지 F향료 L건조 알코올 */
  flags?: string[];
  /** 라벨 확신도 1~3. 낮으면 화면에 '참고용'으로 표기한다 */
  confidence?: number | null;
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

/** 옵션형 묶음 제품의 옵션 한 줄. 고르면 그 옵션 제품(id)의 상세로 간다 */
export interface ProductOption {
  id: number;
  label: string;
  orderNo: number;
}

export interface ProductDetail extends Product {
  /** single · bonus · goods · bundle · optgroup(옵션형 묶음의 원본 — 화면은 첫 옵션으로 보낸다) */
  composition?: string;
  productUrl?: string;
  volume?: string;
  country?: string;
  manufacturer?: string;
  expiry?: string;
  reportNo?: string;
  ingredientCountRaw?: number;
  /** 옵션형 묶음이면 채워진다. 옵션 제품은 자기 옵션 이름(optionLabel)과 형제 옵션 목록(options)을 가진다 */
  optionParentId?: number | null;
  optionLabel?: string | null;
  options?: ProductOption[];
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

/** skinType을 주면 전성분의 추천(key)·주의(warn) 분류를 그 피부타입 기준으로 받습니다. */
export function fetchProduct(
  id: number,
  signal?: AbortSignal,
  skinType?: string | null,
): Promise<ProductDetail> {
  return request<ProductDetail>(
    `/api/v1/products/${id}`,
    skinType ? { skinType } : undefined,
    signal,
  );
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

// ── 사진으로 화장품 찾기 ─────────────────────────────────────

/** 같은 제품의 용량·기획 변형 한 줄 */
export interface MatchVariant {
  product: Product;
  /** '350ml' · '350ml · 더블기획 (+어성초 크림 20ml)' */
  label: string;
}

export interface ProductMatch {
  /** 같은 제품의 변형을 접은 대표 — 가장 용량이 작은 제품 */
  product: Product;
  /** 변형이 둘 이상일 때만, 대표를 포함한 전부(용량 오름차순). 드롭다운으로 고른다 */
  variants?: MatchVariant[];
  signals: {
    /** 글자 대조 점수(trgm, 0~1)와 어느 이름(ko 한글명 / en 영문명)에서 맞았는지 */
    text: { score: number; matchedOn: 'ko' | 'en'; matchedText: string };
  };
}

export interface ProductScanResult {
  /** 사진에서 읽은 글자(통짜) */
  text: string;
  /** 후보. 자동으로 고르지 않는다 — 화면이 보여 주고 사용자가 고른다 */
  candidates: ProductMatch[];
}

/**
 * 제품 앞면 사진(data URL, 장변 1024px JPEG 권장) → OCR → 후보.
 * 사진 인식 키가 없으면 503(ApiError) — 화면은 제품명 검색으로 안내한다.
 */
export function scanProductImage(image: string, limit = 3): Promise<ProductScanResult> {
  return postJson<ProductScanResult>('/api/v1/products/scan', { image, limit });
}
