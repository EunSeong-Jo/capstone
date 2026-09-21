import { createContext, useContext } from 'react';
import type { SkinType } from '../types';
import type { AxisScores, DiagnosisRank } from '../data/personas';

/**
 * Context 객체·타입·훅만 담습니다.
 *
 * Provider(`DiagnosisContext.tsx`)와 파일을 나눈 이유는 Fast Refresh
 * 때문입니다 — 자세한 배경은 `closet.ts` 상단 주석을 보세요.
 */
export interface DiagnosisResult {
  skinType: SkinType;
  scores: AxisScores;
  ranks: DiagnosisRank[];
  answers?: (number | null)[];
  /** quiz=문답 진단 / persona=시드 계정 기본값 / preset=수동 선택 */
  source: 'quiz' | 'persona' | 'preset';
  ts: number;
  /** 게스트 진단이 이 계정으로 승계돼 들어왔는지 */
  succeededFromGuest?: boolean;
}

export interface DiagnosisContextValue {
  result: DiagnosisResult | null;
  /** 진단 완료(또는 페르소나 기본값)로 확정된 피부타입. 없으면 null */
  skinType: SkinType | null;
  hasDiagnosis: boolean;
  /** 직전 로그인에서 게스트 진단이 승계됐다 — 배너 1회 노출용 */
  justSucceeded: boolean;
  saveDiagnosis: (r: Omit<DiagnosisResult, 'ts'>) => void;
  clearDiagnosis: () => void;
  acknowledgeSuccession: () => void;
}

export const DiagnosisContext = createContext<DiagnosisContextValue | null>(null);

export function useDiagnosis() {
  const ctx = useContext(DiagnosisContext);
  if (!ctx) throw new Error('useDiagnosis must be used within a DiagnosisProvider');
  return ctx;
}
