import { useCallback, useEffect, useState } from 'react';
import { fetchNotifications } from '../api/personal';
import { useAuth } from '../context/auth';

/**
 * 안 읽은 알림 수 — 상단 앱바의 배지용.
 *
 * 알림 목록 자체는 알림함 화면이 직접 부른다. 여기서는 숫자만 필요하고,
 * 홈이 열릴 때마다 목록 전체를 들고 있을 이유가 없다.
 *
 * 폴링하지 않는다. 알림은 **내가 한 행동에서 나오므로**(주문·후기·선물)
 * 가만히 있는데 새로 생기지 않는다 — 화면을 다시 열 때 갱신되면 충분하다.
 */
interface Loaded {
  key: string;
  unreadCount: number;
}

export function useUnreadNotifications() {
  const { isUser, scope, loading: authLoading } = useAuth();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [nonce, setNonce] = useState(0);

  const key = `${scope}:${nonce}`;

  useEffect(() => {
    if (authLoading || !isUser) return;

    let alive = true;
    fetchNotifications()
      .then((res) => {
        if (alive) setLoaded({ key, unreadCount: res.unreadCount });
      })
      .catch(() => {
        if (alive) setLoaded({ key, unreadCount: 0 });
      });

    return () => {
      alive = false;
    };
  }, [key, isUser, authLoading]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // 비회원은 셀 대상이 서버에 없다.
  if (!isUser) return { unreadCount: 0, reload };

  return {
    unreadCount: loaded?.key === key ? loaded.unreadCount : 0,
    reload,
  };
}
