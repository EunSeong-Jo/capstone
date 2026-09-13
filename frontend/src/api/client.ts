/**
 * HTTP 클라이언트.
 *
 * 저장소의 첫 네트워크 코드입니다. 이후 화면들이 이 패턴을 따라가므로
 * 얇게 유지합니다. 라이브러리는 쓰지 않습니다 — fetch로 충분합니다.
 *
 * 상대 경로를 쓰는 이유: vite.config.ts가 `/api`를 백엔드로 프록시합니다.
 * 개발 환경에서 base URL을 따로 설정할 필요가 없습니다.
 *
 * ⚠️ Capacitor 네이티브 빌드에서는 프록시가 없어 절대 URL이 필요합니다.
 *    그때 API_BASE만 환경변수로 빼면 됩니다.
 */

const API_BASE = '';

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

export async function request<T>(
  path: string,
  params?: QueryParams,
  signal?: AbortSignal,
): Promise<T> {
  const url = `${API_BASE}${path}${toQueryString(params)}`;

  let res: Response;
  try {
    res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  } catch (err) {
    // 요청 취소는 호출 측이 구분해야 하므로 그대로 올려보냅니다.
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, '서버에 연결할 수 없습니다.');
  }

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

/** POST + JSON body. GET 전용 `request`와 별개로 둡니다(쿼리스트링 조립이 필요 없어서). */
export async function postJson<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const url = `${API_BASE}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, '서버에 연결할 수 없습니다.');
  }

  if (!res.ok) {
    let detail = `요청에 실패했습니다. (${res.status})`;
    try {
      const errBody = await res.json();
      if (typeof errBody?.detail === 'string') detail = errBody.detail;
    } catch {
      // 본문이 JSON이 아닌 경우 기본 메시지를 씁니다.
    }
    throw new ApiError(res.status, detail);
  }

  return (await res.json()) as T;
}
