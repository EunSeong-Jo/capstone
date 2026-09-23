import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { fetchMyProfile, updateMyProfile } from '../api/auth';
import { CharacterContext, CharacterContextValue } from './character';
import { useAuth } from './auth';
import { readJSON, writeJSON } from './storage';

/**
 * 캐릭터 꾸미기 장식.
 *
 * 로그인 상태면 **서버가 정본**이다(`profiles.decoration_id`). 예전에는
 * scope별 localStorage에만 있어서 기기를 바꾸면 사라졌고, 꾸미기 화면의
 * '저장하기'는 애초에 아무 데도 저장하지 않았다(DecoratePage의 TODO).
 *
 * 비회원은 localStorage를 그대로 쓴다 — 서버에 붙일 계정이 없다.
 *
 * 낙관적 업데이트
 * ---------------
 * 고른 즉시 화면에 반영하고 서버에 보낸다. 실패하면 이전 값으로 되돌린다.
 * 꾸미기는 고르자마자 마스코트에 보여야 의미가 있는 화면이라, 응답을
 * 기다리면 반응이 굼뜨게 느껴진다.
 */
const GUEST_KEY = 'swappy:decoration:v1:guest';

/** 서버가 "해제"로 알아듣는 값. null은 "안 보냄"이라 해제와 구분되지 않는다. */
const CLEARED = 0;

export function CharacterProvider({ children }: { children: ReactNode }) {
  const { scope, isUser, loading: authLoading } = useAuth();

  /** 장식 + 그것이 어느 계정의 것인지. 계정이 바뀌면 이전 값은 남의 것이다. */
  const [store, setStore] = useState<{ scope: string; decorationId: number | null }>(
    () => ({ scope, decorationId: readJSON<number | null>(GUEST_KEY, null) }),
  );

  // 계정 전환은 렌더 중에 반영한다 — effect에서 하면 렌더가 한 번 더 돈다.
  if (store.scope !== scope) {
    setStore({
      scope,
      decorationId: isUser ? null : readJSON<number | null>(GUEST_KEY, null),
    });
  }

  useEffect(() => {
    if (authLoading || !isUser) return;

    let alive = true;
    fetchMyProfile()
      .then((p) => {
        if (alive) setStore({ scope, decorationId: p.decorationId ?? null });
      })
      .catch(() => undefined);

    return () => {
      alive = false;
    };
  }, [scope, isUser, authLoading]);

  const setDecoration = useCallback(
    (id: number | null) => {
      const previous = store.decorationId;
      setStore((prev) => ({ scope: prev.scope, decorationId: id }));

      if (!isUser) {
        writeJSON(GUEST_KEY, id);
        return;
      }
      void updateMyProfile({ decorationId: id ?? CLEARED }).catch(() => {
        // 저장에 실패했는데 화면만 바뀌어 있으면 다음에 열 때 조용히
        // 되돌아간 것처럼 보인다. 지금 되돌린다.
        setStore((prev) => ({ scope: prev.scope, decorationId: previous }));
      });
    },
    [isUser, store.decorationId],
  );

  const value = useMemo<CharacterContextValue>(
    () => ({ decorationId: store.decorationId, setDecoration }),
    [store.decorationId, setDecoration],
  );

  return <CharacterContext.Provider value={value}>{children}</CharacterContext.Provider>;
}
