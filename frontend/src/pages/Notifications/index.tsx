import { useState } from 'react';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Header } from '../../components/layout/Header';
import { NOTIFICATIONS, NotificationItem } from '../../mocks/notifications';
import { readJSON, writeJSON } from '../../context/storage';

const READ_KEY = 'swappy:notifications:readIds:v1';

function withPersistedReadState(): NotificationItem[] {
  const readIds = readJSON<number[]>(READ_KEY, []);
  return NOTIFICATIONS.map((n) => (readIds.includes(n.id) ? { ...n, unread: false } : n));
}

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>(withPersistedReadState);

  const persistRead = (ids: number[]) => writeJSON(READ_KEY, ids);

  const markAllRead = () => {
    setItems((prev) => prev.map((n) => ({ ...n, unread: false })));
    persistRead(NOTIFICATIONS.map((n) => n.id));
  };

  const markOneRead = (id: number) => {
    setItems((prev) => {
      const next = prev.map((n) => (n.id === id ? { ...n, unread: false } : n));
      persistRead(next.filter((n) => !n.unread).map((n) => n.id));
      return next;
    });
  };

  return (
    <PageWrapper className="bg-surface-warm">
      <Header
        showBack
        title="알림"
        rightSlot={
          <button
            onClick={markAllRead}
            className="text-sm font-semibold text-primary active:opacity-60 transition-opacity"
          >
            모두 읽음
          </button>
        }
      />

      <div className="bg-white">
        {items.map((n, i) => (
          <button
            key={n.id}
            type="button"
            onClick={() => markOneRead(n.id)}
            className={`flex w-full items-start gap-3 px-4 py-4 text-left ${i < items.length - 1 ? 'border-b border-gray-10' : ''}`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-light text-base">
              {n.icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-gray-100">{n.title}</p>
              <p className="mt-1 text-[13px] leading-snug text-gray-70">{n.body}</p>
              <p className="mt-1.5 text-xs text-gray-50">{n.time}</p>
            </div>
            {n.unread && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent" />}
          </button>
        ))}
      </div>
    </PageWrapper>
  );
}
