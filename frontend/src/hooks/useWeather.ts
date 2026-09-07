import { useEffect, useState } from 'react';
import { fetchWeather } from '../api/weather';
import { WeatherInfo } from '../types';
import { MOCK_WEATHER } from '../mocks/home';

interface UseWeatherResult {
  /** 로딩 중엔 null. 로딩이 끝나면(성공이든 실패든) 항상 값이 채워진다 —
   *  실패 시 MOCK_WEATHER로 폴백하기 때문. null이 "로딩 중"의 유일한 신호다. */
  weather: WeatherInfo | null;
  loading: boolean;
  /** 사용자에게 보여줄 오류 문구. 정상이면 null */
  error: string | null;
}

/**
 * 홈 대시보드 날씨 조회.
 *
 * 초기값을 MOCK_WEATHER가 아니라 null로 둔다 — 로딩 중에 더미 날씨가
 * 잠깐이라도 실제 데이터처럼 화면에 뜨는 걸 막기 위해서다(호출부가 null을
 * "로딩 중"으로 보고 스켈레톤을 보여줘야 한다). MOCK_WEATHER는 API가 실제로
 * 실패했을 때만 폴백으로 쓴다 — ProfileDashboard의 weather prop이 필수라,
 * 실패해도 화면 전체가 깨지면 안 된다(백엔드가 Redis 장애 시 DB로
 * 폴백하는 것과 같은 방어적 설계).
 */
export function useWeather(): UseWeatherResult {
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetchWeather(controller.signal)
      .then(setWeather)
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : '날씨를 불러오지 못했습니다.');
        setWeather(MOCK_WEATHER); // 실패했을 때만 폴백 — 로딩 중엔 여전히 null
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);

  return { weather, loading, error };
}
