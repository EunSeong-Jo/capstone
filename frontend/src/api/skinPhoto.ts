/**
 * 얼굴 사진 AI 피부 분석 API.
 *
 * 사진은 `analyzeFace`로 한 번 올리면 서버가 분석해 점수만 돌려줍니다. 원본 사진은
 * 서버에 남지 않고, 분석 업체가 만든 얼굴 위 분석 이미지 주소도 응답에 없습니다.
 * 진단에 섞고 싶으면 응답의 `analysisId`를 `submitDiagnosis`에 실어 보냅니다 —
 * 점수를 클라이언트가 보내지 않습니다.
 *
 * 구독은 **결제 없이 기록만 만드는 데모**입니다(PG 연동이 없습니다).
 */
import { deleteJson, postJson, putJson, request } from './client';

const ME = '/api/v1/me';

export interface ConsentDto {
  granted: boolean;
  /** 서버가 지금 받고 있는 동의 문구의 버전 */
  currentVersion: string;
  agreedAt: string | null;
}

export interface SubscriptionDto {
  /** 기간이 남은 구독이 있다(해지했어도 기간 끝까지는 true) */
  active: boolean;
  plan: string | null;
  status: 'active' | 'cancelled' | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  /** 결제가 붙어 있지 않다는 표시 */
  demo: boolean;
}

export interface QuotaDto {
  plan: 'free' | 'subscriber';
  /** 이번 달 허용 횟수. 얼굴 사진 수집에 동의하지 않았으면 0 */
  allowance: number;
  used: number;
  remaining: number;
  resetsAt: string;
  consentGranted: boolean;
  /** 이 등급이 받는 분석 항목 수(무료 8, 구독자 12) */
  concernCount: number;
  extended: boolean;
}

export interface AxesDto {
  moisture: number;
  oil: number;
  sensitivity: number;
  pigmentation: number;
  trouble: number;
}

export interface ConcernDto {
  /** oiliness / moisture / redness / age_spot / acne / pore / wrinkle / firmness … */
  key: string;
  /** 0~100, **높을수록 좋다** */
  score: number;
}

export interface SkinTypesDto {
  whole: string | null;
  tZone: string | null;
  uZone: string | null;
}

export interface AnalysisDto {
  analysisId: string;
  createdAt: string;
  axes: AxesDto;
  skinTypes: SkinTypesDto;
  concerns: ConcernDto[];
  extended: boolean;
  /** 이번 분석 뒤 남은 횟수. 최근 분석 조회에서는 null */
  remaining: number | null;
}

export const fetchConsent = () => request<ConsentDto>(`${ME}/consents/face-photo`);

export const setConsent = (agreed: boolean) =>
  putJson<ConsentDto>(`${ME}/consents/face-photo`, { agreed });

export const fetchSubscription = () => request<SubscriptionDto>(`${ME}/subscription`);
export const startSubscription = () => postJson<SubscriptionDto>(`${ME}/subscription`, {});
export const cancelSubscription = () => deleteJson<SubscriptionDto>(`${ME}/subscription`);

export const fetchQuota = () => request<QuotaDto>(`${ME}/skin-analysis/quota`);

/** 얼굴 사진 분석. `image`는 JPEG data URL. 한도는 성공했을 때만 쓰입니다. */
export const analyzeFace = (image: string) =>
  postJson<AnalysisDto>('/api/v1/skin-analysis', { image });

export const fetchLatestAnalysis = () => request<AnalysisDto>('/api/v1/skin-analysis/latest');
