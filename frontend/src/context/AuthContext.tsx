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
  /**
   * 새로고침 직후에는 토큰만 있고 계정 정보가 없다. 그동안 화면이 게스트로
   * 잘못 그리지 않도록 로딩을 알린다.
   *
   * 단 '둘러보기'를 고른 브라우저는 복원하지 않으므로(아래 effect) 기다릴
   * 것도 없다 — 토큰이 남아 있어도 처음부터 로딩이 아니다.
   */
  const [loading, setLoading] = useState(
    () => readJSON<StoredAuth>(STORAGE_KEY, DEFAULT).status !== 'guest'
      && getRefreshToken() !== null,
  );
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

    /**
     * 사용자가 '로그인 없이 둘러보기'를 고른 브라우저는 복원하지 않는다.
     *
     * 예전 `continueAsGuest`가 토큰을 남겨서 **게스트 상태 + 살아 있는
     * 토큰**이라는 조합이 만들어졌다. 그 브라우저는 새로고침할 때마다
     * 여기서 다시 로그인돼, 둘러보기를 골랐는데도 이전 계정의 피부타입·
     * 화장대가 계속 보였다. 남은 토큰을 지워 스스로 낫게 한다.
     *
     * 상태를 state가 아니라 저장소에서 직접 읽는다 — 이 effect는 마운트
     * 때 한 번만 돌고, 필요한 것은 "그때 저장돼 있던 의사"다.
     */
    const stored = readJSON<StoredAuth>(STORAGE_KEY, DEFAULT);
    if (stored.status === 'guest') {
      const refresh = getRefreshToken();
      if (refresh) void apiLogout(refresh).catch(() => undefined);
      clearTokens();
      return;
    }

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

  /**
   * 계정 정보만 다시 받는다. 닉네임·이메일을 고친 화면이 부른다 —
   * 이걸 안 부르면 헤더에 옛 값이 남는다.
   */
  const reloadMe = useCallback(async () => {
    const user = await fetchMe().catch(() => null);
    if (user === null) return;
    setAccount(toAccount(user));
    setAuth((prev) => (prev.status === 'user' ? { ...prev, email: user.email } : prev));
  }, []);

  /**
   * 세션을 끝낸다.
   *
   * '로그아웃'과 '로그인 없이 둘러보기'는 사용자가 누른 버튼만 다르고
   * **해야 할 정리는 같다.** 예전에는 continueAsGuest가 status만 뒤집어서
   * 토큰과 account가 그대로 남았고, 그 결과
   *
   *   - user·scope가 이전 계정을 가리켜 피부타입·화장대·장식이 샜고
   *   - 새로고침하면 남은 토큰으로 **조용히 다시 로그인**됐다
   *
   * 둘러보기를 골랐는데 실제로는 그 계정으로 로그인된 상태가 됐다는 뜻이다.
   */
  const endSession = useCallback(() => {
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

  const continueAsGuest = endSession;
  const logout = endSession;

  const value = useMemo<AuthContextValue>(
    () => ({
      status: auth.status,
      /**
       * `auth.ts`의 주석이 약속한 대로 **게스트·초기 상태면 null**이다.
       *
       * 예전에는 `account`를 그대로 내보내서, 세션 정리를 빠뜨린 경로가
       * 있으면 게스트 화면에 이전 계정 정보가 새어 나왔다. 여기서 막으면
       * 앞으로 어떤 경로가 `setAccount(null)`을 잊어도 새지 않는다.
       */
      user: auth.status === 'user' ? account : null,
      isUser: auth.status === 'user' && account !== null,
      isGuest: auth.status === 'guest',
      loading,
      scope: auth.status === 'user' && account ? account.id : 'guest',
      prevScope,
      login,
      register,
      loginAs,
      reloadMe,
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
      reloadMe,
      continueAsGuest,
      logout,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
