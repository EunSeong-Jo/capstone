/**
 * 프로필 기반 추천 API (Task 14).
 *
 * 성분 유사도(`similar.ts`)와는 기준이 다릅니다. 그쪽은 "이 제품 대신 쓸 것",
 * 이쪽은 "내 피부에 맞을 것"입니다.
 *
 * 점수는 서버가 냅니다 — 매칭 성분 0.4 + 별점 0.3 + log(리뷰수) 0.2 +
 * 브랜드 다양성 0.1. 예전에는 프론트가 제품 40개를 받아 **제품명에 키워드가
 * 들어 있는지**로 점수를 매겼는데, 성분을 보지 않았고 카탈로그의 1.6%만
 * 후보였습니다.
 */
import { postJson, request } from './client';
import { Product, SkinType } from '../types';

interface ListResponse {
  items: Product[];
  total: number;
  page: number;
  size: number;
}

export function fetchMainRecommendations(
  skinType?: SkinType,
  size = 8,
  signal?: AbortSignal,
): Promise<ListResponse> {
  return request<ListResponse>('/api/v1/recommendations/main', { skinType, size }, signal);
}

/** 서로 다른 카테고리에서 하나씩. 최대 3건. */
export function fetchRecommendationSet(
  skinType?: SkinType,
  signal?: AbortSignal,
): Promise<Product[]> {
  return request<Product[]>('/api/v1/recommendations/set', { skinType }, signal);
}

// ── 예산 구매 가이드 (Task 15) ────────────────────────────────

export type RoutineStep = 'toner' | 'essence' | 'cream' | 'sunscreen';

export interface BudgetGuideRequest {
  budgetMin: number;
  budgetMax: number;
  /** 없으면 서버가 로그인 사용자의 프로필 피부타입을 쓴다 */
  skinType?: SkinType;
  fragranceFree?: boolean;
  alcoholFree?: boolean;
  /** 화장대 보유품 — 새로 살 루틴에 넣지 않는다 */
  excludeProductIds?: number[];
}

export interface BudgetGuideItem {
  step: RoutineStep;
  stepLabel: string;
  product: Product;
  /** 피부타입 추천 성분이 걸린 성분 수. 0이면 매칭 근거가 없다 */
  matchedIngredients: number;
}

export interface BudgetGuideCombination {
  /** 알뜰 / 균형 / 여유 */
  label: string;
  items: BudgetGuideItem[];
  total: number;
  remaining: number;
  averageRating: number | null;
  reason: string;
  /** 범위(최소 예산)보다 저렴한 조합만 나왔을 때 */
  belowRange: boolean;
}

export interface BudgetGuideResponse {
  combinations: BudgetGuideCombination[];
  budgetMin: number;
  budgetMax: number;
  skinType: SkinType | null;
  /** 예산이 모자라 뺀 단계(선크림 → 크림 → 에센스 순). 비면 네 단계를 다 담았다 */
  missingSteps: string[];
  /** 네 단계를 다 담지 못했을 때 전체 루틴의 최저 합계 */
  minPossibleTotal: number | null;
}

/** 예산 범위 안의 토너·에센스·크림·선크림 루틴 1~3안 */
export function fetchBudgetGuide(req: BudgetGuideRequest): Promise<BudgetGuideResponse> {
  return postJson<BudgetGuideResponse>('/api/v1/recommendations/budget', req);
}
