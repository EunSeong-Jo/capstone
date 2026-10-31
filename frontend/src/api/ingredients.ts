/**
 * 성분 사전 API (검색 > 성분검색 > 성분 사전). 서버: backend/app/api/ingredients.py
 *
 * 분류와 라벨은 전성분 칩·궁합 카드와 같은 데이터(ingredient_functions)라서 화면끼리 어긋나지 않습니다.
 */
import { QueryParams, request } from './client';

export interface IngredientCategory {
  id: string;
  label: string;
  emoji: string;
  /** function: 보습·진정 같은 기능 / caution: 알레르기·자극 같은 주의 */
  group: 'function' | 'caution';
  blurb: string;
  count: number;
}

export interface DictIngredient {
  id: number;
  name: string;
  nameEn?: string | null;
  /** H보습 B장벽 S진정 W미백 A주름·탄력 O항산화 P피지·모공 E각질 U자외선. 라벨이 없으면 비어 있다 */
  functions: string[];
  role?: string | null;
  /** I자극 소지 F향료 L건조 알코올 */
  flags: string[];
  confidence?: number | null;
  isAllergen: boolean;
  /** 피부타입과 무관한 기준: warn(주의) · normal · null(라벨 없음) */
  grade?: 'warn' | 'normal' | null;
  description?: string | null;
  keywords: string[];
  descriptionSource?: string | null;
  /** 이 성분이 든 판매 중 제품 수 */
  productCount: number;
}

export interface DictListResponse {
  items: DictIngredient[];
  total: number;
  page: number;
  size: number;
}

export function fetchIngredientCategories(signal?: AbortSignal): Promise<{ items: IngredientCategory[] }> {
  return request('/api/v1/ingredients/categories', undefined, signal);
}

export interface DictQuery {
  category?: string;
  q?: string;
  /** 성분 id 목록(마이 성분). 주면 다른 조건은 무시된다 */
  ids?: number[];
  page?: number;
  size?: number;
}

export function fetchIngredients(query: DictQuery, signal?: AbortSignal): Promise<DictListResponse> {
  const { ids, ...rest } = query;
  const params: QueryParams = { ...rest, ids: ids ? ids.join(',') : undefined };
  return request('/api/v1/ingredients', params, signal);
}
