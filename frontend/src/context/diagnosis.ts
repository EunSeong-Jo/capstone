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
  /** 얼굴 사진 분석이 섞인 진단인가(서버가 확정한 값만 true) */
  photoUsed?: boolean;
  /** 답한 문항 없이 사진만으로 낸 진단 */
  photoOnly?: boolean;
  /** 서버가 센 답한 문항 수 (서버 응답에서 온 결과에만 있다) */
  answeredCount?: number;
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
  /**
   * 진단 결과 저장. 로컬에 먼저 쓰고 서버에 보낸다.
   *
   * 돌려주는 Promise는 **서버가 확정한 결과**로 풀린다(서버에 보내지 않는 경우와 실패하면
   * 로컬 결과). 대부분의 호출자는 기다리지 않는다. 얼굴 사진을 섞은 진단은 서버만 최종
   * 타입을 알 수 있어서 기다려야 한다 — 로컬 채점은 QnA뿐이다.
   */
  saveDiagnosis: (
    r: Omit<DiagnosisResult, 'ts'>,
    opts?: { analysisId?: string },
  ) => Promise<DiagnosisResult>;
  /**
   * 사진 분석 id로 서버에 진단을 맡긴다 — 일부 문항만 답했거나 하나도 답하지 않은 경우.
   * 로컬 채점으로는 사진을 섞을 수 없어서 서버 결과만 쓴다. **실패하면 reject**한다
   * (가짜 로컬 결과로 풀지 않는다).
   */
  diagnoseWithPhoto: (answers: (number | null)[], analysisId: string) => Promise<DiagnosisResult>;
  /**
   * 결과 화면에서 1·2순위 중 고른 타입을 서버에 확정한다. 고른 타입이 1순위가 된다.
   * **실패하면 reject**한다 — 서버에 반영되지 않은 선택을 화면만 믿고 넘어가지 않는다.
   */
  chooseSkinType: (skinType: SkinType) => Promise<DiagnosisResult>;
  /**
   * 결과를 고르지 않고 닫았을 때: 방금 한 진단을 취소하고 기존 내 피부타입으로 되돌린다.
   * 이전 진단이 없으면 진단 전 상태가 된다. 실패하면 reject한다.
   */
  discardLatest: () => Promise<void>;
  clearDiagnosis: () => void;
}

export const DiagnosisContext = createContext<DiagnosisContextValue | null>(null);

export function useDiagnosis() {
  const ctx = useContext(DiagnosisContext);
  if (!ctx) throw new Error('useDiagnosis must be used within a DiagnosisProvider');
  return ctx;
}
