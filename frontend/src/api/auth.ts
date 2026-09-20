/**
 * 인증 API (Task 12).
 *
 * 토큰 보관은 `tokenStore.ts`가 맡고, 헤더 주입과 401 재시도는 `client.ts`가
 * 합니다. 이 파일은 요청 모양만 정의합니다.
 */
import { patchJson, postJson, request } from './client';
import { SkinType } from '../types';

export interface AuthUser {
  id: string;
  email: string;
  nickname: string | null;
  provider: string;
  createdAt: string;
  /** 최신 진단 1순위. 진단 전 가입이면 null입니다. */
  skinType: SkinType | null;
}

export interface TokenBundle {
  accessToken: string;
  refreshToken: string;
  /** 남은 초. 만료 시각이 아니라 기간이라 기기 시계가 어긋나도 안전합니다. */
  accessExpiresIn: number;
  user: AuthUser;
}

export interface UserProfileOut {
  skinType: SkinType | null;
  scores: Record<string, number> | null;
  budgetMin: number | null;
  budgetMax: number | null;
  domains: string[] | null;
}

export function signup(
  email: string,
  password: string,
  nickname?: string,
): Promise<TokenBundle> {
  return postJson<TokenBundle>('/api/v1/auth/signup', { email, password, nickname });
}

export function login(email: string, password: string): Promise<TokenBundle> {
  return postJson<TokenBundle>('/api/v1/auth/login', { email, password });
}

export function refreshTokens(refreshToken: string): Promise<TokenBundle> {
  return postJson<TokenBundle>('/api/v1/auth/refresh', { refreshToken });
}

export function logout(refreshToken: string): Promise<void> {
  // 204라 본문이 없습니다. postJson은 JSON을 기대하므로 여기서만 fetch를 씁니다.
  return fetch('/api/v1/auth/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  }).then(() => undefined);
}

export function fetchMe(): Promise<AuthUser> {
  return request<AuthUser>('/api/v1/me');
}

/** 닉네임 수정. 서버가 정본이고, UserProfileContext는 그 값을 비춥니다. */
export function updateMe(nickname: string): Promise<AuthUser> {
  return patchJson<AuthUser>('/api/v1/me', { nickname });
}

export function fetchMyProfile(): Promise<UserProfileOut> {
  return request<UserProfileOut>('/api/v1/me/profile');
}
