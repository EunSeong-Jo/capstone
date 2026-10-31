import { useCallback, useEffect, useState } from 'react';
import {
  DictIngredient,
  DictQuery,
  IngredientCategory,
  fetchIngredientCategories,
  fetchIngredients,
} from '../api/ingredients';
import { load } from '../api/queryCache';

const FRESH_MS = 10 * 60 * 1000;
const PAGE_SIZE = 20;

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : '성분 정보를 불러오지 못했어요.';
}

/** 사전 분류와 성분 수. 앱이 켜져 있는 동안 캐시한다. */
export function useIngredientCategories() {
  const [items, setItems] = useState<IngredientCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    load('ingdict:categories', () => fetchIngredientCategories().then((r) => r.items), FRESH_MS)
      .then((r) => {
        if (!alive) return;
        setItems(r);
        setError(null);
      })
      .catch((e) => alive && setError(messageOf(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [nonce]);

  const reload = useCallback(() => {
    setLoading(true);
    setNonce((n) => n + 1);
  }, []);

  return { items, loading, error, reload };
}

/**
 * 성분 목록. 분류·검색어가 바뀌면 처음부터, `more()`는 다음 쪽을 이어 붙인다.
 * `enabled`가 false면 요청하지 않는다(분류도 검색어도 안 골랐을 때).
 */
export function useIngredientList(query: Pick<DictQuery, 'category' | 'q'>, enabled = true) {
  const { category, q } = query;
  const [items, setItems] = useState<DictIngredient[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // 조건이 바뀌면 목록을 비우고 1쪽부터 — 렌더 중에 맞춘다(effect에서 하면 한 프레임 옛 목록이 보인다).
  const condKey = `${category ?? ''}|${q ?? ''}|${enabled}`;
  const [seenKey, setSeenKey] = useState(condKey);
  if (seenKey !== condKey) {
    setSeenKey(condKey);
    setItems([]);
    setTotal(0);
    setPage(1);
    setError(null);
    setLoading(enabled);
  }

  useEffect(() => {
    if (!enabled) return;
    const ctrl = new AbortController();
    // 검색어는 입력이 멈춘 뒤에 보낸다
    const timer = window.setTimeout(
      () => {
        setLoading(true);
        fetchIngredients({ category, q: q || undefined, page, size: PAGE_SIZE }, ctrl.signal)
          .then((r) => {
            setItems((prev) => (page === 1 ? r.items : [...prev, ...r.items]));
            setTotal(r.total);
            setError(null);
          })
          .catch((e) => {
            if (!ctrl.signal.aborted) setError(messageOf(e));
          })
          .finally(() => {
            if (!ctrl.signal.aborted) setLoading(false);
          });
      },
      q && page === 1 ? 300 : 0,
    );
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [category, q, page, enabled, nonce]);

  const more = useCallback(() => setPage((p) => p + 1), []);
  const reload = useCallback(() => {
    setPage(1);
    setNonce((n) => n + 1);
  }, []);

  return { items, total, loading, error, hasMore: items.length < total, more, reload };
}

/** id 목록의 성분 정보(마이 성분). 목록이 바뀌면 다시 읽는다. */
export function useIngredientsByIds(ids: number[]) {
  const key = ids.join(',');
  const [state, setState] = useState<{ key: string; items: DictIngredient[]; error: string | null } | null>(null);

  useEffect(() => {
    if (!key) return;
    const ctrl = new AbortController();
    fetchIngredients({ ids: key.split(',').map(Number), size: 50 }, ctrl.signal)
      .then((r) => setState({ key, items: r.items, error: null }))
      .catch((e) => {
        if (!ctrl.signal.aborted) setState({ key, items: [], error: messageOf(e) });
      });
    return () => ctrl.abort();
  }, [key]);

  const ready = key === '' || state?.key === key;
  return {
    items: key === '' || !state || state.key !== key ? [] : state.items,
    loading: !ready,
    error: state?.key === key ? state.error : null,
  };
}
