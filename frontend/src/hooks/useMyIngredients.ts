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
 * 성분 id만 담는 목록이라 localStorage로 충분하다. 성분 마스터(`ingredients`)의 id는
 * 제품 id와 달리 카탈로그를 다시 적재해도 바뀌지 않는 표준 명칭 기준이다.
 *
 * v2 — 성분 사전이 실제 성분을 가리키게 되면서 문자열 대신 `{id, name}`을 담는다.
 * v1은 목업 분류 이름("20가지 주의 성분" 등)이라 실제 성분으로 옮길 수 없어 이관하지 않는다.
 * `name`은 사전을 불러오기 전(오프라인)에도 목록을 그리기 위한 사본이다.
 */
export interface MyIngredient {
  id: number;
  name: string;
}

/** 담을 수 있는 최대 개수. 서버 목록 조회(`size`)의 상한과 같다. */
export const MY_INGREDIENT_MAX = 50;

const keyOf = (scope: string) => `swappy:ingredients:v2:${scope}`;

function readStorage(scope: string): MyIngredient[] {
  try {
    const raw = localStorage.getItem(keyOf(scope));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is MyIngredient =>
        typeof x === 'object' && x !== null && Number.isInteger((x as MyIngredient).id) && typeof (x as MyIngredient).name === 'string',
    );
  } catch {
    return [];
  }
}

function writeStorage(scope: string, items: MyIngredient[]) {
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
  const [store, setStore] = useState<{ scope: string; items: MyIngredient[] }>(() => ({
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

  const has = useCallback((id: number) => store.items.some((i) => i.id === id), [store.items]);

  /** 담기. 이미 있거나 가득 차면 false. */
  const add = useCallback(
    (item: MyIngredient): boolean => {
      if (store.items.some((i) => i.id === item.id) || store.items.length >= MY_INGREDIENT_MAX) return false;
      setStore((prev) => ({ scope: prev.scope, items: [item, ...prev.items] }));
      return true;
    },
    [store.items],
  );

  const remove = useCallback((id: number) => {
    setStore((prev) => ({ scope: prev.scope, items: prev.items.filter((i) => i.id !== id) }));
  }, []);

  const full = store.items.length >= MY_INGREDIENT_MAX;

  return { items: store.items, has, add, remove, full };
}
