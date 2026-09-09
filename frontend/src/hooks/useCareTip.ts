import { useEffect, useState } from 'react';
import { fetchCareTip } from '../api/careTip';
import { getSkinCareTip } from '../mocks/home';
import { SkinType, WeatherCondition } from '../types';

interface UseCareTipResult {
  /** 로딩 중엔 null. 로딩이 끝나면(성공이든 실패든) 항상 값이 채워진다 —
   *  실패 시 정적 폴백 문구로 채우기 때문. null이 "로딩 중"의 유일한 신호다. */
  tip: string | null;
  loading: boolean;
  /** 사용자에게 보여줄 오류 문구. 정상이면 null */
  error: string | null;
}

/**
 * 오늘의 케어 문구 조회 (AI 생성, 서버가 하루 단위로 캐싱).
 *
 * 초기값을 정적 문구가 아니라 null로 둔다 — 캐시 미스로 AI 생성이 1~2초
 * 걸릴 때, 그 시간 동안 정적 폴백 문구가 마치 실제 데이터인 것처럼 화면에
 * 떠 있는 걸 막기 위해서다(호출부가 null을 "로딩 중"으로 보고 스켈레톤을
 * 보여줘야 한다). 정적 테이블(getSkinCareTip)은 AI 생성이 실제로 실패했을
 * 때만 폴백으로 쓴다 — useWeather와 같은 방어적 설계.
 */
export function useCareTip(skinType: SkinType, condition: WeatherCondition): UseCareTipResult {
  const [tip, setTip] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetchCareTip(skinType, controller.signal)
      .then((res) => setTip(res.tip))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : '케어 문구를 불러오지 못했습니다.');
        setTip(getSkinCareTip(skinType, condition)); // 실패했을 때만 정적 폴백
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [skinType, condition]);

  return { tip, loading, error };
}
