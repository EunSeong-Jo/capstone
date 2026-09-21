import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { SkinType } from '../types';
import type { AxisScores, DiagnosisRank } from '../data/personas';
import { findPersonaById } from '../data/personas';
import { useAuth } from './AuthContext';
import { readJSON, removeKey, writeJSON } from './storage';

/**
 * 피부타입 진단 결과 보관.
 *
 * 범위(scope)별로 따로 저장한다: 게스트가 진단하면 `swappy:diag:v1:guest`에 쌓이고,
 * 로그인하면 그 게스트 결과를 로그인 계정으로 "승계"한다 — 백엔드 diagnosis.py의
 * guest_token → user_id 승계(Soft-gate)를 데모에서 재현한 것이다.
 */

const keyOf = (scope: string) => `swappy:diag:v1:${scope}`;

/** 로그인 화면에서 "이미 진단을 마친 계정인지" 확인할 때 쓴다 — 있으면 온보딩 퀴즈를 또 안 시킨다 */
export function hasSavedDiagnosis(scope: string): boolean {
  return readJSON<DiagnosisResult | null>(keyOf(scope), null) !== null;
}

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

interface DiagnosisContextValue {
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

const DiagnosisContext = createContext<DiagnosisContextValue | null>(null);

export function DiagnosisProvider({ children }: { children: ReactNode }) {
  const { scope, status } = useAuth();
  const [result, setResult] = useState<DiagnosisResult | null>(() =>
    readJSON<DiagnosisResult | null>(keyOf(scope), null),
  );
  const [justSucceeded, setJustSucceeded] = useState(false);
  const lastScope = useRef(scope);

  // 범위 전환 처리 — 로그인/로그아웃/게스트 전환 시
  useEffect(() => {
    if (lastScope.current === scope) return;
    const from = lastScope.current;
    lastScope.current = scope;

    let next = readJSON<DiagnosisResult | null>(keyOf(scope), null);

    // 게스트 → 로그인 계정 승계: 계정에 결과가 없고 게스트 결과가 있으면 옮긴다
    if (status === 'user' && from === 'guest' && !next) {
      const guest = readJSON<DiagnosisResult | null>(keyOf('guest'), null);
      if (guest) {
        next = { ...guest, succeededFromGuest: true, ts: Date.now() };
        writeJSON(keyOf(scope), next);
        removeKey(keyOf('guest')); // 승계 후 게스트 사본은 비운다
        setJustSucceeded(true);
      }
    }

    // 승계할 게 없으면 시드 계정 기본 피부타입을 초기값으로
    if (status === 'user' && !next) {
      const persona = scope !== 'guest' ? findPersonaById(scope) : undefined;
      if (persona) {
        next = {
          skinType: persona.skinType,
          scores: persona.scores,
          ranks: persona.ranks,
          source: 'persona',
          ts: Date.now(),
        };
        writeJSON(keyOf(scope), next);
      }
    }

    setResult(next);
  }, [scope, status]);

  const saveDiagnosis = useCallback(
    (r: Omit<DiagnosisResult, 'ts'>) => {
      const full: DiagnosisResult = { ...r, ts: Date.now() };
      setResult(full);
      writeJSON(keyOf(scope), full);
    },
    [scope],
  );

  const clearDiagnosis = useCallback(() => {
    setResult(null);
    removeKey(keyOf(scope));
  }, [scope]);

  const acknowledgeSuccession = useCallback(() => setJustSucceeded(false), []);

  const value = useMemo<DiagnosisContextValue>(
    () => ({
      result,
      skinType: result?.skinType ?? null,
      hasDiagnosis: !!result,
      justSucceeded,
      saveDiagnosis,
      clearDiagnosis,
      acknowledgeSuccession,
    }),
    [result, justSucceeded, saveDiagnosis, clearDiagnosis, acknowledgeSuccession],
  );

  return <DiagnosisContext.Provider value={value}>{children}</DiagnosisContext.Provider>;
}

export function useDiagnosis() {
  const ctx = useContext(DiagnosisContext);
  if (!ctx) throw new Error('useDiagnosis must be used within a DiagnosisProvider');
  return ctx;
}
