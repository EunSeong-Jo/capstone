import { useCallback, useEffect, useState } from 'react';
import { OrderDto, fetchOrders } from '../api/personal';
import { useAuth } from '../context/auth';

/**
 * 내 주문 목록 (`GET /api/v1/me/orders`).
 *
 * 주문내역·주문상세·배송조회 세 화면이 같은 목록을 본다. 예전에는 훅이
 * 실제 주문 뒤에 `seedOrders` 3건(ORD-2026041101 등)을 항상 덧붙였다 —
 * 주문한 적이 없어도 화면에 주문이 있었다는 뜻이다. 지금은 서버가 전부고,
 * **빈 목록은 정상**이다.
 *
 * loading을 상태로 두지 않는 이유는 `useStats`와 같다 — 무엇을 요청했는지를
 * 결과와 함께 담아 두고, 지금 필요한 키와 다르면 로딩으로 본다.
 */
interface Loaded {
  key: string;
  orders: OrderDto[];
}

/** 매번 새 배열을 만들면 이걸 의존성으로 쓰는 쪽이 헛돈다. */
const EMPTY: OrderDto[] = [];

export interface UseOrdersResult {
  orders: OrderDto[];
  loading: boolean;
  /** 비회원이라 조회 자체를 하지 않았다 — 빈 목록과 구분해야 한다. */
  isGuest: boolean;
  reload: () => void;
}

export function useOrders(): UseOrdersResult {
  const { isUser, scope, loading: authLoading } = useAuth();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [nonce, setNonce] = useState(0);

  // 계정이 바뀌면 이전 목록은 남의 주문이다.
  const key = `${scope}:${nonce}`;

  useEffect(() => {
    if (authLoading || !isUser) return;

    let alive = true;
    fetchOrders()
      .then((orders) => {
        if (alive) setLoaded({ key, orders });
      })
      .catch(() => {
        if (alive) setLoaded({ key, orders: [] });
      });

    return () => {
      alive = false;
    };
  }, [key, isUser, authLoading]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // 세션 복원이 끝나기 전에는 비회원인지 아직 모른다. 여기서 단정하면
  // 새로고침할 때마다 "주문내역이 없어요"가 한 번 스쳐 지나간다.
  if (!authLoading && !isUser) {
    return { orders: EMPTY, loading: false, isGuest: true, reload };
  }

  return {
    orders: loaded?.key === key ? loaded.orders : EMPTY,
    loading: authLoading || loaded?.key !== key,
    isGuest: false,
    reload,
  };
}
