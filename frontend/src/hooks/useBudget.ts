import { useCallback, useEffect, useState } from 'react';
import { fetchMyProfile, updateMyProfile } from '../api/auth';
import { useAuth } from '../context/auth';
import { removeKey } from '../context/storage';
import { load, meKey, peek, put } from '../api/queryCache';

export interface Budget {
  min: number;
  max: number;
}

/**
 * 슬라이더 범위. 예산은 제품 하나가 아니라 **루틴 전체 구매 금액**이다
 * (PRD §4.4 "예산 10만원으로 기초 화장품 구성"). 제품 중앙값이 약 2만원이라
 * 스킨·로션·에센스·크림을 모두 담아도 20만원이면 넉넉하다.
 */
export const BUDGET_LIMIT = 200_000;
export const BUDGET_STEP = 5_000;

const GUEST_KEY = 'swappy:budget:v1:guest';

/**
 * 화장품 예산 (`profiles.budget_min/max`). 루틴 전체를 살 때 쓸 금액 범위다.
 * 구매 가이드(Task 15)가 이 범위 안에서 조합을 고른다.
 *
 * 서버가 정본이다(`GET·PATCH /me/profile`). **로그인 전용**이라 비회원은 예산이
 * 없다(화장대·추천세트도 로그인 전용). 아직 정하지 않았으면 `budget`이 null이다.
 */
export function useBudget() {
  const { scope, isUser, loading: authLoading } = useAuth();
  const cacheKey = meKey(scope, 'budget');
  // 저장하면 version을 올려 캐시를 다시 읽게 한다(렌더를 한 번 더 돌린다).
  const [, setVersion] = useState(0);
  const [fetched, setFetched] = useState<{ key: string } | null>(null);

  // 예산이 비회원에게 열려 있던 시절의 기기 기록 — 지운다.
  useEffect(() => {
    removeKey(GUEST_KEY);
  }, []);

  // 회원은 한 번 받으면 세션 동안 캐시에서 꺼낸다. 탭을 오갈 때 기본값이
  // 스치던 문제가 여기서 생겼다. 로그아웃하면 AuthContext가 me: 키를 지운다.
  useEffect(() => {
    if (authLoading || !isUser) return;
    let alive = true;
    load(
      cacheKey,
      () =>
        fetchMyProfile().then((p): Budget | null =>
          p.budgetMin !== null && p.budgetMax !== null ? { min: p.budgetMin, max: p.budgetMax } : null,
        ),
      Infinity,
    )
      .catch(() => null)
      .finally(() => {
        if (alive) setFetched({ key: cacheKey });
      });
    return () => {
      alive = false;
    };
  }, [cacheKey, isUser, authLoading]);

  /** 저장. 실패하면 throw — 화면이 알려 준다 */
  const save = useCallback(
    async (next: Budget) => {
      if (!isUser) throw new Error('예산은 로그인하면 정할 수 있어요');
      const p = await updateMyProfile({ budgetMin: next.min, budgetMax: next.max });
      put<Budget | null>(cacheKey, { min: p.budgetMin ?? next.min, max: p.budgetMax ?? next.max });
      setVersion((v) => v + 1);
    },
    [isUser, cacheKey],
  );

  if (!isUser) return { budget: null, loading: authLoading, save };

  const cached = peek<Budget | null>(cacheKey);
  return {
    budget: cached?.value ?? null,
    loading: authLoading || (cached === undefined && fetched?.key !== cacheKey),
    save,
  };
}
