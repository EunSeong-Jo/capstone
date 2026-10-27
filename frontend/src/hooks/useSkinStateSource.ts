import { useMemo } from 'react';
import type { SkinAxes } from '../api/analysis';
import type { AnalysisDto } from '../api/skinPhoto';
import { useDiagnosis } from '../context/diagnosis';
import { useAnalysisHistory } from './useSkinPhoto';

/**
 * 내 피부 상태(5축)를 **어디서 가져올지**.
 *
 * 숫자는 하나만 쓴다 — 출처가 둘이면 서로 다른 말을 하게 되고 정확성을 의심받는다. 우선순위:
 *   photo     가장 최근 AI 사진 분석이 있으면 항상 이것. 분석된 항목(무료 8개·구독 16개)을 전부 견준다
 *   qna       사진이 없고 문답 진단만 있을 때 — 5축으로 견주고, 사진 분석을 받으면 더 정확해진다고 안내한다
 *   none      아무것도 없음 — 사진 촬영(또는 진단)을 안내한다
 * 사진 분석 결과는 이미 서버에 저장돼 있어 다시 읽는 데 비용이 들지 않는다. 비용은 새로 촬영할 때만 든다.
 */
export type SkinStateSource = 'photo' | 'qna' | 'none';

export interface SkinStateSourceResult {
  source: SkinStateSource;
  axes: SkinAxes | null;
  /** 'photo'일 때 분석 시각 */
  photoAt: string | null;
  /** 'photo'일 때 최근 분석(항목 점수·피부 분류·확장 여부) */
  photo: AnalysisDto | null;
  /** 사진 분석 이력을 읽는 중 — 이 동안은 출처를 확정하지 않는다 */
  loading: boolean;
  reloadPhoto: () => void;
}

const toAxes = (a: { moisture: number; oil: number; sensitivity: number; pigmentation: number; trouble: number }): SkinAxes => ({
  moisture: a.moisture,
  oil: a.oil,
  sensitivity: a.sensitivity,
  pigmentation: a.pigmentation,
  trouble: a.trouble,
});

export function useSkinStateSource(): SkinStateSourceResult {
  const { result: diag, loading: diagLoading } = useDiagnosis();
  const { history, loading: historyLoading, reload } = useAnalysisHistory();

  return useMemo(() => {
    const loading = diagLoading || historyLoading;
    const photo = history?.[0] ?? null;

    if (photo) {
      return { source: 'photo' as const, axes: toAxes(photo.axes), photoAt: photo.createdAt, photo, loading, reloadPhoto: reload };
    }
    if (diag) {
      return { source: 'qna' as const, axes: toAxes(diag.scores), photoAt: null, photo: null, loading, reloadPhoto: reload };
    }
    return { source: 'none' as const, axes: null, photoAt: null, photo: null, loading, reloadPhoto: reload };
  }, [diag, diagLoading, history, historyLoading, reload]);
}
