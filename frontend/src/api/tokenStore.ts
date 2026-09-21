/**
 * 토큰 보관.
 *
 * localStorage에 둡니다. XSS가 있으면 읽히지만, 이 앱은 SPA라 httpOnly
 * 쿠키를 쓰려면 백엔드가 CSRF까지 다뤄야 하고 Capacitor 네이티브 빌드에서는
 * 쿠키가 아예 다르게 동작합니다. 대신 액세스 토큰을 30분으로 짧게 두고
 * 리프레시는 서버에서 revoke할 수 있게 만들어 뒀습니다.
 *
 * `client.ts`가 순환 import 없이 토큰에 접근하려고 모듈 수준 상태로 둡니다 —
 * React 컨텍스트에 넣으면 훅 밖인 client.ts에서 읽을 수 없습니다.
 */
const ACCESS_KEY = 'swappy:auth:access:v1';
const REFRESH_KEY = 'swappy:auth:refresh:v1';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // 프라이빗 모드 등에서 접근이 막힐 수 있습니다. 비로그인으로 취급합니다.
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // 저장에 실패해도 이번 세션 동안은 메모리 값으로 동작합니다.
  }
}

let accessToken: string | null = read(ACCESS_KEY);
let refreshToken: string | null = read(REFRESH_KEY);

/** 토큰이 바뀔 때 알림. AuthContext가 구독해 로그아웃을 화면에 반영합니다. */
type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeTokens(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach((fn) => fn());
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function getRefreshToken(): string | null {
  return refreshToken;
}

export function setTokens(access: string, refresh: string) {
  accessToken = access;
  refreshToken = refresh;
  write(ACCESS_KEY, access);
  write(REFRESH_KEY, refresh);
  notify();
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  write(ACCESS_KEY, null);
  write(REFRESH_KEY, null);
  notify();
}
