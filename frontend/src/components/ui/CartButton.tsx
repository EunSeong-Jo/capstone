import { useNavigate } from 'react-router-dom';
import { useCart } from '../../context/cart';
import { CartShape } from './ProductActionIcons';

/**
 * 상단 앱바의 장바구니 버튼 + 담긴 수량 배지.
 *
 * 홈·카테고리·마이가 각자 만들던 것을 하나로 모았다. 마이는 숫자 '2'가
 * 고정으로 박혀 있었고 카테고리는 배지가 없어서, 화면마다 개수가 달랐다.
 * 수량은 장바구니 화면 제목(`장바구니 (N)`)과 같은 CartContext.count다.
 */
export function CartButton() {
  const navigate = useNavigate();
  const { count } = useCart();

  return (
    <button
      type="button"
      aria-label={count > 0 ? `장바구니 ${count}개` : '장바구니'}
      onClick={() => navigate('/cart')}
      className="relative transition-transform active:scale-90"
    >
      <CartShape size={24} color="#17171C" />
      {count > 0 && (
        <span
          className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none text-white"
          style={{ backgroundColor: '#F8174A' }}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}
