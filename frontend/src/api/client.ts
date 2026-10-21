/**
 * HTTP 클라이언트.
 *
 * 저장소의 첫 네트워크 코드입니다. 이후 화면들이 이 패턴을 따라가므로
 * 얇게 유지합니다. 라이브러리는 쓰지 않습니다 — fetch로 충분합니다.
 *
 * 상대 경로를 쓰는 이유: vite.config.ts가 `/api`를 백엔드로 프록시합니다.
 * 개발 환경에서 base URL을 따로 설정할 필요가 없습니다.
 *
 * Capacitor 앱 빌드에서는 프록시가 없어 절대 URL이 필요합니다. 그때만
 * `VITE_API_BASE_URL`(서버 주소)을 넣고 빌드합니다. 웹·도커 빌드는 비워 두므로
 * 지금처럼 상대 경로입니다. fetch를 직접 쓰거나 서버가 내려준 `/api/...` 경로를
 * `<img src>`·`href`에 쓸 때는 `apiUrl()`을 거치세요 — 앱에서는 상대 경로가
 * 서버가 아니라 앱 안(`https://localhost`)을 가리킵니다.
 *
 * 인증(Task 12)
 * -------------
 * 모든 요청에 액세스 토큰을 붙이고, 401이 오면 **한 번만** 리프레시로
 * 재발급해 원 요청을 다시 보냅니다. 화면이 401을 직접 다루지 않아도 되도록
 * 여기서 끝내는 것이 요점입니다 — 15개 화면이 각자 재시도를 구현하면
 * 리프레시가 동시에 여러 번 나가 서로를 무효화합니다(토큰을 회전시키므로).
 */
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from './tokenStore';

export const API_BASE: string = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

/** 서버가 가리키는 경로를 요청·`src`에 쓸 주소로. 이미 절대 URL이면 그대로 둔다. */
export function apiUrl(path: string): string {
  return path.startsWith('/') ? `${API_BASE}${path}` : path;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type QueryParams = Record<string, string | number | undefined>;

function toQueryString(params?: QueryParams): string {
  if (!params) return '';
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    // undefined는 "필터 없음"이므로 보내지 않습니다.
    // 0과 빈 문자열은 유효한 값이라 그대로 둡니다.
    if (value !== undefined) usp.append(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

/** 인증 헤더를 붙인 기본 헤더. 비로그인이면 Authorization이 빠집니다. */
function authHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set('Accept', 'application/json');
  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return headers;
}

/**
 * 진행 중인 리프레시 요청. 동시에 여러 요청이 401을 받아도 갱신은 한 번만
 * 나갑니다. 서버가 리프레시를 회전시키므로(쓴 토큰은 즉시 죽음) 둘 이상이
 * 동시에 갱신하면 뒤엣것이 401을 받아 멀쩡한 세션이 끊깁니다.
 */
let refreshing: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) {
          // 리프레시까지 죽었으면 재로그인 외에 할 수 있는 게 없습니다.
          clearTokens();
          return false;
        }
        const body = (await res.json()) as {
          accessToken: string;
          refreshToken: string;
        };
        setTokens(body.accessToken, body.refreshToken);
        return true;
      } catch {
        // 네트워크 오류로 토큰을 버리면 잠깐 끊긴 것만으로 로그아웃됩니다.
        return false;
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}

/** 응답을 파싱하거나 ApiError로 바꿉니다. */
async function toResult<T>(res: Response): Promise<T> {
  if (!res.ok) {
    // FastAPI는 오류를 {detail: string | [...]} 로 냅니다.
    let detail = `요청에 실패했습니다. (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body?.detail === 'string') detail = body.detail;
    } catch {
      // 본문이 JSON이 아닌 경우 기본 메시지를 씁니다.
    }
    throw new ApiError(res.status, detail);
  }

  return (await res.json()) as T;
}

/**
 * 401이면 토큰을 한 번 갱신하고 재시도합니다.
 *
 * `send`를 콜백으로 받는 이유: 재시도할 때 헤더를 **새 토큰으로 다시
 * 만들어야** 하기 때문입니다. Request 객체를 재사용하면 옛 토큰이 남습니다.
 */
async function withAuthRetry<T>(
  send: () => Promise<Response>,
  parse: (res: Response) => Promise<T> = toResult<T>,
): Promise<T> {
  let res: Response;
  try {
    res = await send();
  } catch (err) {
    // 요청 취소는 호출 측이 구분해야 하므로 그대로 올려보냅니다.
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, '서버에 연결할 수 없습니다.');
  }

  // 비로그인 상태의 401은 갱신할 토큰이 없으니 그대로 올립니다.
  if (res.status === 401 && getRefreshToken()) {
    if (await refreshAccessToken()) {
      try {
        res = await send();
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') throw err;
        throw new ApiError(0, '서버에 연결할 수 없습니다.');
      }
    }
  }

  return parse(res);
}

/** 이미지 같은 바이너리 응답. `<img src>`는 Authorization 헤더를 못 붙이므로 blob으로 받아 쓴다. */
export async function requestBlob(path: string, signal?: AbortSignal): Promise<Blob> {
  const url = `${API_BASE}${path}`;
  return withAuthRetry<Blob>(
    () => fetch(url, { signal, headers: authHeaders({ Accept: 'image/*' }) }),
    async (res) => {
      if (!res.ok) throw new ApiError(res.status, `이미지를 불러오지 못했어요. (${res.status})`);
      return res.blob();
    },
  );
}

export async function request<T>(
  path: string,
  params?: QueryParams,
  signal?: AbortSignal,
): Promise<T> {
  const url = `${API_BASE}${path}${toQueryString(params)}`;
  return withAuthRetry<T>(() => fetch(url, { signal, headers: authHeaders() }));
}

/** POST + JSON body. GET 전용 `request`와 별개로 둡니다(쿼리스트링 조립이 필요 없어서). */
export async function postJson<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const payload = JSON.stringify(body);

  return withAuthRetry<T>(() =>
    fetch(url, {
      method: 'POST',
      signal,
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: payload,
    }),
  );
}

/**
 * DELETE. 응답 본문이 있는 경우에만 씁니다(장바구니 삭제가 갱신된 장바구니를
 * 돌려주는 식). 본문이 없는 204는 `personal.ts`의 `send`를 씁니다.
 */
export async function deleteJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const url = `${API_BASE}${path}`;
  return withAuthRetry<T>(() =>
    fetch(url, { method: 'DELETE', signal, headers: authHeaders() }),
  );
}

/** PATCH + JSON body. 프로필 부분 수정처럼 일부 필드만 보낼 때 씁니다. */
export async function patchJson<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const payload = JSON.stringify(body);

  return withAuthRetry<T>(() =>
    fetch(url, {
      method: 'PATCH',
      signal,
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: payload,
    }),
  );
}

/** PUT + JSON body. 동의처럼 "이 값으로 맞춘다"는 의미의 갱신에 씁니다. */
export async function putJson<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const payload = JSON.stringify(body);

  return withAuthRetry<T>(() =>
    fetch(url, {
      method: 'PUT',
      signal,
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: payload,
    }),
  );
}
