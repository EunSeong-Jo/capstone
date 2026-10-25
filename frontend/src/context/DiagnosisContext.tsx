import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  chooseSkinType as postChoice,
  discardLatestDiagnosis,
  DiagnosisDto,
  fetchLatestDiagnosis,
  submitDiagnosis,
} from '../api/diagnosis';
import type { AxisScores } from '../data/personas';
import type { SkinType } from '../types';
import {
  DiagnosisContext,
  DiagnosisContextValue,
  DiagnosisResult,
} from './diagnosis';
import { useAuth } from './auth';
import { readJSON, removeKey, writeJSON } from './storage';

/**
 * 피부타입 진단 결과.
 *
 * 로그인 상태면 **서버가 정본**이다(`/api/v1/profile/skin-quiz`). 비회원은
 * `swappy:diag:v1:guest`에 쌓이고, 게스트 토큰으로 서버에도 한 벌 남는다 —
 * 로그인하면 그 토큰으로 찾아 계정에 붙인다(Soft-gate).
 *
 * 클라이언트 채점(`data/skinTypeScoring.ts`)은 지우지 않았다. 서버가 없거나
 * 느릴 때도 진단이 끝나야 하고, 그게 Soft-gate의 전제이기 때문이다. 화면은
 * 로컬 결과를 먼저 보여주고 서버 응답이 오면 그것으로 덮는다.
 */

const keyOf = (scope: string) => `swappy:diag:v1:${scope}`;

/**
 * Soft-gate 시절에 쓰던 키들.
 *
 * 비회원도 진단하고 로그인할 때 계정에 붙이는 구조였는데, 승계 장치가
 * 생기기 전에 저장된 값이 주인을 찾지 못한 채 남아 **둘러보기만 한 사람에게
 * "당신은 수부지"가 계속 보였다.** 진단을 로그인 이후로 제한하면서 이
 * 경로를 없앴고, 남아 있는 값은 마운트 때 지운다.
 */
const LEGACY_GUEST_KEYS = ['swappy:diag:v1:guest', 'swappy:diag:guestToken:v1'];

/** 서버 응답 → 화면이 쓰는 모양 */
function toResult(dto: DiagnosisDto): DiagnosisResult {
  return {
    skinType: dto.skinType,
    scores: dto.scores as unknown as AxisScores,
    ranks: dto.ranks.map((r) => ({
      rank: r.rank,
      skinType: r.skinType,
      score: r.score,
    })),
    source: 'quiz',
    photoUsed: dto.photoUsed,
    photoOnly: dto.photoOnly,
    answeredCount: dto.answeredCount,
    ts: new Date(dto.createdAt).getTime(),
  };
}

