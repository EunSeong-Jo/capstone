/**
 * 앱이 켜져 있는 동안 쓰는 조회 결과 캐시 (메모리).
 *
 * 데이터 훅은 결과를 컴포넌트 상태에만 들고 있어서, 하단 탭을 오가 화면이
 * 내려갔다 올라오면 처음부터 다시 불렀다 — 로딩 자리표시자가 매번 스쳤고
 * 홈은 교체 제안을 두 번씩(같은 화면의 두 컴포넌트가 각자) 계산했다.
 *
 *   - `peek`  렌더 중에 동기로 읽는다. 값이 있으면 첫 렌더부터 그린다
 *   - `load`  신선하면 캐시값, 아니면 요청. **같은 키의 진행 중 요청은 공유한다**
 *   - `put` / `invalidate`  저장·읽음 처리 같은 변경을 반영한다
 *
 * 새로고침하면 비워진다. 서버 쪽 무거운 계산(유사도 등)은 Redis가 들고 있어
 * 다시 불러도 빠르다. 개인 데이터 키는 `me:`로 시작하고, 세션이 끝나면
 * (`AuthContext.endSession`) 통째로 지운다 — 다음 계정이 보면 안 된다.
 *
 * 공유 요청에는 AbortSignal을 넘기지 않는다. 한 화면이 내려가도 같은 결과를
 * 기다리는 다른 화면이 있을 수 있다. 훅은 언마운트 뒤 결과를 무시하면 된다.
 */

interface Entry {
  value?: unknown;
  /** 값을 받은 시각. value가 없으면 의미 없다 */
  at: number;
  hasValue: boolean;
  inflight?: Promise<unknown>;
}

const store = new Map<string, Entry>();

/** 개인 데이터 키. scope(계정 id 또는 guest)를 넣어 계정끼리 섞이지 않게 한다 */
export const meKey = (scope: string, name: string) => `me:${scope}:${name}`;

export function peek<T>(key: string, freshMs = Infinity): { value: T; fresh: boolean } | undefined {
  const e = store.get(key);
  if (!e?.hasValue) return undefined;
  return { value: e.value as T, fresh: Date.now() - e.at < freshMs };
}

export function put<T>(key: string, value: T): void {
  const prev = store.get(key);
  store.set(key, { value, at: Date.now(), hasValue: true, inflight: prev?.inflight });
}

/**
 * 신선한 캐시가 있으면 그 값을, 아니면 fetcher를 부른다.
 * 실패는 캐시하지 않는다 — 다음 호출이 다시 시도한다.
 */
export function load<T>(key: string, fetcher: () => Promise<T>, freshMs: number): Promise<T> {
  const e = store.get(key);
  if (e?.hasValue && Date.now() - e.at < freshMs) return Promise.resolve(e.value as T);
  if (e?.inflight) return e.inflight as Promise<T>;

  const inflight = fetcher().then(
    (value) => {
      store.set(key, { value, at: Date.now(), hasValue: true });
      return value;
    },
    (err: unknown) => {
      const cur = store.get(key);
      if (cur?.inflight === inflight) {
        if (cur.hasValue) store.set(key, { ...cur, inflight: undefined });
        else store.delete(key);
      }
      throw err;
    },
  );
  store.set(key, { ...(e ?? { at: 0, hasValue: false }), inflight });
  return inflight;
}

/** prefix로 시작하는 키를 모두 지운다. '' 이면 전부 */
export function invalidate(prefix: string): void {
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
