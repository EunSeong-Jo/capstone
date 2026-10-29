/**
 * 퍼스널 AI API — AI 기억(챗봇이 대화에서 기억해 둔 내 정보)과 내 성분 취향.
 *
 * 기억은 **동의한 사용자에게만** 쌓이고, 사용자가 보고·고치고·지울 수 있다(`/mypage/settings/ai-memory`).
 * 취향은 후기·찜·재구매·화장대에서 서버가 계산해 주는 값이다(신호가 모자라면 `active=false`).
 */
import { deleteJson, patchJson, postJson, putJson, request } from './client';

const ME = '/api/v1/me';

export interface AiMemoryState {
  enabled: boolean;
  version: string;
  agreedAt: string | null;
  count: number;
  limit: number;
}

export interface MemoryItem {
  id: number;
  text: string;
  kind: 'preference' | 'avoid' | 'concern' | 'fact';
  /** explicit 사용자가 "기억해"라고 함 · auto 대화에서 뽑음 · user 직접 씀 */
  source: 'explicit' | 'auto' | 'user';
  enabled: boolean;
  updatedAt: string;
}

export const fetchAiMemoryState = () => request<AiMemoryState>(`${ME}/ai-memory`);
export const setAiMemoryEnabled = (enabled: boolean) => putJson<AiMemoryState>(`${ME}/ai-memory`, { enabled });
export const fetchMemories = () => request<MemoryItem[]>(`${ME}/memories`);
export const addMemory = (text: string) => postJson<MemoryItem>(`${ME}/memories`, { text });
export const patchMemory = (id: number, body: { text?: string; enabled?: boolean }) =>
  patchJson<MemoryItem>(`${ME}/memories/${id}`, body);
export const deleteMemory = (id: number) => deleteJson<void>(`${ME}/memories/${id}`);
export const deleteAllMemories = () => deleteJson<void>(`${ME}/memories`);

export interface PreferenceIngredient {
  ingredientId: number;
  name: string;
  /** 가장 큰 성분을 100으로 한 상대 세기 */
  weight: number;
  /** 이 성분이 들어 있어서 좋아했거나(또는 별로였던) 내 제품 */
  products: { id: number; name: string }[];
}

export interface PreferenceDto {
  active: boolean;
  signalCount: number;
  minSignals: number;
  sources: Record<string, number>;
  liked: PreferenceIngredient[];
  disliked: PreferenceIngredient[];
  message: string;
}

export const fetchPreferences = () => request<PreferenceDto>(`${ME}/preferences`);
