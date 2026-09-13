import { useNavigate, useLocation } from 'react-router-dom';

interface Tab {
  label: string;
  to: string; // 이동 라우트
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
    label: '화장대',
    to: '/closet',
    icon: (a) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C(a)} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 3h6v4l2 3v10a1.5 1.5 0 01-1.5 1.5h-7A1.5 1.5 0 017 20V10l2-3V3z" fill={a ? '#EAF5EF' : 'none'} />
        <path d="M7 13h10" />
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

/** 중앙 돌출 스캔 FAB에 들어가는 스캔 아이콘 (흰색) */
const ScanIcon = (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2" />
    <circle cx="12" cy="12" r="3.2" />
  </svg>
);

/**
 * swappy 5탭 하단 네비게이션 (홈·카테고리·검색·화장대·마이, 활성=블랙).
 * 검색 화면에 있을 땐 검색 탭이 1c·2c 스타일의 중앙 돌출 스캔 FAB로 변형되고, 누르면 /scan(성분 스캔)으로 이동한다.
 */
export function OyBottomNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-20 bg-white border-t border-oy-line overflow-visible"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      <div className="flex">
        {TABS.map((tab) => {
          const active = pathname === tab.to;
          // 검색 화면에 있을 땐 검색 탭이 중앙 돌출 스캔 FAB로 변형 (1c·2c 스타일) → 탭 시 성분 스캔(/scan)
          const isScanMode = tab.to === '/search' && active;

          if (isScanMode) {
            return (
              <div key={tab.to} className="flex-1 relative h-14">
                <button
                  onClick={() => navigate('/scan')}
                  aria-label="성분 스캔"
                  className="absolute left-1/2 -translate-x-1/2 top-[-22px] flex h-14 w-14 items-center justify-center rounded-full bg-primary-dark border-4 border-white active:scale-95 transition-transform"
                  style={{ boxShadow: '0 6px 18px rgba(43,107,82,.35)' }}
                >
                  {ScanIcon}
                </button>
                <span className="absolute left-1/2 -translate-x-1/2 bottom-1.5 text-[10px] font-bold text-primary-dark">
                  스캔
                </span>
              </div>
            );
          }

          return (
            <button
              key={tab.to}
              onClick={() => navigate(tab.to)}
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
