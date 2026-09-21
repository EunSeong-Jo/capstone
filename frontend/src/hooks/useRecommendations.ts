import { useCallback, useEffect, useState } from 'react';
import {
  fetchMainRecommendations,
  fetchRecommendationSet,
} from '../api/recommendations';
import type { Product, SkinType } from '../types';

/**
 * 피부타입 맞춤 추천 (`/api/v1/recommendations/main`, `/set`).
 *
 * 예전에는 이 계산이 여기서 일어났다 — 제품 40개를 받아 제품명에 키워드가
 * 들어 있는지로 점수를 매겼다. 두 가지가 문제였다.
 *
 *   1. 40개 안에서만 골랐다. 단일제품 2,489개 중 1.6%다.
 *   2. 근거가 제품명 문자열이었다. 성분을 보지 않았다.
 *
 * 서버는 `ingredient_tags`를 쓴다. 제품 3,974/4,013에 태그가 붙은 성분이
 * 하나 이상 있어 실제로 갈린다. 계산식은 `app/api/recommendations_main.py`
 * 한 곳에 있다.
 *
 * 보유 화장품 제외는 서버에 넘기지 않는다. 화장대는 이제 서버에 있지만
 * (`/me/closet`), 추천을 계정별로 캐싱하면 적중률이 0이 되기 때문이다.
 * 대신 받아 온 목록에서 걸러낸다.
 */

interface OwnedRef {
  id: number;
}

export interface RecommendationSet {
  items: Product[];
  total: number;
  rationale: string;
}

interface UseRecommendationsResult {
  forYou: Product[];
  set: RecommendationSet;
  loading: boolean;
  /** 사용자에게 보여줄 오류 문구. 정상이면 null */
  error: string | null;
  reload: () => void;
}

const EMPTY_SET: RecommendationSet = { items: [], total: 0, rationale: '' };

/** 조회 결과 한 벌. key로 "어떤 피부타입의 결과인지"를 함께 들고 있다. */
interface Loaded {
  key: string;
  forYou: Product[];
  set: Product[];
  error: string | null;
}

export function useRecommendations(
  skinType: SkinType,
  owned: OwnedRef[],
): UseRecommendationsResult {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [nonce, setNonce] = useState(0);

  const key = `${skinType}#${nonce}`;

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([
      fetchMainRecommendations(skinType, 12, controller.signal),
      fetchRecommendationSet(skinType, controller.signal),
    ])
      .then(([main, set]) => {
        setLoaded({ key, forYou: main.items, set, error: null });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setLoaded({
          key,
          forYou: [],
          set: [],
          error: err instanceof Error ? err.message : '추천을 불러오지 못했습니다.',
        });
      });

    return () => controller.abort();
  }, [key, skinType]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const current = loaded?.key === key ? loaded : null;

  // 이미 쓰고 있는 제품을 다시 추천하지 않는다.
  const ownedIds = new Set(owned.map((o) => o.id));
  const filtered = (current?.forYou ?? []).filter((p) => !ownedIds.has(p.id)).slice(0, 8);
  const filteredSet = (current?.set ?? []).filter((p) => !ownedIds.has(p.id));

  return {
    forYou: filtered,
    set:
      filteredSet.length > 0
        ? {
            items: filteredSet,
            total: filteredSet.reduce((sum, p) => sum + p.price, 0),
            rationale: '성분 태그가 피부타입 규칙에 맞는 제품으로 골랐어요',
          }
        : EMPTY_SET,
    loading: current === null,
    error: current?.error ?? null,
    reload,
  };
}
