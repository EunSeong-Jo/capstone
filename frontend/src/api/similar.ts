/**
 * 대체품(성분 유사도) API.
 *
 * `products.ts`와 경로 접두사가 같지만 파일을 나눴습니다. 그쪽은 응답이
 * `Product`와 1:1이라 "변환 계층이 필요 없다"는 전제 위에 서 있는데,
 * 이 API는 점수·공통성분을 화면 모양으로 옮기는 변환이 필요합니다.
 * 변환 자체는 `src/utils/alternatives.ts`가 맡습니다.
 *
 * 서버 계약 (backend/app/api/recommendations.py, 실측 확인)
 *   - 없는 제품        404
 *   - 유사도 미적재    빈 배열 + 200  ← 404가 아닙니다. 제품은 있고 배치가
 *                      아직 안 돈 것뿐이라 화면은 '분석 전'으로 안내합니다.
 *                      실측상 40% 가까이가 여기 해당합니다.
 *   - score            0 < score <= 1, 내림차순 정렬 보장, 자기 자신 제외
 *   - limit            1~20을 벗어나면 422
 *
 * ⚠️ method마다 점수 척도가 다릅니다. 같은 제품에서 tfidf 최고점이 0.25인데
 *    rbo는 0.61이 나오고, 상위 결과가 거의 겹치지 않습니다. 화면에 백분율로
 *    쓸 때는 어느 방식으로 뽑았는지를 함께 봐야 합니다.
 */
import { Product, SkinType } from '../types';
import { QueryParams, request } from './client';

export const SIMILAR_METHODS = ['tfidf', 'jaccard', 'rbo'] as const;
export type SimilarMethod = (typeof SIMILAR_METHODS)[number];

/** 배치가 제품당 20개만 적재합니다. 더 달라고 해도 줄 게 없습니다. */
export const SIMILAR_MAX_LIMIT = 20;

/** 서버가 아는 임의 문자열을 `SimilarMethod`로 좁힙니다(URL 파라미터 검증용). */
export function toSimilarMethod(value: string | null): SimilarMethod | undefined {
  return SIMILAR_METHODS.find((m) => m === value);
}

/** 제품 카드 + 유사도 근거. `sharedIngredients`는 IDF 높은 순입니다. */
export interface SimilarItem extends Product {
  score: number;
  sharedIngredients: string[];
}

export interface SimilarResponse {
  seedId: number;
  method: string;
  items: SimilarItem[];
}

export interface SimilarQuery {
  method?: SimilarMethod;
  limit?: number;
  /** 피부타입 기피 성분이 든 대체품을 서버가 제외합니다. 모르는 값은 무시됩니다. */
  skinType?: SkinType;
}

/**
 * 성분이 비슷한 제품.
 *
 * limit을 여기서 클램프합니다. 범위를 벗어나면 서버가 422를 내는데, 그게
 * `ApiError(422)`로 올라오면 화면이 "요청에 실패했습니다"를 띄웁니다 —
 * 호출 측 실수를 사용자에게 서버 오류로 보여주는 셈이라 미리 막습니다.
 */
export function fetchSimilarProducts(
  id: number,
  query: SimilarQuery = {},
  signal?: AbortSignal,
): Promise<SimilarResponse> {
  const { limit, ...rest } = query;
  const params: SimilarQuery = {
    ...rest,
    limit:
      limit === undefined
        ? undefined
        : Math.min(Math.max(Math.trunc(limit), 1), SIMILAR_MAX_LIMIT),
  };
  return request<SimilarResponse>(
    `/api/v1/products/${id}/similar`,
    params as QueryParams,
    signal,
  );
}
