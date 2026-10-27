import { useNavigate } from 'react-router-dom';
import { Icon } from './Icon';
import { HeaderActions } from '../layout/HeaderActions';

interface TopNavBarProps {
  title: string;
}

/** 카테고리 화면 상단. 바탕은 홈 앱바와 같은 `surface-warm`, 우측은 공용 검색·장바구니(`HeaderActions`). */
export function TopNavBar({ title }: TopNavBarProps) {
  const navigate = useNavigate();

  return (
    <div className="sticky top-0 z-10 flex items-center h-12 px-4 bg-surface-warm">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="text-gray-100 active:scale-90 transition-transform"
        aria-label="뒤로가기"
      >
        <Icon name="arrow_back" size={24} />
      </button>

      <h1 className="flex-1 text-center text-lg font-semibold text-gray-100">{title}</h1>

      <HeaderActions />
    </div>
  );
}
