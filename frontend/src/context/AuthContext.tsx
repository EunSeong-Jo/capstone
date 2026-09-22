import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ApiError } from '../api/client';
import {
  AuthUser,
  fetchMe,
  login as apiLogin,
  logout as apiLogout,
  signup as apiSignup,
} from '../api/auth';
import {
  clearTokens,
  getRefreshToken,
  setTokens,
  subscribeTokens,
} from '../api/tokenStore';
import {
  Account,
  AuthContext,
  AuthContextValue,
  AuthStatus,
  LoginResult,
} from './auth';
import { findPersonaById, PERSONAS, Persona } from '../data/personas';
import { readJSON, writeJSON } from './storage';

/**
 * 인증 (Task 12).
 *
 * 예전에는 `personas.json`과 이메일·비밀번호를 대조하는 데모 로그인이었다.
 * 지금은 `POST /api/v1/auth/login`으로 실제 인증하고, 토큰은 `tokenStore`가
 * 들고 있으며 `client.ts`가 모든 요청에 붙인다.
 *
 * personas.json이 남아 있는 이유
 * ------------------------------
 * 같은 파일을 `scripts/seed_test_users.py`가 읽어 DB에 같은 사람을 심으므로,
 * 서버 계정과 1:1로 대응한다. 아직 서버에 없는 값(보유 화장품 시드,
 * 가입월 표기)을 이메일로 찾아 쓴다 — 화장대가 서버로 옮겨가면(4단계)
 * 이 다리는 사라진다.
 */

const STORAGE_KEY = 'swappy:auth:v1';

interface StoredAuth {
  status: AuthStatus;
  /** 게스트/익명 구분용. 계정 정보는 토큰으로 서버에서 다시 받는다. */
  email: string | null;
}

const DEFAULT: StoredAuth = { status: 'anon', email: null };

function scopeOf(s: StoredAuth): string {
  // 로그인 상태의 정확한 scope는 계정 id다. 이 함수는 '직전 범위'를 기록할
  // 때만 쓰이므로, 로그인 중이었다면 그 사실만 남기면 된다.
  return s.status === 'user' && s.email ? s.email : 'guest';
}

/** personas.json에서 같은 이메일을 찾는다. 서버 계정과 1:1로 대응한다. */
function personaOf(email: string): Persona | null {
  const e = email.trim().toLowerCase();
  return PERSONAS.find((p) => p.email.toLowerCase() === e) ?? null;
}

