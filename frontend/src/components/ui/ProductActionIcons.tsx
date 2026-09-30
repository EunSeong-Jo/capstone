/**
 * 상품 카드의 좋아요·장바구니 아이콘. 꺼짐=회색, 켜짐=swappy 그린.
 * 홈 카드(ProductCardV)와 히스토리 카드(HistoryListCard)가 같은 모양을 쓴다.
 */

const ICON_OFF = '#BBBBBB';
/** 눌린 상태. swappy 브랜드 그린(index.css --ob-green) */
const ICON_ON = '#00916D';

export function LikeIcon({ on, size = 22 }: { on: boolean; size?: number }) {
  const c = on ? ICON_ON : ICON_OFF;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={on ? c : 'none'}>
      <path d="M12 20.5C12 20.5 3.5 15 3.5 9.2C3.5 6.6 5.6 4.5 8.2 4.5C9.8 4.5 11.2 5.3 12 6.5C12.8 5.3 14.2 4.5 15.8 4.5C18.4 4.5 20.5 6.6 20.5 9.2C20.5 15 12 20.5 12 20.5Z"
        stroke={c} strokeWidth="1.5" />
    </svg>
  );
}

const CART_PATH = 'M6 7h13l-1.2 9.5a2 2 0 01-2 1.75H9.2a2 2 0 01-2-1.75L6 7zM6 7L5 3.5H3';

export function CartActionIcon({ on, size = 22 }: { on: boolean; size?: number }) {
  return <CartShape size={size} color={on ? ICON_ON : ICON_OFF} strokeWidth={1.5} />;
}

/** 같은 카트 모양을 앱바처럼 색·굵기를 직접 정해서 쓸 때 */
export function CartShape({ size = 24, color = 'currentColor', strokeWidth = 1.8 }: {
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d={CART_PATH} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="21" r="0.6" fill={color} stroke={color} strokeWidth={strokeWidth - 1} />
    </svg>
  );
}
