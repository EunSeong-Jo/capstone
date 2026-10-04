import { useCallback, useEffect, useState } from 'react';
import { BudgetGuideResponse, fetchBudgetGuide } from '../api/recommendations';
import { invalidate, load, peek } from '../api/queryCache';
import type { SkinType } from '../types';
import type { Budget } from './useBudget';

export interface BudgetGuidePrefs {
  fragranceFree: boolean;
  alcoholFree: boolean;
}

/** 같은 예산·조건이면 결과가 같다. 서버도 1시간 캐시한다 */
const GUIDE_FRESH_MS = 30 * 60 * 1000;

interface Loaded {
  key: string;
  data: BudgetGuideResponse | null;
  error: string | null;
}

/**
 * 예산 구매 가이드 (Task 15, `POST /recommendations/budget`).
 *
 * 예산이 없으면 묻지 않는다 — 화면은 예산을 정하라고 안내한다.
 * 결과는 queryCache에 둔다(키 = 예산·피부타입·선호·보유품). 시트를 닫았다
 * 다시 열거나 탭을 오가도 다시 계산하지 않는다.
 */
export function useBudgetGuide(
  budget: Budget | null,
  skinType: SkinType | null,
  prefs: BudgetGuidePrefs,
  ownedIds: number[],
) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [nonce, setNonce] = useState(0);

  const owned = [...ownedIds].sort((a, b) => a - b).join(',');
  const cacheKey = budget
    ? `budgetguide:${budget.min}:${budget.max}:${skinType ?? ''}:${prefs.fragranceFree ? 1 : 0}${prefs.alcoholFree ? 1 : 0}:${owned}`
    : null;
  const key = `${cacheKey}#${nonce}`;

  useEffect(() => {
    if (!budget || !cacheKey) return;
    let alive = true;
    const request = {
      budgetMin: budget.min,
      budgetMax: budget.max,
      skinType: skinType ?? undefined,
      fragranceFree: prefs.fragranceFree,
      alcoholFree: prefs.alcoholFree,
      excludeProductIds: owned ? owned.split(',').map(Number) : [],
    };
    load(cacheKey, () => fetchBudgetGuide(request), GUIDE_FRESH_MS)
      .then((data) => {
        if (alive) setLoaded({ key, data, error: null });
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setLoaded({
          key,
          data: null,
          error: err instanceof Error ? err.message : '루틴을 짜지 못했어요.',
        });
      });
    return () => {
      alive = false;
    };
    // budget·prefs는 cacheKey에 다 들어 있다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const reload = useCallback(() => {
    if (cacheKey) invalidate(cacheKey);
    setNonce((n) => n + 1);
  }, [cacheKey]);

  if (!cacheKey) return { data: null, loading: false, error: null, reload };

  const cached = peek<BudgetGuideResponse>(cacheKey)?.value;
  const current = loaded?.key === key ? loaded : cached ? { key, data: cached, error: null } : null;
  return {
    data: current?.data ?? null,
    loading: current === null,
    error: current?.error ?? null,
    reload,
  };
}
