import { fetchAiMemoryState, fetchMemories, fetchPreferences } from '../api/personalAi';
import type { AiMemoryState, MemoryItem, PreferenceDto } from '../api/personalAi';
import { invalidate, meKey } from '../api/queryCache';
import { useServerValue } from './useSkinPhoto';

/** AI 기억 동의 상태와 개수 (`GET /me/ai-memory`). 비회원은 null */
export function useAiMemoryState() {
  const { value, loading, failed, reload } = useServerValue<AiMemoryState>('ai-memory-state', fetchAiMemoryState);
  return { state: value, loading, failed, reload };
}

/** AI가 기억하는 내 정보 목록 (`GET /me/memories`). 비회원은 null */
export function useMemories() {
  const { value, loading, failed, reload } = useServerValue<MemoryItem[]>('ai-memories', fetchMemories);
  return { memories: value, loading, failed, reload };
}

/** 내 성분 취향 (`GET /me/preferences`). 비회원은 null */
export function usePreferences() {
  const { value, loading, failed, reload } = useServerValue<PreferenceDto>('preferences', fetchPreferences);
  return { preferences: value, loading, failed, reload };
}

/** 기억을 바꾼 뒤 값들을 한꺼번에 비운다 */
export function invalidateAiMemory(scope: string) {
  invalidate(meKey(scope, 'ai-memory-state'));
  invalidate(meKey(scope, 'ai-memories'));
}