/** 서버 계정 + personas.json 보강 → 화면이 보는 Account */
function toAccount(user: AuthUser): Account {
  const persona = personaOf(user.email);
  return {
    id: user.id,
    email: user.email,
    nickname: user.nickname ?? persona?.nickname ?? user.email.split('@')[0],
    // 서버의 profiles.skin_type이 정본. 없으면 페르소나 기본값으로 데모를 살린다.
    skinType: user.skinType ?? persona?.skinType ?? null,
    memberSince:
      persona?.memberSince ?? user.createdAt.slice(0, 7).replace('-', '.'),
    persona,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<StoredAuth>(() => readJSON(STORAGE_KEY, DEFAULT));
  const [account, setAccount] = useState<Account | null>(null);
  // 새로고침 직후에는 토큰만 있고 계정 정보가 없다. 그동안 화면이 게스트로
  // 잘못 그리지 않도록 로딩을 알린다.
  const [loading, setLoading] = useState(() => getRefreshToken() !== null);
  const [prevScope, setPrevScope] = useState<string | null>(null);

  useEffect(() => {
    writeJSON(STORAGE_KEY, auth);
  }, [auth]);

  /**
   * 새로고침 시 세션 복원. 토큰이 있으면 GET /me로 계정을 다시 받는다.
   * 액세스 토큰이 만료됐어도 client.ts가 리프레시로 한 번 재시도한다.
   */
  useEffect(() => {
    // 토큰이 없으면 복원할 세션도 없다. loading 초기값이 이미
    // `getRefreshToken() !== null`이라 여기서 끄지 않아도 false다.
    if (getRefreshToken() === null) return;

    let alive = true;
    fetchMe()
      .then((user) => {
        if (!alive) return;
        setAccount(toAccount(user));
        setAuth({ status: 'user', email: user.email });
      })
      .catch(() => {
        // 토큰이 죽었으면 게스트로 떨어뜨린다. 여기서 오류를 띄우면
        // 앱을 오랜만에 연 사용자가 매번 경고를 본다.
        if (!alive) return;
        clearTokens();
        setAccount(null);
        setAuth((prev) => (prev.status === 'user' ? { status: 'guest', email: null } : prev));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  /**
   * 토큰이 밖에서 지워지는 경우(리프레시 실패)를 화면에 반영한다.
   * client.ts가 clearTokens()를 부르면 여기가 깨어난다.
   */
  useEffect(
    () =>
      subscribeTokens(() => {
        if (getRefreshToken() === null) {
          setAccount(null);
          setAuth((prev) =>
            prev.status === 'user' ? { status: 'guest', email: null } : prev,
          );
        }
      }),
    [],
  );

  const applyLogin = useCallback((user: AuthUser) => {
    const next = toAccount(user);
    setAccount(next);
    setAuth((prev) => {
      setPrevScope(scopeOf(prev));
      return { status: 'user', email: user.email };
    });
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      try {
        const bundle = await apiLogin(email.trim(), password);
        setTokens(bundle.accessToken, bundle.refreshToken);
        applyLogin(bundle.user);
        return { ok: true };
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          return { ok: false, error: '이메일 또는 비밀번호가 올바르지 않아요.' };
        }
        if (err instanceof ApiError && err.status === 0) {
          return { ok: false, error: '서버에 연결할 수 없어요.' };
        }
        return {
          ok: false,
          error: err instanceof Error ? err.message : '로그인하지 못했어요.',
        };
      }
    },
    [applyLogin],
  );

  /**
   * 이메일 가입.
   *
   * 서버가 가입과 동시에 토큰을 내주므로(`POST /auth/signup`) 로그인을
   * 따로 태우지 않는다. 예전에는 인증 API가 없어 가입한 계정을
   * localStorage(`swappy:customAccounts:v1`)에 Persona 모양으로 저장했는데,
   * 그러면 그 브라우저에서만 존재하는 계정이 됐다.
   */
  const register = useCallback(
    async (email: string, password: string, nickname: string): Promise<LoginResult> => {
      try {
        const bundle = await apiSignup(
          email.trim(),
          password,
          nickname.trim() || undefined,
        );
        setTokens(bundle.accessToken, bundle.refreshToken);
        applyLogin(bundle.user);
        return { ok: true };
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          return { ok: false, error: '이미 가입된 이메일이에요.' };
        }
        if (err instanceof ApiError && err.status === 422) {
          // 서버 쪽 검증(이메일 형식·비밀번호 길이)까지 온 경우. 화면이
          // 먼저 걸러내지만, 서버 규칙이 바뀌어도 사용자가 이유를 본다.
          return { ok: false, error: '이메일 형식과 비밀번호 길이를 확인해 주세요.' };
        }
        if (err instanceof ApiError && err.status === 0) {
          return { ok: false, error: '서버에 연결할 수 없어요.' };
        }
        return {
          ok: false,
          error: err instanceof Error ? err.message : '가입하지 못했어요.',
        };
      }
    },
    [applyLogin],
  );

  /**
   * 데모용 퀵 로그인. 비밀번호를 personas.json에서 꺼내 같은 login()을 탄다 —
   * 서버 인증을 우회하지 않으므로 실제 계정이 없으면 그대로 실패한다.
   */
  const loginAs = useCallback(
    async (personaId: string): Promise<LoginResult> => {
      const persona = findPersonaById(personaId);
      if (!persona) return { ok: false, error: '알 수 없는 계정이에요.' };
      return login(persona.email, persona.password);
    },
    [login],
  );

  const continueAsGuest = useCallback(() => {
    setAuth((prev) => {
      setPrevScope(scopeOf(prev));
      return { status: 'guest', email: null };
    });
  }, []);

  const logout = useCallback(() => {
    const refresh = getRefreshToken();
    // 서버의 리프레시 토큰을 끊는다. 실패해도 로컬은 지운다 —
    // 네트워크 때문에 로그아웃이 안 되면 더 이상하다.
    if (refresh) void apiLogout(refresh).catch(() => undefined);
    clearTokens();
    setAccount(null);
    setAuth((prev) => {
      setPrevScope(scopeOf(prev));
      return { status: 'guest', email: null };
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: auth.status,
      user: account,
      isUser: auth.status === 'user' && account !== null,
      isGuest: auth.status === 'guest',
      loading,
      scope: account ? account.id : 'guest',
      prevScope,
      login,
      register,
      loginAs,
      continueAsGuest,
      logout,
    }),
    [
      auth.status,
      account,
      loading,
      prevScope,
      login,
      register,
      loginAs,
      continueAsGuest,
      logout,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
