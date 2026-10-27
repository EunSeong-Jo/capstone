/**
 * 진단 API (Task 13).
 *
 * 문항과 채점은 프론트에도 있다(`data/onboarding.ts`, `data/skinTypeScoring.ts`).
 * 같은 계산이 두 곳에 있는 건 의도한 것으로, 비회원이 네트워크 없이도 진단을
 * 끝낼 수 있어야 하기 때문입니다(PRD의 Soft-gate). 서버는 그 결과를 검증·보관합니다.
 *
 * **선택지 가중치는 서버가 내려주지 않습니다.** 채점 기준을 알면 원하는 타입이
 * 나오도록 답을 고를 수 있어서입니다.
 */
import { deleteJson, patchJson, postJson, request } from './client';
import { SkinType } from '../types';

export interface QuizOptionDto {
  orderNo: number;
  label: string;
}

export interface QuizQuestionDto {
  code: string;
  axis: string;
  body: string;
  orderNo: number;
  options: QuizOptionDto[];
}

export interface QuizDto {
  version: string;
  questions: QuizQuestionDto[];
}

export interface RankDto {
  rank: number;
  skinType: SkinType;
  score: number;
}

export interface DiagnosisDto {
  id: number;
  skinType: SkinType;
  scores: Record<string, number>;
  ranks: RankDto[];
  /** 1·2순위가 붙어 있다 — "OO에 가깝지만 XX 성향도 있어요" */
  borderline: boolean;
  /** 얼굴 사진 분석이 섞인 진단인가. false면 QnA 100% */
  photoUsed: boolean;
  /** 답한 문항 없이 사진만으로 낸 진단 */
  photoOnly: boolean;
  /** 답한 문항 수 (사진을 쓰면서 일부만 답했으면 "n문항 + 사진") */
  answeredCount: number;
  createdAt: string;
}

const BASE = '/api/v1/profile/skin-quiz';

export const fetchQuiz = () => request<QuizDto>(`${BASE}/questions`);

/**
 * 진단 제출. **로그인이 필요합니다** — 비회원이 보내면 서버가 401입니다.
 *
 * `analysisId`는 얼굴 사진 분석(`analyzeFace`)의 id입니다. 있으면 서버가 저장된 분석
 * 점수를 QnA와 섞고, 없으면 QnA 100%입니다. 점수 자체는 보내지 않습니다 — 클라이언트가
 * 보낸 점수로 타입을 정할 수 있으면 진단이 의미를 잃습니다.
 *
 * `answers`는 비워도 됩니다 — 이때는 `analysisId`가 필요하고 사진 5축만으로 진단합니다.
 * 일부 문항만 답하면 서버가 답한 문항의 축만 사진과 섞습니다.
 */
export const submitDiagnosis = (answers: Record<string, number>, analysisId?: string) =>
  postJson<DiagnosisDto>(BASE, analysisId ? { answers, analysisId } : { answers });

export const fetchLatestDiagnosis = () => request<DiagnosisDto>(`${BASE}/latest`);

/**
 * 결과 화면에서 1·2순위 중 하나를 고른다. 최신 진단의 1·2순위만 받는다(그 밖은 422).
 * 고른 타입이 1순위가 되어 `latest`와 프로필·추천이 모두 같은 값을 본다.
 */
export const chooseSkinType = (skinType: SkinType) => patchJson<DiagnosisDto>(`${BASE}/latest`, { skinType });

/** 방금 한 진단을 취소하고 기존 내 피부타입으로 되돌린다(결과를 고르지 않고 닫았을 때) */
export const discardLatestDiagnosis = () => deleteJson<void>(`${BASE}/latest`);
