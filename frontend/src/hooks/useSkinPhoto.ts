import { useCallback, useEffect, useState } from 'react';
import {
  AnalysisDto,
  QuotaDto,
  SubscriptionDto,
  fetchAnalysisHistory,
  fetchQuota,
  fetchSubscription,
} from '../api/skinPhoto';
import { useAuth } from '../context/auth';
import { invalidate, load, meKey, peek } from '../api/queryCache';

/**
 * 사진 분석 이용 현황·구독 상태.
 *
 * 둘 다 짧게만 캐시한다 — 분석·구독·동의를 바꾸면 곧바로 달라지는 값이라 오래 들고
 * 있으면 남은 횟수가 틀리게 보인다. 변경 직후에는 `reload()`로 비우고 다시 받는다.
 *
 * `useStats`와 같은 방식이다: 무엇을 요청했는지(key)를 결과와 함께 저장하고, 지금 필요한
 * 키와 다르면 로딩으로 본다. effect에서 loading 상태를 켜면 렌더가 한 번 더 돈다.
 */
const FRESH_MS = 15 * 1000;

interface Loaded<T> {
  key: string;
  value: T | null;
  failed: boolean;
}

export function useServerValue<T>(name: string, fetcher: () => Promise<T>) {
  const { isUser, scope, loading: authLoading } = useAuth();
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null);
  const [nonce, setNonce] = useState(0);

  const key = `${scope}:${isUser}:${nonce}`;
  const cacheKey = meKey(scope, name);

  useEffect(() => {
    if (authLoading || !isUser) return;
    let alive = true;
    load(cacheKey, fetcher, FRESH_MS)
      .then((value) => {
        if (alive) setLoaded({ key, value, failed: false });
      })
      .catch(() => {
        if (alive) setLoaded({ key, value: null, failed: true });
      });
    return () => {
      alive = false;
    };
    // fetcher는 모듈 함수라 identity가 바뀌지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, cacheKey, isUser, authLoading]);

  const reload = useCallback(() => {
    invalidate(cacheKey);
    setNonce((n) => n + 1);
  }, [cacheKey]);

  if (!authLoading && !isUser) return { value: null, loading: false, failed: false, reload };

  const cached = peek<T>(cacheKey, FRESH_MS);
  if (loaded?.key !== key && cached?.fresh) {
    return { value: cached.value, loading: false, failed: false, reload };
  }
  return {
    value: loaded?.key === key ? loaded.value : null,
    loading: authLoading || loaded?.key !== key,
    failed: loaded?.key === key && loaded.failed,
    reload,
  };
}

/** 이번 달 이용 한도·동의 여부 (`GET /me/skin-analysis/quota`). 비회원은 null */
export function useQuota() {
  const { value, loading, failed, reload } = useServerValue<QuotaDto>('skin-quota', fetchQuota);
  return { quota: value, loading, failed, reload };
}

/** 구독 상태 (`GET /me/subscription`). 비회원은 null */
export function useSubscription() {
  const { value, loading, failed, reload } = useServerValue<SubscriptionDto>(
    'skin-subscription',
    fetchSubscription,
  );
  return { subscription: value, loading, failed, reload };
}

/** 사진 분석 이력(최신순, 최대 20건). 비회원은 null */
export function useAnalysisHistory() {
  const { value, loading, failed, reload } = useServerValue<AnalysisDto[]>(
    'skin-history',
    () => fetchAnalysisHistory(20),
  );
  return { history: value, loading, failed, reload };
}

/** 구독·동의·분석을 바꾼 뒤 값들을 한꺼번에 비운다 */
export function invalidateSkinPhoto(scope: string) {
  invalidate(meKey(scope, 'skin-quota'));
  invalidate(meKey(scope, 'skin-subscription'));
  invalidate(meKey(scope, 'skin-history'));
}
