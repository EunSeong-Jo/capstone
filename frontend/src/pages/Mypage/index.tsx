import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { BottomNav } from '../../components/layout/BottomNav';
import { SKIN_TYPE_META } from '../../types';
import { useLikedProducts } from '../../context/LikedProductsContext';
import { useRecentlyViewed } from '../../hooks/useRecentlyViewed';

const SHOPPING_ACTIVITY = [
  { icon: '📦', label: '주문내역', path: '/mypage/order-history' },
  { icon: '🔄', label: '취소/반품/교환', path: '/mypage/cancel-return' },
  { icon: '🚚', label: '배송지 관리', path: '/mypage/shipping' },
  { icon: '🔔', label: '재입고 알림', path: '/mypage/restock' },
  { icon: '🛒', label: '자주 구매', path: '/history?tab=frequent' },
];

const BENEFITS_SUPPORT = [
  { icon: '⭐', label: '후기', path: '/mypage/reviews' },
  { icon: '🎁', label: '선물함', path: '/mypage/giftbox' },
  { icon: '🎧', label: '고객센터', path: '/mypage/customer-service' },
];

export default function MypagePage() {
  const navigate = useNavigate();
  const skinMeta = SKIN_TYPE_META['ondalsam']; // TODO: 실제 사용자 데이터로 교체
  const { likedProducts } = useLikedProducts();
  const { items: recentlyViewed } = useRecentlyViewed();

  const MENUS = [
    { icon: '❤️', label: '찜한 제품', count: likedProducts.length, onClick: () => navigate('/history?tab=liked') },
    { icon: '👁️', label: '최근 본 제품', count: recentlyViewed.length, onClick: () => navigate('/history?tab=recent') },
    { icon: '🔬', label: '피부타입 재진단', onClick: () => navigate('/qna') },
    { icon: '🔔', label: '알림 설정', onClick: () => alert('준비 중이에요') },
    { icon: '🚪', label: '로그아웃', danger: true, onClick: () => navigate('/') },
  ];

  return (
    <PageWrapper hasBottomNav>
      {/* 상단 프로필 그라디언트 */}
      <div
        className="px-6 pt-10 pb-6"
        style={{ background: 'linear-gradient(135deg, var(--primary-dark) 0%, var(--primary) 100%)' }}
      >
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-3xl">
            😊
          </div>
          <div>
            <p className="text-lg font-bold text-white">닉네임</p>
            <p className="text-sm text-white/70">user@email.com</p>
          </div>
        </div>

        {/* 피부타입 카드 */}
        <div
          className="flex items-center justify-between px-4 py-3 rounded-xl"
          style={{ background: 'rgba(255,255,255,.15)' }}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">{skinMeta.emoji}</span>
            <div>
              <p className="text-xs text-white/70">내 피부타입</p>
              <p className="text-base font-bold text-white">{skinMeta.label}</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/qna')}
            className="px-3 py-1 rounded-full text-xs font-semibold text-primary bg-white active:scale-95 transition-transform"
          >
            재진단
          </button>
        </div>
      </div>

      {/* 적립금 / Swappy머니 / 쿠폰 */}
      <div className="flex border-b border-gray-20">
        {[
          ['적립금', '2,885원', '/mypage/points'],
          ['Swappy머니', '3,450원', '/mypage/money'],
          ['쿠폰', '5장', '/mypage/coupons'],
        ].map(([label, value, path]) => (
          <button
            key={label}
            onClick={() => navigate(path)}
            className="flex-1 flex flex-col items-center py-4 active:bg-gray-5 transition-colors"
          >
            <span className="text-xl font-black text-primary">{value}</span>
            <span className="text-xs text-gray-70 mt-0.5">{label}</span>
          </button>
        ))}
      </div>

      {/* 쇼핑 활동 */}
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-sm font-bold text-gray-100 mb-2">쇼핑 활동</h2>
        <div className="grid grid-cols-5 gap-1">
          {SHOPPING_ACTIVITY.map(({ icon, label, path }) => (
            <button
              key={label}
              onClick={() => navigate(path)}
              className="flex flex-col items-center gap-1.5 py-2 active:opacity-60 transition-opacity"
            >
              <span className="text-xl">{icon}</span>
              <span className="text-[10px] text-gray-70 text-center leading-tight">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 혜택 · 지원 */}
      <div className="px-4 pt-2 pb-4">
        <h2 className="text-sm font-bold text-gray-100 mb-2">혜택 · 지원</h2>
        <div className="grid grid-cols-3 gap-1">
          {BENEFITS_SUPPORT.map(({ icon, label, path }) => (
            <button
              key={label}
              onClick={() => navigate(path)}
              className="flex flex-col items-center gap-1.5 py-2 active:opacity-60 transition-opacity"
            >
              <span className="text-xl">{icon}</span>
              <span className="text-[10px] text-gray-70 text-center leading-tight">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 통계 */}
      <div className="flex border-b border-t border-gray-20">
        {[
          ['찜한 제품', likedProducts.length],
          ['최근 본 제품', recentlyViewed.length],
          ['검색 횟수', 38],
        ].map(([label, count]) => (
          <div key={label} className="flex-1 flex flex-col items-center py-4">
            <span className="text-xl font-black text-primary">{count}</span>
            <span className="text-xs text-gray-70 mt-0.5">{label}</span>
          </div>
        ))}
      </div>

      {/* 메뉴 */}
      <div className="px-4 py-2">
        {MENUS.map(({ icon, label, count, danger, onClick }) => (
          <button
            key={label}
            className="w-full flex items-center justify-between h-14 active:bg-gray-5 transition-colors rounded-lg px-2"
            onClick={onClick}
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">{icon}</span>
              <span
                className="text-base font-medium"
                style={{ color: danger ? 'var(--accent)' : 'var(--text)' }}
              >
                {label}
              </span>
            </div>
            {count !== undefined && (
              <span className="text-sm font-semibold text-primary">{count}</span>
            )}
            {!danger && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M9 18l6-6-6-6" stroke="var(--gray50)" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
          </button>
        ))}
      </div>

      <BottomNav />
    </PageWrapper>
  );
}
