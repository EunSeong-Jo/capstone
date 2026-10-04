import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../../components/layout/Header';
import { PageWrapper } from '../../components/layout/PageWrapper';
import {
  NotificationDto,
  fetchNotifications,
  markNotificationsSeen,
} from '../../api/personal';
import { useAuth } from '../../context/auth';
import { markUnreadSeen } from '../../hooks/useNotifications';

/**
 * 알림함 (`GET /api/v1/me/notifications`).
 *
 * **저장된 알림이 아니다.** 주문·포인트·후기·선물·진단 기록에서 서버가
 * 만들어 준다 — 행동할 때마다 알림 행을 심지 않으므로 빠뜨릴 일이 없고,
 * 과거에 한 일까지 소급해서 보인다.
 *
 * 예전 판은 `mocks/notifications.ts`의 4건을 보여줬다. "21,000원 →
 * 18,900원", "재입고 신청한 상품이 들어왔어요" 같은 것들이었는데, 가격
 * 이력도 재입고 신청 기능도 없어서 일어난 적 없는 일이었다.
 *
 * 읽음은 건별이 아니라 **시각 하나로 끊는다**(`notifications_seen_at`).
 * 화면을 연 것이 곧 읽은 것이라, 들어올 때 한 번 표시한다.
 */
const ICONS: Record<string, string> = {
  order: '📦',
  point: '🪙',
  review: '⭐',
  gift: '🎁',
  diagnosis: '🧪',
};

/** "방금 전 · 2시간 전 · 어제 · 3일 전 · 2026.06.20" */
function ago(iso: string): string {
  const then = new Date(iso).getTime();
  const min = Math.floor((Date.now() - then) / 60000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  const day = Math.floor(hour / 24);
  if (day === 1) return '어제';
  if (day < 7) return `${day}일 전`;
  return new Date(then)
    .toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
    .replace(/\.$/, '');
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { scope } = useAuth();
  const [items, setItems] = useState<NotificationDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchNotifications()
      .then((res) => {
        if (!alive) return;
        // 받은 그대로 그린다. 읽음 표시는 아래에서 따로 보내고, 화면의
        // unread 배지는 이번에 연 시점 기준으로 남겨 둔다 — 열자마자
        // 배지가 사라지면 무엇이 새로 왔는지 볼 수 없다.
        setItems(res.items);
      })
      .catch(() => alive && setItems([]))
      .finally(() => alive && setLoading(false));

    void markNotificationsSeen().catch(() => undefined);
    // 상단 바 배지는 캐시를 본다. 여기서 바로 꺼 둔다.
    markUnreadSeen(scope);

    return () => {
      alive = false;
    };
  }, [scope]);

  return (
    <PageWrapper className="bg-surface-warm">
      <Header showBack title="알림" />

      {loading ? (
        <div className="animate-pulse space-y-2 p-4">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-white" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="px-8 py-20 text-center">
          <span className="text-5xl">🔔</span>
          <p className="mt-3 text-base font-semibold text-gray-100">알림이 없어요</p>
          <p className="mt-1 text-sm leading-relaxed text-gray-50">
            주문하거나 후기를 쓰면 여기에 쌓여요
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-10 bg-white">
          {items.map((n) => (
            <button
              key={n.id}
              type="button"
              disabled={n.link === null}
              onClick={() => n.link !== null && navigate(n.link)}
              className={`flex w-full gap-3 px-4 py-3.5 text-left disabled:cursor-default ${
                n.unread ? 'bg-primary-light/30' : ''
              }`}
            >
              <span className="mt-0.5 shrink-0 text-xl">{ICONS[n.kind] ?? '🔔'}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold leading-snug text-gray-100">{n.title}</p>
                  {n.unread && (
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#F8174A]" />
                  )}
                </div>
                <p className="mt-0.5 text-[13px] leading-relaxed text-gray-70">{n.body}</p>
                <p className="mt-1 text-[11px] text-gray-50">{ago(n.at)}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </PageWrapper>
  );
}
