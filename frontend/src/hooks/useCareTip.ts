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
 *
 * 피부타입을 모르면 묻지 않는다
 * -----------------------------
 * `fetchCareTip`은 skinType이 필수다. 예전에는 화면이 기본값 'ondalsam'을
 * 넘겨서 옹달샘용 문구를 한 번 받아 보여준 뒤 진단이 도착하면 다시 받았다.
 * `skinPending`이면 기다리고, 진단을 한 적이 없으면(`skinType === null`)
 * 진단을 권하는 문구를 낸다 — 남의 타입 문구를 보여주지 않는다.
 */
export function useCareTip(
  skinType: SkinType | null,
  skinPending: boolean,
  condition: WeatherCondition,
): UseCareTipResult {
  const [tip, setTip] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (skinPending || skinType === null) return;

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
  }, [skinType, skinPending, condition]);

  // 진단 전에는 문구가 아니라 다음 할 일을 알린다. 이건 폴백이 아니라
  // 그 상태의 정답이다.
  if (!skinPending && skinType === null) {
    return {
      tip: '피부타입을 진단하면 오늘의 케어를 알려드려요.',
      loading: false,
      error: null,
    };
  }

  return { tip, loading: skinPending || loading, error };
}
