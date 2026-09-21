/**
 * 검색 화면의 **정적 콘텐츠**.
 *
 * 인기 검색어와 성분 사전 카테고리는 집계 근거(검색 로그)가 없어 고정 문구다.
 * 제품 id를 담지 않으므로 탭해도 엉뚱한 상세로 가지 않는다 —
 * 실제 제품은 전부 /api/v1/products 계열에서 온다.
 */

export const POPULAR_SEARCH_FILTERS = ['급상승', '성분', '브랜드'] as const;

export const POPULAR_SEARCH_RANKING = [
  '메디큐브', '셀리맥스', '클리오 쿠션', '제로이드', '식물나라',
  '마데카소사이드', '바이오던스', 'PDRN 세럼', '아누아', '퓌 립앤치크',
];export interface IngredientCategory {
  id: string;
  emoji: string;
  label: string;
}

export const INGREDIENT_DICTIONARY: IngredientCategory[] = [
  { id: 'caution20', emoji: '💧', label: '20가지 주의 성분' },
  { id: 'allergy', emoji: '💥', label: '알레르기 유발 주의 성분' },
  { id: 'uv', emoji: '🛡️', label: '자외선 차단 기능 성분' },
];

// ===== 성분 스캔 화면(3c) — 최근 스캔 목업 =====
export interface RecentScan {
  seedId: number; // 클릭 시 /alternatives?seed= 로 연결
  name: string;
  brand: string;
  imageUrl: string;
  ingredientCount: number; // 인식한 성분 개수
  when: string; // "어제", "3일 전"
  safeCount: number;
  cautionCount?: number;
}
