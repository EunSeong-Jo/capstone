import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { matchPersona, findPersonaById, Persona } from '../data/personas';
import { readJSON, writeJSON } from './storage';

/**
 * 데모 인증. 백엔드 인증 API(Task 12)가 없어 `personas.json`과의 대조로 로그인한다.
 * 로그인 상태와 "게스트로 둘러보기" 여부를 전역에 공유하고, 다른 컨텍스트가
 * 참조하는 사용자 범위 문자열(scope)을 노출한다.
 */

const STORAGE_KEY = 'swappy:auth:v1';

type AuthStatus = 'anon' | 'guest' | 'user';

interface StoredAuth {
  status: AuthStatus;
  personaId: string | null;
}

export interface LoginResult {
  ok: boolean;
  error?: string;
  persona?: Persona;
}

interface AuthContextValue {
  status: AuthStatus;
  /** 로그인한 페르소나. 게스트/초기 상태면 null */
  user: Persona | null;
  isUser: boolean;
  isGuest: boolean;
  /** 스토리지 키 접미사: personaId 또는 'guest' (anon도 'guest'로 취급) */
  scope: string;
  /** 직전 범위 — 게스트→로그인 승계 판단에 쓴다 */
  prevScope: string | null;
  login: (email: string, password: string) => LoginResult;
  loginAs: (personaId: string) => LoginResult;
  continueAsGuest: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const DEFAULT: StoredAuth = { status: 'anon', personaId: null };

function scopeOf(s: StoredAuth): string {
  return s.status === 'user' && s.personaId ? s.personaId : 'guest';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<StoredAuth>(() => readJSON(STORAGE_KEY, DEFAULT));
  const [prevScope, setPrevScope] = useState<string | null>(null);

  useEffect(() => {
    writeJSON(STORAGE_KEY, auth);
  }, [auth]);

  const applyPersona = useCallback((persona: Persona): LoginResult => {
    setAuth((prev) => {
      setPrevScope(scopeOf(prev));
      return { status: 'user', personaId: persona.id };
    });
    return { ok: true, persona };
  }, []);

  const login = useCallback(
    (email: string, password: string): LoginResult => {
      const persona = matchPersona(email, password);
      if (!persona) {
        return { ok: false, error: '이메일 또는 비밀번호가 올바르지 않아요.' };
      }
      return applyPersona(persona);
    },
    [applyPersona],
  );

  const loginAs = useCallback(
    (personaId: string): LoginResult => {
      const persona = findPersonaById(personaId);
      if (!persona) return { ok: false, error: '알 수 없는 계정이에요.' };
      return applyPersona(persona);
    },
    [applyPersona],
  );

  const continueAsGuest = useCallback(() => {
    setAuth((prev) => {
      setPrevScope(scopeOf(prev));
      return { status: 'guest', personaId: null };
    });
  }, []);

  const logout = useCallback(() => {
    setAuth((prev) => {
      setPrevScope(scopeOf(prev));
      return { status: 'guest', personaId: null };
    });
  }, []);

  const user = useMemo(
    () => (auth.status === 'user' && auth.personaId ? findPersonaById(auth.personaId) ?? null : null),
    [auth],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status: auth.status,
      user,
      isUser: auth.status === 'user' && !!user,
      isGuest: auth.status === 'guest',
      scope: scopeOf(auth),
      prevScope,
      login,
      loginAs,
      continueAsGuest,
      logout,
    }),
    [auth, user, prevScope, login, loginAs, continueAsGuest, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
