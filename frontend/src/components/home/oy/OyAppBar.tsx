import { useNavigate } from 'react-router-dom';
import { useCart } from '../../../context/CartContext';

interface OyAppBarProps {
  /** 미지정 시 장바구니 컨텍스트의 담긴 수량을 쓴다 */
  cartCount?: number;
}

/** 올리브영식 상단 앱바 — 로고(swappy) + 알림/검색/장바구니 */
export function OyAppBar({ cartCount }: OyAppBarProps) {
  const navigate = useNavigate();
  const { count: cartCtxCount } = useCart();
  const badge = cartCount ?? cartCtxCount;

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-[52px] px-4 bg-surface-warm">
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
        <button aria-label="알림" onClick={() => navigate('/notifications')} className="active:scale-90 transition-transform">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke="#17171C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button aria-label="검색" onClick={() => navigate('/search')} className="active:scale-90 transition-transform">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="#17171C" strokeWidth="1.8" />
            <path d="M16.5 16.5L21 21" stroke="#17171C" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <button
          aria-label="장바구니"
          onClick={() => navigate('/cart')}
          className="relative active:scale-90 transition-transform"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M6 8h12l-.9 11.2a1.8 1.8 0 01-1.8 1.65H8.7a1.8 1.8 0 01-1.8-1.65L6 8z" stroke="#17171C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M9 8.5V7a3 3 0 016 0v1.5" stroke="#17171C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {badge > 0 && (
            <span
              className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-white text-[10px] font-bold leading-none flex items-center justify-center"
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
