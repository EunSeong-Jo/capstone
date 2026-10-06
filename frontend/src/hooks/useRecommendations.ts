import { useCallback, useEffect, useState } from 'react';
import { fetchMainRecommendations } from '../api/recommendations';
import type { Product, SkinType } from '../types';
import { load, peek } from '../api/queryCache';

/**
 * 피부타입 맞춤 추천 (`/api/v1/recommendations/main`).
 *
 * 예전에는 `/set`(추천 세트)도 함께 받았다. 추천 세트 버튼이 예산 구매 가이드
 * (`useBudgetGuide`, Task 15)를 보여 주게 되면서 홈에서는 쓰지 않는다.
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

interface UseRecommendationsResult {
  forYou: Product[];
  loading: boolean;
  /** 사용자에게 보여줄 오류 문구. 정상이면 null */
  error: string | null;
  reload: () => void;
}

/** 조회 결과 한 벌. key로 "어떤 피부타입의 결과인지"를 함께 들고 있다. */
interface Loaded {
  key: string;
  forYou: Product[];
  error: string | null;
}

/**
 * 개인화 추천.
 *
 * `skinPending`이 true면 **요청을 보내지 않는다.** 예전에는 화면이 기본값
 * 'ondalsam'을 넘겨서, 옹달샘 기준 추천을 한 번 받아 보여준 뒤 진단이
 * 도착하면 다시 받았다. 첫 응답은 남의 피부타입 추천이었다.
 *
 * 진단을 한 적이 없는 계정(`skinType === null`, `skinPending === false`)은
 * 요청한다 — 서버가 skinType 없이도 인기순으로 응답하므로 빈 화면보다 낫다.
 */
/** 추천은 카탈로그·피부타입이 바뀔 때만 달라진다 */
const RECO_FRESH_MS = 30 * 60 * 1000;

async function fetchForYou(skinType: SkinType | null): Promise<Product[]> {
  const main = await fetchMainRecommendations(skinType ?? undefined, 12);
  return main.items;
}

export function useRecommendations(
  skinType: SkinType | null,
  skinPending: boolean,
  owned: OwnedRef[],
): UseRecommendationsResult {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [nonce, setNonce] = useState(0);

  const key = `${skinType ?? 'none'}:${skinPending}#${nonce}`;
  const cacheKey = `reco:main:${skinType ?? 'none'}`;

  useEffect(() => {
    // 타입을 아직 모르는 동안은 묻지 않는다. 지금 물으면 곧 다시 물어야 한다.
    if (skinPending) return;

    let alive = true;

    load(cacheKey, () => fetchForYou(skinType), RECO_FRESH_MS)
      .then((forYou) => {
        if (alive) setLoaded({ key, forYou, error: null });
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setLoaded({
          key,
          forYou: [],
          error: err instanceof Error ? err.message : '추천을 불러오지 못했습니다.',
        });
      });

    return () => {
      alive = false;
    };
  }, [key, cacheKey, skinType, skinPending]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // 탭을 오가도 첫 렌더부터 지난 결과를 쓴다. 서버도 피부타입별로 24시간 캐시한다.
  const cached = skinPending ? undefined : peek<Product[]>(cacheKey)?.value;
  const current = loaded?.key === key ? loaded : cached ? { key, forYou: cached, error: null } : null;

  // 이미 쓰고 있는 제품을 다시 추천하지 않는다.
  const ownedIds = new Set(owned.map((o) => o.id));
  const filtered = (current?.forYou ?? []).filter((p) => !ownedIds.has(p.id)).slice(0, 8);

  return {
    forYou: filtered,
    loading: current === null,
    error: current?.error ?? null,
    reload,
  };
}
