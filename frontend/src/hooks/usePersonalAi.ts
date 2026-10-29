import { fetchAiMemoryState, fetchBriefing, fetchMemories, fetchPreferences, fetchSkinReport } from '../api/personalAi';
import type { AiMemoryState, BriefingDto, MemoryItem, PreferenceDto, SkinReportDto } from '../api/personalAi';
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

/** 피부 변화 리포트 (`GET /me/skin-report`). 비회원은 null */
export function useSkinReport() {
  const { value, loading, failed, reload } = useServerValue<SkinReportDto>('skin-report', fetchSkinReport);
  return { report: value, loading, failed, reload };
}

/** 오늘의 개인 브리핑 (`GET /me/briefing`). 비회원은 null. 날씨가 바뀔 수 있어 서버가 1시간 캐시한다 */
export function useBriefing() {
  const { value, loading, failed, reload } = useServerValue<BriefingDto>('briefing', fetchBriefing);
  return { briefing: value, loading, failed, reload };
}
