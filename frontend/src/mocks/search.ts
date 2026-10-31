/**
 * 검색 화면의 **정적 콘텐츠**.
 *
 * 인기 검색어와 성분 사전 카테고리는 집계 근거(검색 로그)가 없어 고정 문구다.
 * 제품 id를 담지 않으므로 탭해도 엉뚱한 상세로 가지 않는다 —
 * 실제 제품은 전부 /api/v1/products 계열에서 온다.
 */

export const POPULAR_SEARCH_FILTERS = ['급상승', '성분', '브랜드'] as const;

export type PopularSearchFilter = (typeof POPULAR_SEARCH_FILTERS)[number];

/**
 * 필터별 인기 검색어. '성분' 탭 항목은 누르면 성분검색으로 넘어간다
 * (Search/index.tsx) — 제품명에는 성분명이 거의 없어 통합검색으로는 안 나온다.
 */
export const POPULAR_SEARCH_RANKING: Record<PopularSearchFilter, string[]> = {
  급상승: [
    '메디큐브', '셀리맥스', '클리오 쿠션', '제로이드', '식물나라',
    '마데카소사이드', '바이오던스', 'PDRN 세럼', '아누아', '퓌 립앤치크',
  ],
  성분: [
    '나이아신아마이드', '판테놀', '히알루론산', '병풀추출물', '세라마이드',
    '레티놀', '마데카소사이드', '아데노신', '티트리', '살리실릭애씨드',
  ],
  브랜드: [
    '라운드랩', '토리든', '아누아', '메디힐', '닥터지',
    '달바', '에스트라', '라로슈포제', '구달', '넘버즈인',
  ],
};

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
