/**
 * 오늘의 케어 문구 API.
 *
 * 서버가 피부타입 × 오늘 날씨 조합으로 하루 1회만 AI 생성해 캐싱합니다.
 * "오늘 날씨"는 서버가 직접 판단하므로(서울 고정) 프론트는 skinType만 보냅니다.
 */
import { SkinType } from '../types';
import { request } from './client';

export interface CareTipResponse {
  tip: string;
}

export function fetchCareTip(
  skinType: SkinType,
  signal?: AbortSignal,
): Promise<CareTipResponse> {
  return request<CareTipResponse>('/api/v1/care-tip', { skinType }, signal);
}
