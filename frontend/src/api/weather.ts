/**
 * 날씨 API.
 *
 * 서버 응답이 camelCase라 `WeatherInfo` 타입을 그대로 씁니다.
 * 위치는 MVP라 서버가 서울로 고정합니다 — 쿼리 파라미터가 없습니다.
 */
import { WeatherInfo } from '../types';
import { request } from './client';

export function fetchWeather(signal?: AbortSignal): Promise<WeatherInfo> {
  return request<WeatherInfo>('/api/v1/weather', undefined, signal);
}
