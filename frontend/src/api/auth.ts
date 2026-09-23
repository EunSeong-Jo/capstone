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
  /** 캐릭터 꾸미기 장식. null이면 없음. */
  decorationId: number | null;
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

/**
 * 이메일(= 로그인 id) 변경. 서버가 현재 비밀번호를 확인합니다 —
 * 틀리면 401, 이미 쓰는 주소면 409.
 */
export function updateMyEmail(
  email: string,
  currentPassword: string,
): Promise<AuthUser> {
  return patchJson<AuthUser>('/api/v1/me', { email, currentPassword });
}

/**
 * 비밀번호 변경.
 *
 * 서버가 이 계정의 리프레시 토큰을 전부 끊고 새 한 벌을 내줍니다. 그래서
 * 응답의 토큰을 반드시 저장해야 합니다 — 안 하면 방금 바꾼 본인이 다음
 * 갱신에서 튕깁니다.
 */
export function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<TokenBundle> {
  return postJson<TokenBundle>('/api/v1/auth/password', {
    currentPassword,
    newPassword,
  });
}

export function fetchMyProfile(): Promise<UserProfileOut> {
  return request<UserProfileOut>('/api/v1/me/profile');
}

/**
 * 프로필 부분 수정. 보내지 않은 필드는 서버가 건드리지 않습니다.
 *
 * `decorationId: 0`은 **장식 해제**입니다 — `null`을 보내면 "안 보냄"과
 * 구분되지 않아 해제할 방법이 없습니다.
 */
export function updateMyProfile(
  patch: Partial<{
    skinType: string;
    budgetMin: number;
    budgetMax: number;
    domains: string[];
    decorationId: number;
  }>,
): Promise<UserProfileOut> {
  return patchJson<UserProfileOut>('/api/v1/me/profile', patch);
}
