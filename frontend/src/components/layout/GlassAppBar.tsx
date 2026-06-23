interface GlassAppBarProps {
  onSearch?: () => void;
  onNotification?: () => void;
  notificationCount?: number;
}

/** Digital Atelier 홈 전용 글래스모피즘 앱바 */
export function GlassAppBar({ onSearch, onNotification, notificationCount = 0 }: GlassAppBarProps) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-14 px-4 glass border-b border-white/40 shadow-soft">
      <h1 className="font-headline text-xl font-bold tracking-tight text-atelier-text">
        대체<span className="text-atelier-primary">뭐야</span>
      </h1>
      <div className="flex items-center gap-3">
        <button
          className="relative active:scale-90 transition-transform"
          aria-label="알림"
          onClick={onNotification}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"
              stroke="#424242" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {notificationCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-atelier-sale text-white text-[10px] font-bold flex items-center justify-center">
              {notificationCount > 9 ? '9+' : notificationCount}
            </span>
          )}
        </button>
        <button
          className="active:scale-90 transition-transform"
          aria-label="검색"
          onClick={onSearch}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="#424242" strokeWidth="1.8" />
            <path d="M16.5 16.5L21 21" stroke="#424242" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </header>
  );
}
