import { useCallback, useEffect, useState } from 'react';
import { StatsDto, fetchStats } from '../api/personal';
import { useAuth } from '../context/auth';

/**
 * 대시보드 숫자 (`GET /api/v1/me/stats`).
 *
 * 전부 실제 행에서 센다. 예전에는 홈과 마이페이지에
 * `{saved: 128400, scans: 21, swaps: 9}` 같은 고정값이 박혀 있었다.
 *
 * **레벨·경험치는 없다.** 무엇으로 오르는지 정한 적이 없어서 숫자를 만들면
 * 그 자체가 또 다른 더미가 된다. 화면은 그 줄을 그리지 않는다.
 *
 * 비회원은 null이다 — 셀 대상이 서버에 없다.
 *
 * loading을 상태로 두지 않는 이유
 * -------------------------------
 * effect 본문에서 `setLoading(true)`를 부르면 렌더 → effect → 렌더가
 * 한 번 더 돈다(react-hooks/set-state-in-effect). 대신 **무엇을 요청했는지**를
 * 결과와 함께 저장하고, 지금 필요한 키와 다르면 로딩으로 본다. 상태를
 * 하나로 줄이면서 "응답이 늦게 도착해 이전 결과가 잠깐 보이는" 문제도
 * 같이 사라진다.
 */
interface Loaded {
  key: string;
  stats: StatsDto | null;
}

export function useStats() {
  const { isUser, scope, loading: authLoading } = useAuth();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [nonce, setNonce] = useState(0);

  // 이 조회를 식별하는 값. 하나라도 바뀌면 이전 결과는 남의 것이다.
  const key = `${scope}:${isUser}:${nonce}`;

  useEffect(() => {
    // 비회원은 조회하지 않는다. 그 경우의 결과(null)는 아래에서 파생하므로
    // 여기서 상태를 되돌릴 필요가 없다.
    if (authLoading || !isUser) return;

    let alive = true;
    fetchStats()
      .then((stats) => {
        if (alive) setLoaded({ key, stats });
      })
      .catch(() => {
        if (alive) setLoaded({ key, stats: null });
      });

    return () => {
      alive = false;
    };
  }, [key, isUser, authLoading]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // 세션 복원이 끝나기 전에는 비회원인지 아직 모른다. 여기서 단정하면
  // 새로고침할 때마다 "값 없음"이 스쳐 지나가고, 화면은 그 순간을 로딩과
  // 구분할 수 없다 — 그래서 레벨 줄이 없다가 갑자기 튀어나왔다.
  if (!authLoading && !isUser) return { stats: null, loading: false, reload };

  return {
    stats: loaded?.key === key ? loaded.stats : null,
    loading: authLoading || loaded?.key !== key,
    reload,
  };
}
