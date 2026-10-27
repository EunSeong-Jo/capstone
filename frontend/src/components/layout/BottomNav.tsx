import { NavLink } from 'react-router-dom';

const TABS = [
  {
    to: '/home',
    label: '홈',
    icon: (active: boolean) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? 'var(--primary)' : 'none'}>
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"
          stroke={active ? 'var(--primary)' : 'var(--gray50)'}
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 21V12h6v9" stroke={active ? 'var(--primary)' : 'var(--gray50)'}
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    to: '/category',
    label: '카테고리',
    icon: (active: boolean) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="8" height="8" rx="1.5"
          stroke={active ? 'var(--primary)' : 'var(--gray50)'}
          fill={active ? 'var(--primary-light)' : 'none'}
          strokeWidth="1.8" />
        <rect x="13" y="3" width="8" height="8" rx="1.5"
          stroke={active ? 'var(--primary)' : 'var(--gray50)'}
          fill={active ? 'var(--primary-light)' : 'none'}
          strokeWidth="1.8" />
        <rect x="3" y="13" width="8" height="8" rx="1.5"
          stroke={active ? 'var(--primary)' : 'var(--gray50)'}
          fill={active ? 'var(--primary-light)' : 'none'}
          strokeWidth="1.8" />
        <rect x="13" y="13" width="8" height="8" rx="1.5"
          stroke={active ? 'var(--primary)' : 'var(--gray50)'}
          fill={active ? 'var(--primary-light)' : 'none'}
          strokeWidth="1.8" />
      </svg>
    ),
  },
  {
    to: '/search',
    label: '검색',
    icon: (active: boolean) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="11" cy="11" r="7"
          stroke={active ? 'var(--primary)' : 'var(--gray50)'}
          strokeWidth="1.8" />
        <path d="M16.5 16.5L21 21"
          stroke={active ? 'var(--primary)' : 'var(--gray50)'}
          strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/history',
    label: '히스토리',
    icon: (active: boolean) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9"
          stroke={active ? 'var(--primary)' : 'var(--gray50)'}
          strokeWidth="1.8" />
        <path d="M12 7v5l3 3"
          stroke={active ? 'var(--primary)' : 'var(--gray50)'}
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    to: '/mypage',
    label: 'MY',
    icon: (active: boolean) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="4"
          stroke={active ? 'var(--primary)' : 'var(--gray50)'}
          strokeWidth="1.8" />
        <path d="M4 20c0-3.314 3.582-6 8-6s8 2.686 8 6"
          stroke={active ? 'var(--primary)' : 'var(--gray50)'}
          strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
];

export function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-20 bg-white border-t border-gray-20"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      <div className="flex">
        {TABS.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className="flex-1 flex flex-col items-center justify-center h-14 gap-0.5 active:scale-95 transition-transform"
          >
            {({ isActive }) => (
              <>
                {icon(isActive)}
                <span
                  className="text-[11px] font-medium"
                  style={{ color: isActive ? 'var(--primary)' : 'var(--gray50)' }}
                >
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
