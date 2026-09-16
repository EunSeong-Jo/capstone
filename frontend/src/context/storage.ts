/**
 * localStorage 래퍼 — 인증 API가 붙기 전까지 데모 상태(로그인·화장대·장바구니·진단)를
 * 브라우저에 보관한다. 모든 접근을 try/catch로 감싼다 (사생활 모드·용량 초과 대비).
 *
 * 키는 사용자 범위(scope)로 분리한다: `swappy:<도메인>:v1:<personaId | 'guest'>`.
 * 로그인/게스트 전환 시 남의 데이터가 보이지 않게 하려는 것이다.
 */

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장 불가 시 조용히 무시 — 데모가 멈추면 안 된다
  }
}

export function hasKey(key: string): boolean {
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // 무시
  }
}
