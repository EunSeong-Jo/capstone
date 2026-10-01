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
import { postJson, request } from './client';
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
  createdAt: string;
}

const BASE = '/api/v1/profile/skin-quiz';

export const fetchQuiz = () => request<QuizDto>(`${BASE}/questions`);

/** 진단 제출. **로그인이 필요합니다** — 비회원이 보내면 서버가 401입니다. */
export const submitDiagnosis = (answers: Record<string, number>) =>
  postJson<DiagnosisDto>(BASE, { answers });

export const fetchLatestDiagnosis = () => request<DiagnosisDto>(`${BASE}/latest`);
