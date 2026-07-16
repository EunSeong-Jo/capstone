import { useNavigate } from 'react-router-dom';

interface HeaderProps {
  title?: string;
  showBack?: boolean;
  rightSlot?: React.ReactNode;
}

export function Header({ title, showBack = false, rightSlot }: HeaderProps) {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-10 flex items-center h-14 px-4 bg-white border-b border-gray-20">
      {showBack && (
        <button
          onClick={() => navigate(-1)}
          className="mr-2 p-1 -ml-1 text-gray-100 active:scale-95 transition-transform"
          aria-label="뒤로가기"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      {title && (
        <h1 className="flex-1 text-lg font-semibold text-gray-100 truncate">{title}</h1>
      )}
      {rightSlot && <div className="ml-auto">{rightSlot}</div>}
    </header>
  );
}