export function DiagnosisProvider({ children }: { children: ReactNode }) {
  const { scope, status, user: account, loading: authLoading } = useAuth();

  /** 진단 결과 + 그것이 어느 계정의 것인지. 계정이 바뀌면 이전 결과는 남의 것이다. */
  const [store, setStore] = useState<{ scope: string; result: DiagnosisResult | null }>(
    () => ({ scope, result: readJSON<DiagnosisResult | null>(keyOf(scope), null) }),
  );

  /**
   * 계정 전환은 **렌더 중에** 반영한다. effect에서 하면 렌더가 한 번 더 돈다.
   *
   * 로컬 사본을 먼저 넣는 이유: 새로고침 직후 피부타입이 비어 보이면 홈이
   * 기본 타입(옹달샘)으로 렌더됐다가 서버 응답에 맞춰 다시 그려진다.
   */
  if (store.scope !== scope) {
    setStore({
      scope,
      result: readJSON<DiagnosisResult | null>(
        keyOf(status === 'user' ? scope : 'guest'),
        null,
      ),
    });
  }

  const result = store.result;
  const setResult = useCallback(
    (next: DiagnosisResult | null) =>
      setStore((prev) => ({ scope: prev.scope, result: next })),
    [],
  );

  /**
   * 서버 조회를 끝낸 scope. 지금 scope와 다르면 아직 확인 전이다.
   *
   * 별도의 loading 상태를 두지 않는 이유는 저장소의 다른 훅들과 같다 —
   * effect에서 `setLoading(true)`를 부르면 렌더가 한 번 더 돈다
   * (react-hooks/set-state-in-effect).
   */
  const [settledScope, setSettledScope] = useState<string | null>(null);

  // Soft-gate 시절에 남은 게스트 진단을 지운다. 진단이 로그인 전용이 된
  // 지금은 이 키들이 있을 이유가 없고, 남아 있으면 둘러보기만 한 사람에게
  // 남의 진단처럼 보인다.
  useEffect(() => {
    LEGACY_GUEST_KEYS.forEach(removeKey);
  }, []);

  // 로그인 계정의 서버 진단 조회.
  useEffect(() => {
    if (status !== 'user') return;

    let alive = true;
    (async () => {
      const latest = await fetchLatestDiagnosis().catch(() => null);
      if (!alive) return;

      if (latest) {
        const next = toResult(latest);
        writeJSON(keyOf(scope), next);
        setResult(next);
        return;
      }

      // 서버에 진단 기록이 없는 계정. 데모 계정이면 시드 값으로 채운다.
      const persona = account?.persona ?? null;
      if (persona) {
        const next: DiagnosisResult = {
          skinType: persona.skinType,
          scores: persona.scores,
          ranks: persona.ranks,
          source: 'persona',
          ts: Date.now(),
        };
        writeJSON(keyOf(scope), next);
        setResult(next);
      }
    })()
      .catch(() => undefined)
      .finally(() => {
        // 승계·조회·페르소나 시드 중 무엇으로 끝났든 "확인은 끝났다".
        if (alive) setSettledScope(scope);
      });

    return () => {
      alive = false;
    };
  }, [scope, status, account, setResult]);

  /**
   * 진단 결과 저장.
   *
   * 로컬에 먼저 쓰고 서버에 보낸다. 서버가 돌려준 값으로 덮는 이유는
   * 순위 계산이 미묘하게 다를 수 있기 때문이다 — 같은 로직이지만 원본은
   * 서버이고, 화면이 보는 값과 DB에 남은 값이 어긋나면 안 된다.
   *
   * answers(문항별 선택 인덱스)가 있을 때만 서버에 보낸다. 수동 선택
   * ('타입 미리 정하기')은 진단이 아니므로 diagnoses에 남기지 않는다.
   */
  const saveDiagnosis = useCallback(
    (
      r: Omit<DiagnosisResult, 'ts'>,
      opts?: { analysisId?: string },
    ): Promise<DiagnosisResult> => {
      const full: DiagnosisResult = { ...r, ts: Date.now() };
      setResult(full);
      writeJSON(keyOf(scope), full);

      if (r.source !== 'quiz' || !r.answers) return Promise.resolve(full);

      const answers: Record<string, number> = {};
      r.answers.forEach((choice, i) => {
        if (choice !== null) answers[`q${i + 1}`] = choice;
      });
      if (Object.keys(answers).length === 0) return Promise.resolve(full);

      return submitDiagnosis(answers, opts?.analysisId)
        .then((dto) => {
          const next = toResult(dto);
          writeJSON(keyOf(scope), next);
          setResult(next);
          return next;
        })
        .catch(() => {
          // 서버 저장에 실패해도 화면은 로컬 결과로 계속 간다.
          return full;
        });
    },
    [scope, setResult],
  );

  const diagnoseWithPhoto = useCallback(
    async (picked: (number | null)[], analysisId: string): Promise<DiagnosisResult> => {
      const answers: Record<string, number> = {};
      picked.forEach((choice, i) => {
        if (choice !== null) answers[`q${i + 1}`] = choice;
      });
      const next = toResult(await submitDiagnosis(answers, analysisId));
      writeJSON(keyOf(scope), next);
      setResult(next);
      return next;
    },
    [scope, setResult],
  );

  const chooseSkinType = useCallback(
    async (picked: SkinType): Promise<DiagnosisResult> => {
      const next = toResult(await postChoice(picked));
      writeJSON(keyOf(scope), next);
      setResult(next);
      return next;
    },
    [scope, setResult],
  );

  const discardLatest = useCallback(async () => {
    await discardLatestDiagnosis();
    // 서버가 정본이다 — 되돌아간 이전 진단을 다시 읽는다(없으면 404 → 진단 전 상태)
    const prev = await fetchLatestDiagnosis().catch(() => null);
    if (prev) {
      const next = toResult(prev);
      writeJSON(keyOf(scope), next);
      setResult(next);
    } else {
      setResult(null);
      removeKey(keyOf(scope));
    }
  }, [scope, setResult]);

  const clearDiagnosis = useCallback(() => {
    setResult(null);
    removeKey(keyOf(scope));
  }, [scope, setResult]);

  const value = useMemo<DiagnosisContextValue>(
    () => ({
      result,
      skinType: result?.skinType ?? null,
      hasDiagnosis: !!result,
      // 비회원은 서버에 물을 것이 없다 — 로컬 값이 곧 답이다.
      loading: authLoading || (status === 'user' && settledScope !== scope),
      saveDiagnosis,
      diagnoseWithPhoto,
      chooseSkinType,
      discardLatest,
      clearDiagnosis,
    }),
    [
      result,
      authLoading,
      status,
      settledScope,
      scope,
      saveDiagnosis,
      diagnoseWithPhoto,
      chooseSkinType,
      discardLatest,
      clearDiagnosis,
    ],
  );

  return <DiagnosisContext.Provider value={value}>{children}</DiagnosisContext.Provider>;
}
