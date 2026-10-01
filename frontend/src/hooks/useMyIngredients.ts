import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/auth';

/**
 * 계정별로 나눈다.
 *
 * 예전에는 `dcmy:myIngredients:v1` 한 칸이라, 로그인해서 담은 성분이
 * **로그아웃하거나 "로그인 없이 둘러보기"를 골라도 그대로 남았다.**
 * 저장소의 다른 개인 데이터는 전부 이 규칙을 쓴다
 * (`closet`·`cart`·`likes`·`recent`·`decoration`·`diag`·`profile`).
 *
 * 옛 키는 이관하지 않는다. 어느 계정이 담은 성분인지 알 수 없어서, 옮기면
 * 지금 고치려는 그 유출을 그대로 보존하게 된다.
 *
 * 서버로 옮기지 않은 이유
 * ----------------------
 * 성분 이름만 담는 목록이고 아직 화면 하나(`pages/Search`의 성분 사전)에서만
 * 쓴다. 제품 id처럼 카탈로그와 어긋날 여지가 없어 localStorage로 충분하다.
 */
const keyOf = (scope: string) => `swappy:ingredients:v1:${scope}`;

function readStorage(scope: string): string[] {
  try {
    const raw = localStorage.getItem(keyOf(scope));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeStorage(scope: string, items: string[]) {
  try {
    localStorage.setItem(keyOf(scope), JSON.stringify(items));
  } catch {
    // localStorage 사용 불가 시 조용히 무시
  }
}

/** 마이 성분(즐겨찾는 성분) 목록 — 성분 사전의 + 버튼으로 추가 */
export function useMyIngredients() {
  const { scope } = useAuth();

  /** 목록 + 그것이 어느 계정의 것인지. 계정이 바뀌면 남의 목록이다. */
  const [store, setStore] = useState<{ scope: string; items: string[] }>(() => ({
    scope,
    items: readStorage(scope),
  }));

  // 계정 전환은 렌더 중에 반영한다 — effect에서 하면 렌더가 한 번 더 돈다
  // (ClosetContext·CharacterContext와 같은 형태다).
  if (store.scope !== scope) {
    setStore({ scope, items: readStorage(scope) });
  }

  useEffect(() => {
    writeStorage(store.scope, store.items);
  }, [store]);

  const addIngredient = useCallback((name: string) => {
    setStore((prev) =>
      prev.items.includes(name)
        ? prev
        : { scope: prev.scope, items: [name, ...prev.items] },
    );
  }, []);

  const removeIngredient = useCallback((name: string) => {
    setStore((prev) => ({
      scope: prev.scope,
      items: prev.items.filter((i) => i !== name),
    }));
  }, []);

  return { items: store.items, addIngredient, removeIngredient };
}
