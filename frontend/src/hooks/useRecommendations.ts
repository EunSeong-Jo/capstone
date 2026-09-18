import { useMemo } from 'react';
import type { Product, SkinType } from '../types';
import { useProducts } from './useProducts';

/**
 * 피부타입 + 보유 화장품을 반영한 홈 추천.
 *
 * 백엔드에 피부타입 추천 API가 없어, 여기서는 상품 풀(useProducts)에 대해
 * 피부타입 선호 키워드 점수를 매기고 보유 화장품을 제외하는 방식으로
 * "개인화된 것처럼" 보이게 한다. Task 14가 붙으면 추천 API 호출로 교체한다.
 *
 * 성분 유사도와는 별개다. 그쪽은 `/api/v1/products/{id}/similar`가 이미
 * 동작하고(useSimilarProducts), "이 제품 대신 쓸 것"을 찾는다. 이 훅은
 * "내 피부에 맞을 것"을 찾는 것이라 기준이 다르다.
 */

interface OwnedRef {
  id: number;
  brand: string;
  name: string;
}

/** 타입별 선호 키워드(제품명 매칭용)와 선호 카테고리 */
const PREF: Record<SkinType, { keywords: string[]; categories: string[] }> = {
  ondalsam:   { keywords: ['수분', '히알루', '토너', '가벼운', '젤'], categories: ['토너', '스킨케어'] },
  mulgae:     { keywords: ['피지', '모공', '살리실', '산뜻', 'BHA', '클렌징'], categories: ['토너', '클렌징'] },
  subuji:     { keywords: ['수분', '히알루', '세라마이드', '판테놀', '밸런싱'], categories: ['토너', '세럼', '크림'] },
  hwasan:     { keywords: ['진정', '시카', '트러블', '판테놀', '어성초', '노스카나'], categories: ['세럼', '앰플', '크림'] },
  samak:      { keywords: ['세라마이드', '시어', '밤', '고보습', '아토', '오일'], categories: ['크림', '밤', '로션'] },
  injeolmi:   { keywords: ['탄력', '펩타이드', '주름', '아데노신', '콜라겐'], categories: ['앰플', '크림'] },
  yuriguseul: { keywords: ['저자극', '진정', '시카', '민감', '무향', '판테놀'], categories: ['크림', '밤', '토너'] },
  memilmuk:   { keywords: ['나이아신', '비타민', '잡티', '미백', '톤', '흉터'], categories: ['세럼', '앰플'] },
};

const firstWord = (s: string) => s.trim().split(/\s+/)[0] ?? '';

function isOwned(p: Product, owned: OwnedRef[]): boolean {
  return owned.some(
    (o) =>
      o.id === p.id ||
      (o.brand && p.brand === o.brand && p.name.includes(firstWord(o.name))),
  );
}

function scoreFor(p: Product, skinType: SkinType): number {
  const pref = PREF[skinType];
  let s = 0;
  for (const kw of pref.keywords) if (p.name.includes(kw)) s += 2;
  if (pref.categories.includes(p.category)) s += 1;
  s += (p.rating ?? 0) * 0.1;
  return s;
}

export interface RecommendationSet {
  items: Product[];
  total: number;
  rationale: string;
}

export interface UseRecommendationsResult {
  forYou: Product[];
  set: RecommendationSet;
  isMock: boolean;
  loading: boolean;
  /** 상품 풀 조회 실패 메시지. 목업 폴백이 꺼진 환경에서만 채워진다 */
  error: string | null;
  /** 실패한 조회 재시도 */
  reload: () => void;
}

export function useRecommendations(
  skinType: SkinType,
  owned: OwnedRef[],
): UseRecommendationsResult {
  const { products, isMock, loading, error, reload } = useProducts({ size: 40 });

  return useMemo(() => {
    const ranked = products
      .filter((p) => !isOwned(p, owned))
      .map((p) => ({ p, score: scoreFor(p, skinType) }))
      .sort((a, b) => b.score - a.score)
      .map((x) => x.p);

    const forYou = ranked.slice(0, 8);

    // 추천 세트 — 서로 다른 카테고리에서 하나씩, 최대 3개
    const set: Product[] = [];
    const usedCat = new Set<string>();
    for (const p of ranked) {
      if (usedCat.has(p.category)) continue;
      usedCat.add(p.category);
      set.push(p);
      if (set.length === 3) break;
    }

    return {
      forYou,
      set: {
        items: set,
        total: set.reduce((s, p) => s + p.price, 0),
        rationale: `${skinType} 피부에 잘 맞는 성분 위주로 골랐어요`,
      },
      isMock,
      loading,
      error,
      reload,
    };
  }, [products, owned, skinType, isMock, loading, error, reload]);
}
