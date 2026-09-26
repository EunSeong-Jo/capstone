import { useAuth } from '../context/auth';
import { useDiagnosis } from '../context/diagnosis';
import { SkinType } from '../types';

/**
 * 지금 화면이 써야 할 피부타입.
 *
 * 세 상태를 구분해서 돌려준다. 이게 이 훅의 존재 이유다.
 *
 *   loading            아직 모른다 — 화면은 스켈레톤을 그려야 한다
 *   !loading && null   진단을 한 적이 없다 — 진단을 권해야 한다
 *   값 있음             정상
 *
 * 예전에는 화면마다 이렇게 적혀 있었다.
 *
 *     const skinType = diagType ?? persona?.skinType ?? 'ondalsam';
 *
 * 그래서 진단 응답이 오기 전에도, 진단을 한 적이 없어도 **옹달샘으로
 * 확정됐다.** 마스코트·칩·캐러셀 제목·추천 요청이 전부 그 값을 썼고,
 * 사용자는 "당신은 옹달샘"이라는 단정을 본 뒤 값이 바뀌는 것을 봤다.
 * 진단을 안 한 계정에는 그 단정이 영구적으로 남았다.
 *
 * `useWeather`가 먼저 세운 규칙과 같다 — 로딩 중에는 목업이 아니라 null을
 * 내고, 폴백은 **실제로 실패했을 때만** 쓴다.
 */
export interface UseSkinTypeResult {
  /** 진단 결과(우선) 또는 데모 페르소나 값. 모르면 null */
  skinType: SkinType | null;
  /** 서버에 물어보는 중 — null이 "없다"는 뜻이 아니다 */
  loading: boolean;
}

export function useSkinType(): UseSkinTypeResult {
  const { user: persona } = useAuth();
  const { skinType: diagType, loading } = useDiagnosis();

  return {
    // 진단이 원본이고, 없으면 데모 페르소나의 시드 값을 쓴다.
    skinType: diagType ?? persona?.skinType ?? null,
    loading,
  };
}
