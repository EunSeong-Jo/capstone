/**
 * 얼굴 사진 AI 피부 분석 API.
 *
 * 사진은 `analyzeFace`로 한 번 올리면 서버가 분석해 점수만 돌려줍니다. 원본 사진은
 * 서버에 남지 않고, 분석 업체가 만든 항목별 분석 이미지 주소도 응답에 없습니다(서버가 받아 보관하고 `fetchAnalysisImage`로 받습니다).
 * 진단에 섞고 싶으면 응답의 `analysisId`를 `submitDiagnosis`에 실어 보냅니다 —
 * 점수를 클라이언트가 보내지 않습니다.
 *
 * 구독은 **결제 없이 기록만 만드는 데모**입니다(PG 연동이 없습니다).
 */
import { deleteJson, postJson, putJson, request, requestBlob } from './client';

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
  /** 이 등급이 받는 분석 항목 수(무료 8, 구독자 16) */
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
  /** 서버에 저장된 분석 이미지 키(얼굴 사진이 없는 투명 PNG). 동의 철회 뒤나 파일이 없는 환경에서는 비어 있다 */
  images: string[];
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

/** 분석 이력(최신순). 이미지는 서버에 없으므로 점수·분류만 온다 */
export const fetchAnalysisHistory = (limit = 20) =>
  request<AnalysisDto[]>(`/api/v1/skin-analysis?limit=${limit}`);

/** 분석 이미지(PNG) — 본인 것만 받을 수 있다. 호출한 쪽이 `URL.createObjectURL`로 쓰고 해제한다 */
export const fetchAnalysisImage = (analysisId: string, key: string, signal?: AbortSignal) =>
  requestBlob(`/api/v1/skin-analysis/${analysisId}/images/${key}`, signal);

/** 사전 검증 체크리스트 한 칸. ok가 null이면 판단하지 못했다(앞 단계가 막혔거나 근거가 없다) */
export interface PhotoCheckItemDto {
  key: string;
  label: string;
  ok: boolean | null;
  /** 걸렸을 때 보일 한 문장 */
  message: string | null;
}

export interface PhotoCheckDto {
  ok: boolean;
  /** 통과하지 못한 이유 코드(없으면 null) */
  code: string | null;
  /** 사용자에게 보일 한 문장(통과하면 null) */
  message: string | null;
  /** 판정에 쓴 측정값(얼굴 폭 어림·기울기·밝기·선명도 등). 왜 걸렸는지 볼 때 쓴다 */
  metrics: Record<string, number> | null;
  /** 항목별 결과 — 어디가 걸렸는지 한꺼번에 보여 줄 때 쓴다 */
  items: PhotoCheckItemDto[] | null;
}

/**
 * 촬영한 사진이 분석에 맞는지 **미리** 확인한다 — 분석 때 서버가 쓰는 것과 같은 검증이다.
 * 업체를 부르지 않고 분석 한도도 쓰지 않는다. 얼굴 사진 수집에 동의한 사람만 쓸 수 있다.
 */
export const checkPhoto = (image: string) =>
  postJson<PhotoCheckDto>('/api/v1/skin-analysis/check', { image });
