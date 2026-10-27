import { useCallback, useEffect, useState } from 'react';
import { fetchNotifications, type NotificationsDto } from '../api/personal';
import { useAuth } from '../context/auth';
import { invalidate, load, meKey, peek, put } from '../api/queryCache';

/**
 * 배지는 홈에 들어올 때마다 그려지는데, 알림은 내 행동에서만 생긴다.
 * 1분 안에는 다시 묻지 않는다(목록을 만드는 데 서버 쿼리가 여섯 번 돈다).
 */
const UNREAD_FRESH_MS = 60 * 1000;

const unreadKey = (scope: string) => meKey(scope, 'unread');
/** 알림함이 첫 화면에 바로 그릴 목록. 배지 조회가 이미 받아 온 응답을 그대로 담아 둔다. */
export const notificationsKey = (scope: string) => meKey(scope, 'notifications');


/** 알림함을 열어 읽음 처리하면 배지를 바로 0으로 */
export function markUnreadSeen(scope: string) {
  put(unreadKey(scope), 0);
}

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
  const cacheKey = unreadKey(scope);

  useEffect(() => {
    if (authLoading || !isUser) return;

    let alive = true;
    load(
      cacheKey,
      () =>
        fetchNotifications().then((res: NotificationsDto) => {
          put(notificationsKey(scope), res);
          return res.unreadCount;
        }),
      UNREAD_FRESH_MS,
    )
      .then((unreadCount) => {
        if (alive) setLoaded({ key, unreadCount });
      })
      .catch(() => {
        if (alive) setLoaded({ key, unreadCount: 0 });
      });

    return () => {
      alive = false;
    };
  }, [key, cacheKey, isUser, authLoading, scope]);

  const reload = useCallback(() => {
    invalidate(cacheKey);
    setNonce((n) => n + 1);
  }, [cacheKey]);

  // 비회원은 셀 대상이 서버에 없다.
  if (!isUser) return { unreadCount: 0, reload };

  // 캐시가 정본이다 — 알림함에서 읽음 처리하면(put 0) 다시 받지 않아도 배지가 꺼진다.
  const cached = peek<number>(cacheKey)?.value;
  return {
    unreadCount: cached ?? (loaded?.key === key ? loaded.unreadCount : 0),
    reload,
  };
}
