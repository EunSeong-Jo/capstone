import { useNavigate } from 'react-router-dom';
import { CartButton } from '../ui/CartButton';

/**
 * 상단 우측 공용 버튼 묶음 — 검색 · (홈) · 장바구니.
 *
 * 카테고리 상세와 제품 상세가 각자 만들던 것을 하나로 모았다. 예전에는 카테고리 상세의
 * 버튼이 아무 곳으로도 연결되지 않았고(핸들러 미전달) 장바구니 아이콘도 홈과 달랐다.
 * 장바구니는 수량 배지가 있는 `CartButton`을 그대로 쓴다.
 *
 * `showHome`: 하단 탭이 없는 깊은 화면(제품 상세)에서 한 번에 홈으로 나가게 한다.
 * 대체품·비교·상세를 연달아 들어가도 뒤로가기를 여러 번 누르지 않는다.
 */
export function HeaderActions({ showHome = false }: { showHome?: boolean }) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        aria-label="검색"
        onClick={() => navigate('/search')}
        className="transition-transform active:scale-90"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="7" stroke="#17171C" strokeWidth="1.8" />
          <path d="M16.5 16.5L21 21" stroke="#17171C" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
      {showHome && (
        <button
          type="button"
          aria-label="홈"
          onClick={() => navigate('/home')}
          className="transition-transform active:scale-90"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 10.5L12 4l8 6.5V19a1 1 0 01-1 1h-4.5v-5.5h-5V20H5a1 1 0 01-1-1v-8.5z"
              stroke="#17171C"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
      <CartButton />
    </div>
  );
}
