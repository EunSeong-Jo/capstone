import { createContext, useContext } from 'react';
import type { Persona } from '../data/personas';
import type { SkinType } from '../types';

/**
 * Context 객체·타입·훅만 담습니다.
 *
 * Provider(`AuthContext.tsx`)와 파일을 나눈 이유는 Fast Refresh 때문입니다 —
 * 자세한 배경은 `closet.ts` 상단 주석을 보세요.
 */

export type AuthStatus = 'anon' | 'guest' | 'user';

export interface LoginResult {
  ok: boolean;
  error?: string;
}

/**
 * 화면이 보는 계정.
 *
 * 서버가 주는 것(id·email·nickname·skinType)이 정본이고, 아직 서버에 없는
 * 항목만 personas.json에서 채웁니다. persona가 null인 계정(직접 가입)은
 * 보유 화장품 시드 없이 빈 화장대로 시작합니다 — 그게 맞는 동작입니다.
 */
export interface Account {
  id: string;
  email: string;
  nickname: string;
  skinType: SkinType | null;
  memberSince: string;
  /** 시드 데이터용. 서버 계정이 personas.json에 없으면 null */
  persona: Persona | null;
}

export interface AuthContextValue {
  status: AuthStatus;
  /** 로그인한 계정. 게스트/초기 상태면 null */
  user: Account | null;
  isUser: boolean;
  isGuest: boolean;
  /** 로그인 상태 복원이 아직 끝나지 않았다 — 화면은 기다려야 한다 */
  loading: boolean;
  /** 스토리지 키 접미사: 계정 id 또는 'guest' (anon도 'guest'로 취급) */
  scope: string;
  /** 직전 범위 — 게스트→로그인 승계 판단에 쓴다 */
  prevScope: string | null;
  login: (email: string, password: string) => Promise<LoginResult>;
  /** 이메일로 가입 — 서버에 계정을 만들고 그대로 로그인한다 */
  register: (
    email: string,
    password: string,
    nickname: string,
    /** (선택) 얼굴 사진 수집·이용 동의 */
    faceConsent?: boolean,
  ) => Promise<LoginResult>;
  loginAs: (personaId: string) => Promise<LoginResult>;
  /** 계정 정보를 서버에서 다시 받는다 (닉네임·이메일을 고친 뒤) */
  reloadMe: () => Promise<void>;
  continueAsGuest: () => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
