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
}

export interface DiagnosisContextValue {
  result: DiagnosisResult | null;
  /** 진단 완료(또는 페르소나 기본값)로 확정된 피부타입. 없으면 null */
  skinType: SkinType | null;
  hasDiagnosis: boolean;
  /**
   * 이 계정에 진단이 있는지 **아직 모른다.**
   *
   * 로그인 직후에는 `/diagnosis/latest` 응답 전이라 `hasDiagnosis`가 잠깐
   * false다. 그때 "진단 안 했다"고 단정하면 다른 기기에서 진단한 사용자가
   * 퀴즈를 다시 본다. 판정하는 화면은 이 값이 false가 될 때까지 기다린다.
   */
  loading: boolean;
  saveDiagnosis: (r: Omit<DiagnosisResult, 'ts'>) => void;
  clearDiagnosis: () => void;
}

export const DiagnosisContext = createContext<DiagnosisContextValue | null>(null);

export function useDiagnosis() {
  const ctx = useContext(DiagnosisContext);
  if (!ctx) throw new Error('useDiagnosis must be used within a DiagnosisProvider');
  return ctx;
}
