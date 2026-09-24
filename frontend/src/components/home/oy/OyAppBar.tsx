import { useNavigate } from 'react-router-dom';
import { useCart } from '../../../context/cart';
import { useUnreadNotifications } from '../../../hooks/useNotifications';
import { CartIcon } from '../../ui/OutlineIcons';

/**
 * 상단 앱바 — 로고(swappy) + 검색·장바구니.
 *
 * 예전에는 로고 옆 화살표로 "도메인 전환 시트"가 열려 화장품·건강식품 같은
 * 영역을 고를 수 있었다. 그런데 홈은 `onChangeVertical`을 넘긴 적이 없어서
 * **무엇을 골라도 아무 일도 일어나지 않았다.** 목록 자체도 `mocks/oliveyoung.ts`의
 * 고정값이었다. 이 앱에 화장품 말고 다른 영역이 생기면 그때 다시 만든다.
 *
 * 알림 버튼은 한동안 뺐다가 되살렸다 — 눌러도 아무 일이 없던 버튼이었는데,
 * 이제 알림함(`/notifications`)이 생겼다. 안 읽은 알림 수는 배지로 띄운다.
 */
interface OyAppBarProps {
  /** 미지정 시 장바구니 컨텍스트의 담긴 수량을 쓴다 */
  cartCount?: number;
}

export function OyAppBar({ cartCount }: OyAppBarProps) {
  const navigate = useNavigate();
  const { count: cartCtxCount } = useCart();
  const { unreadCount } = useUnreadNotifications();
  const badge = cartCount ?? cartCtxCount;

  return (
    <header className="sticky top-0 z-30 flex h-[52px] items-center justify-between bg-surface-warm px-4">
      {/* 로고(7c ≈ 마크) + 워드마크 */}
      <div className="flex items-center gap-1.5">
        <svg viewBox="-120 -120 240 240" className="h-[22px] w-[22px] shrink-0" aria-hidden>
          <path d="M-84,-34 C-56,-76 -28,8 0,-34 C28,-76 56,8 84,-34" fill="none" stroke="#2B6B52" strokeWidth="32" strokeLinecap="round" />
          <path d="M-84,40 C-56,-2 -28,82 0,40 C28,-2 56,82 84,40" fill="none" stroke="#9DCDB8" strokeWidth="32" strokeLinecap="round" />
        </svg>
        <h1 className="text-[22px] font-black italic tracking-tight text-oy-black">swappy</h1>
      </div>

      {/* 우측 아이콘 */}
      <div className="flex items-center gap-4">
        <button
          aria-label="알림"
          onClick={() => navigate('/notifications')}
          className="relative transition-transform active:scale-90"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"
              stroke="#17171C"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {unreadCount > 0 && (
            <span
              className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none text-white"
              style={{ backgroundColor: '#F8174A' }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
        <button
          aria-label="검색"
          onClick={() => navigate('/search')}
          className="transition-transform active:scale-90"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="#17171C" strokeWidth="1.8" />
            <path d="M16.5 16.5L21 21" stroke="#17171C" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <button
          aria-label="장바구니"
          onClick={() => navigate('/cart')}
          className="relative transition-transform active:scale-90"
        >
          <CartIcon size={24} className="text-[#17171C]" />
          {badge > 0 && (
            <span
              className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none text-white"
              style={{ backgroundColor: '#F8174A' }}
            >
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
