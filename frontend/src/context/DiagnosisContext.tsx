import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  DiagnosisDto,
  claimDiagnosis,
  fetchLatestDiagnosis,
  submitDiagnosis,
} from '../api/diagnosis';
import type { AxisScores } from '../data/personas';
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
 * 비회원 진단을 나중에 계정에 붙이기 위한 토큰.
 *
 * 브라우저마다 하나면 충분하고, 승계에 성공하면 지운다.
 */
const GUEST_TOKEN_KEY = 'swappy:diag:guestToken:v1';

function guestToken(): string {
  let token = readJSON<string | null>(GUEST_TOKEN_KEY, null);
  if (!token) {
    token = crypto.randomUUID().replace(/-/g, '');
    writeJSON(GUEST_TOKEN_KEY, token);
  }
  return token;
}

/** 서버 응답 → 화면이 쓰는 모양 */
function toResult(dto: DiagnosisDto, succeeded: boolean): DiagnosisResult {
  return {
    skinType: dto.skinType,
    scores: dto.scores as unknown as AxisScores,
    ranks: dto.ranks.map((r) => ({
      rank: r.rank,
      skinType: r.skinType,
      score: r.score,
    })),
    source: 'quiz',
    ts: new Date(dto.createdAt).getTime(),
    succeededFromGuest: succeeded || undefined,
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

  const [justSucceeded, setJustSucceeded] = useState(false);

  /**
   * 서버 조회를 끝낸 scope. 지금 scope와 다르면 아직 확인 전이다.
   *
   * 별도의 loading 상태를 두지 않는 이유는 저장소의 다른 훅들과 같다 —
   * effect에서 `setLoading(true)`를 부르면 렌더가 한 번 더 돈다
   * (react-hooks/set-state-in-effect).
   */
  const [settledScope, setSettledScope] = useState<string | null>(null);

  // 로그인 계정의 서버 진단 조회 — 게스트 결과는 위에서 이미 읽었다.
  useEffect(() => {
    if (status !== 'user') return;

    let alive = true;
    (async () => {
      // 비회원으로 한 진단이 서버에 있으면 계정에 붙인다(Soft-gate).
      const token = readJSON<string | null>(GUEST_TOKEN_KEY, null);
      if (token) {
        const claimed = await claimDiagnosis(token).catch(() => null);
        if (claimed && alive) {
          const next = toResult(claimed, true);
          writeJSON(keyOf(scope), next);
          removeKey(keyOf('guest'));
          removeKey(GUEST_TOKEN_KEY);
          setResult(next);
          setJustSucceeded(true);
          return;
        }
      }

      const latest = await fetchLatestDiagnosis().catch(() => null);
      if (!alive) return;

      if (latest) {
        const next = toResult(latest, false);
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
    (r: Omit<DiagnosisResult, 'ts'>) => {
      const full: DiagnosisResult = { ...r, ts: Date.now() };
      setResult(full);
      writeJSON(keyOf(scope), full);

      if (r.source !== 'quiz' || !r.answers) return;

      const answers: Record<string, number> = {};
      r.answers.forEach((choice, i) => {
        if (choice !== null) answers[`q${i + 1}`] = choice;
      });
      if (Object.keys(answers).length === 0) return;

      submitDiagnosis(answers, status === 'user' ? undefined : guestToken())
        .then((dto) => {
          const next = toResult(dto, false);
          writeJSON(keyOf(scope), next);
          setResult(next);
        })
        .catch(() => {
          // 서버 저장에 실패해도 화면은 로컬 결과로 계속 간다.
        });
    },
    [scope, status, setResult],
  );

  const clearDiagnosis = useCallback(() => {
    setResult(null);
    removeKey(keyOf(scope));
  }, [scope, setResult]);

  const acknowledgeSuccession = useCallback(() => setJustSucceeded(false), []);

  const value = useMemo<DiagnosisContextValue>(
    () => ({
      result,
      skinType: result?.skinType ?? null,
      hasDiagnosis: !!result,
      // 비회원은 서버에 물을 것이 없다 — 로컬 값이 곧 답이다.
      loading: authLoading || (status === 'user' && settledScope !== scope),
      justSucceeded,
      saveDiagnosis,
      clearDiagnosis,
      acknowledgeSuccession,
    }),
    [
      result,
      authLoading,
      status,
      settledScope,
      scope,
      justSucceeded,
      saveDiagnosis,
      clearDiagnosis,
      acknowledgeSuccession,
    ],
  );

  return <DiagnosisContext.Provider value={value}>{children}</DiagnosisContext.Provider>;
}
