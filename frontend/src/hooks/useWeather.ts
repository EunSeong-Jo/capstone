import { useEffect, useState } from 'react';
import { fetchWeather } from '../api/weather';
import { WeatherInfo } from '../types';
import { MOCK_WEATHER } from '../mocks/home';

interface UseWeatherResult {
  weather: WeatherInfo;
  loading: boolean;
  /** 사용자에게 보여줄 오류 문구. 정상이면 null */
  error: string | null;
}

/**
 * 홈 대시보드 날씨 조회.
 *
 * MOCK_WEATHER를 초기값 겸 오류 시 폴백으로 쓴다 — ProfileDashboard의
 * weather prop이 필수라, API 실패로 화면 전체가 깨지면 안 된다(백엔드가
 * Redis 장애 시 DB로 폴백하는 것과 같은 방어적 설계).
 */
export function useWeather(): UseWeatherResult {
  const [weather, setWeather] = useState<WeatherInfo>(MOCK_WEATHER);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetchWeather(controller.signal)
      .then(setWeather)
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : '날씨를 불러오지 못했습니다.');
        // weather는 MOCK_WEATHER 기본값을 그대로 유지한다 — 화면은 안 깨진다.
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);

  return { weather, loading, error };
}
