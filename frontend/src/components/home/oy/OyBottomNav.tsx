import { useNavigate, useLocation } from 'react-router-dom';

interface Tab {
  label: string;
  to?: string; // 라우트가 있으면 이동, 없으면 placeholder
  icon: (active: boolean) => JSX.Element;
}

const C = (active: boolean) => (active ? '#17171C' : '#9A9A9A');

const TABS: Tab[] = [
  {
    label: '홈',
    to: '/home',
    icon: (a) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill={a ? '#17171C' : 'none'}>
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" stroke={C(a)} strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: '카테고리',
    to: '/category',
    icon: (a) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M4 6h16M4 12h16M4 18h16" stroke={C(a)} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: '검색',
    to: '/search',
    icon: (a) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="11" cy="11" r="7" stroke={C(a)} strokeWidth="1.8" />
        <path d="M16.5 16.5L21 21" stroke={C(a)} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: '히스토리',
    to: '/history',
    icon: (a) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke={C(a)} strokeWidth="1.8" />
        <path d="M12 7v5l3 3" stroke={C(a)} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: '마이',
    to: '/mypage',
    icon: (a) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="4" stroke={C(a)} strokeWidth="1.8" />
        <path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" stroke={C(a)} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
];

/** 대체뭐야 5탭 하단 네비게이션 (홈·카테고리·검색·히스토리·마이, 활성=블랙) */
export function OyBottomNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-20 bg-white border-t border-oy-line"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      <div className="flex">
        {TABS.map((tab) => {
          const active = tab.to ? pathname === tab.to : false;
          return (
            <button
              key={tab.label}
              onClick={() => tab.to && navigate(tab.to)}
              className="flex-1 flex flex-col items-center justify-center h-14 gap-0.5 active:scale-95 transition-transform"
            >
              {tab.icon(active)}
              <span className={`text-[10px] ${active ? 'font-bold text-oy-black' : 'text-oy-sub'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
