import { useNavigate } from 'react-router-dom';
import { Icon } from './Icon';
import { CartIcon } from '../ui/OutlineIcons';

interface TopNavBarProps {
  title: string;
  onSearchClick?: () => void;
  onCartClick?: () => void;
}

export function TopNavBar({ title, onSearchClick, onCartClick }: TopNavBarProps) {
  const navigate = useNavigate();

  return (
    <div className="sticky top-0 z-10 flex items-center h-12 px-4 bg-white">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="text-gray-100 active:scale-90 transition-transform"
        aria-label="뒤로가기"
      >
        <Icon name="arrow_back" size={24} />
      </button>

      <h1 className="flex-1 text-center text-lg font-semibold text-gray-100">{title}</h1>

      <div className="flex items-center gap-2">
        <button type="button" onClick={onSearchClick} className="text-gray-100 active:scale-90 transition-transform" aria-label="검색">
          <Icon name="search" size={24} />
        </button>
        <button type="button" onClick={onCartClick} className="text-gray-100 active:scale-90 transition-transform" aria-label="장바구니">
          <CartIcon size={24} />
        </button>
      </div>
    </div>
  );
}
