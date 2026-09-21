interface OutlineIconProps {
  size?: number;
  className?: string;
}

/** 선 굵기 1.8로 통일한 하트(찜) 아이콘 — 배경/채움 없이 선만, 찜 상태면 채워진다 */
export function HeartIcon({ size = 20, filled = false, className = '' }: OutlineIconProps & { filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} className={className}>
      <path
        d="M12 21C12 21 3 14.5 3 8.5C3 5.42 5.42 3 8.5 3C10.24 3 11.91 3.81 13 5.08C14.09 3.81 15.76 3 17.5 3C20.58 3 23 5.42 23 8.5C23 14.5 12 21 12 21Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 선 굵기 1.8로 통일한 장바구니 아이콘 — 배경/채움 없이 선만 */
export function CartIcon({ size = 20, className = '' }: OutlineIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M6 8h12l-.9 11.2a1.8 1.8 0 01-1.8 1.65H8.7a1.8 1.8 0 01-1.8-1.65L6 8z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9 8.5V7a3 3 0 016 0v1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
