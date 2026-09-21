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
import { request } from './client';
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
